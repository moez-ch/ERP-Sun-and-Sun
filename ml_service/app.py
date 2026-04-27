import json, os, re, io
from PIL import Image
import numpy as np
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from classifier import EmailClassifier
from trainer import load_all_data, train_model, LABELED_PATH, POSITIVE_DIR, NEGATIVE_DIR

# Lazy-load EasyOCR so classifier still works if easyocr isn't installed yet
_ocr_reader = None
def get_ocr_reader():
    global _ocr_reader
    if _ocr_reader is None:
        import easyocr
        _ocr_reader = easyocr.Reader(["tr", "en"], gpu=False)
    return _ocr_reader

app = FastAPI(title="Sun & Sun Email Classifier")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

classifier = EmailClassifier()

class EmailIn(BaseModel):
    text: str

class LabelIn(BaseModel):
    text: str
    label: str  # "positive" | "negative"

@app.post("/classify")
def classify(body: EmailIn):
    if not body.text.strip():
        raise HTTPException(400, "text is required")
    return classifier.classify(body.text)

@app.post("/label")
def label(body: LabelIn):
    if body.label not in ("positive", "negative"):
        raise HTTPException(400, "label must be 'positive' or 'negative'")
    with open(LABELED_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    data.append({"text": body.text, "label": body.label})
    with open(LABELED_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return {"success": True, "total_labeled": len(data)}

@app.post("/train")
def train():
    result = train_model()
    if result["success"]:
        classifier.reload()
    return result

@app.get("/status")
def status():
    with open(LABELED_PATH, "r", encoding="utf-8") as f:
        labeled = json.load(f)

    pos_labeled = sum(1 for x in labeled if x["label"] == "positive")
    neg_labeled = sum(1 for x in labeled if x["label"] == "negative")

    pos_files = len([f for f in os.listdir(POSITIVE_DIR) if f.endswith(".txt")]) if os.path.isdir(POSITIVE_DIR) else 0
    neg_files = len([f for f in os.listdir(NEGATIVE_DIR) if f.endswith(".txt")]) if os.path.isdir(NEGATIVE_DIR) else 0

    total_pos = pos_labeled + pos_files
    total_neg = neg_labeled + neg_files

    return {
        "model_type":      classifier.model_type,
        "total_labeled":   len(labeled),
        "positive_total":  total_pos,
        "negative_total":  total_neg,
        "positive_files":  pos_files,
        "negative_files":  neg_files,
        "can_train":       total_pos >= 10 and total_neg >= 10,
    }

@app.post("/ocr")
async def ocr(file: UploadFile = File(...)):
    contents = await file.read()
    try:
        from PIL import Image
        import numpy as np
        reader = get_ocr_reader()

        img = Image.open(io.BytesIO(contents)).convert("RGB")

        # Try 4 rotations; pick the one with highest mean confidence
        best_results, best_score = None, -1
        for angle in [0, 90, 180, 270]:
            rotated = img.rotate(angle, expand=True)
            arr = np.array(rotated)
            res = reader.readtext(arr, detail=1, paragraph=False)
            score = sum(r[2] for r in res) / max(len(res), 1)
            if score > best_score and len(res) > 2:
                best_score = score
                best_results = res

        if not best_results:
            raise HTTPException(422, "No text found in image")

        best_results.sort(key=lambda r: (r[0][0][1] + r[0][2][1]) / 2)
        full_text = "\n".join(r[1] for r in best_results if r[2] > 0.1)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"OCR failed: {e}")

    fields = parse_tax_certificate(full_text)
    return {"ok": True, "rawText": full_text, "fields": fields}

def parse_tax_certificate(text: str) -> dict:
    fields = {"party2_name": "", "party2_tax_office": "", "party2_tax_no": "", "party2_address": ""}
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    flat = " ".join(lines)

    # ── Tax number ────────────────────────────────────────────────
    # Handles: 10 consecutive digits, spaced, or comma-separated (OCR artefacts)
    clean = re.sub(r"[,\.\s]", "", text)  # strip separators for digit search
    for pat in [
        r"\b(\d{10})\b",
        r"\b(\d{3}[\s\-,]\d{3}[\s\-,]\d{4,5})\b",
        r"[Nn][Oo]\.?\s*:?\s*(\d[\d\s,\.]{8,14}\d)",
    ]:
        m = re.search(pat, text)
        if m:
            fields["party2_tax_no"] = re.sub(r"[^\d]", "", m.group(1))
            if len(fields["party2_tax_no"]) >= 9:
                break
            fields["party2_tax_no"] = ""
    # fallback: find any 9-10 digit sequence after stripping separators
    if not fields["party2_tax_no"]:
        m = re.search(r"\d{9,11}", clean)
        if m:
            fields["party2_tax_no"] = m.group(0)[:10]

    # ── Tax office ────────────────────────────────────────────────
    # Handles fuzzy OCR: "Vergl", "Vergı", "V.D.", "VD."
    for l in lines:
        if re.search(r"verg[il1ı]\s+d[ai]", l, re.IGNORECASE):
            name = re.split(r"verg[il1ı]\s+d[ai]", l, flags=re.IGNORECASE)[0].strip()
            fields["party2_tax_office"] = (name + " Vergi Dairesi").strip()
            break
        if re.search(r"\bV\.?D\.?\b", l, re.IGNORECASE):
            name = re.split(r"\bV\.?D\.?\b", l, flags=re.IGNORECASE)[0].strip()
            if name and len(name) < 40:
                fields["party2_tax_office"] = name + " Vergi Dairesi"
                break

    # ── Company name ──────────────────────────────────────────────
    # Strategy: first check for a dedicated name label, then look for legal keyword lines,
    # prioritizing early lines (top of image = top of sorted list)
    name_label = re.search(r"[Üü]nvan[ıi]?\s*:?\s*(.+)", "\n".join(lines))
    if name_label:
        fields["party2_name"] = name_label.group(1).strip()
    else:
        # Take the FIRST line that contains a legal entity keyword — usually the company name
        for l in lines:
            if re.search(r"LTD|A\.?\s*[SŞ]|TİC|TIC|SAN|[SŞ]Tİ|LİMİTED|ANONİM|GRUP", l, re.IGNORECASE) and len(l) > 5 and len(l) < 80:
                fields["party2_name"] = l
                break

    # ── Address ───────────────────────────────────────────────────
    for l in lines:
        if re.search(r"mah\.|mh\.|cad\.|cd\.|sok\.|sk\.|bulvar|blv\.|no:|no\.", l, re.IGNORECASE):
            fields["party2_address"] = l
            break

    return fields

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
