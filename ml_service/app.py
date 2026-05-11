import json, os, re, io
from PIL import Image, ImageEnhance, ImageFilter, ImageOps
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

def preprocess_for_ocr(img):
    """Upscale, boost contrast and sharpen before OCR — helps low-quality scans."""
    # Upscale if narrower than 1400px to preserve fine character detail
    w, h = img.size
    if w < 1400:
        scale = 1400 / w
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    # Work in grayscale for enhancement
    gray = img.convert("L")
    gray = ImageOps.autocontrast(gray, cutoff=1)       # stretch histogram
    gray = ImageEnhance.Contrast(gray).enhance(1.8)
    gray = ImageEnhance.Sharpness(gray).enhance(2.5)
    gray = gray.filter(ImageFilter.MedianFilter(size=3)) # light denoise
    return gray.convert("RGB")


@app.post("/ocr")
async def ocr(file: UploadFile = File(...)):
    contents = await file.read()
    try:
        reader = get_ocr_reader()

        raw = Image.open(io.BytesIO(contents)).convert("RGB")
        img = preprocess_for_ocr(raw)

        # Try 4 rotations on the preprocessed image; pick highest mean confidence
        best_results, best_score = None, -1
        for angle in [0, 90, 180, 270]:
            rotated = img.rotate(angle, expand=True)
            arr = np.array(rotated)
            res = reader.readtext(arr, detail=1, paragraph=False,
                                  contrast_ths=0.05, adjust_contrast=0.7,
                                  low_text=0.3, text_threshold=0.6)
            score = sum(r[2] for r in res) / max(len(res), 1)
            if score > best_score and len(res) > 2:
                best_score = score
                best_results = res

        if not best_results:
            raise HTTPException(422, "No text found in image")

        best_results.sort(key=lambda r: (r[0][0][1] + r[0][2][1]) / 2)
        full_text = "\n".join(r[1] for r in best_results if r[2] > 0.05)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"OCR failed: {e}")

    fields = parse_tax_certificate(full_text)
    return {"ok": True, "rawText": full_text, "fields": fields}


def _fix_digit_ocr(s: str) -> str:
    """Fix common OCR character→digit substitutions in a string expected to be numeric."""
    return (s.replace('O', '0').replace('o', '0')
             .replace('I', '1').replace('l', '1').replace('İ', '1')
             .replace('S', '5').replace('Z', '2').replace('B', '8'))


def parse_tax_certificate(text: str) -> dict:
    fields = {"party2_name": "", "party2_tax_office": "", "party2_tax_no": "", "party2_address": ""}
    lines = [l.strip() for l in text.split("\n") if l.strip()]

    # ── Tax number ────────────────────────────────────────────────
    # Apply digit-OCR fixes to the whole text before searching
    digit_text = _fix_digit_ocr(text)
    digit_clean = re.sub(r"[,\.\s\-]", "", digit_text)

    for pat in [
        r"\b(\d{10})\b",
        r"\b(\d{3}[\s\-,]\d{3}[\s\-,]\d{4,5})\b",
        r"[Nn][Oo]\.?\s*:?\s*(\d[\d\s,\.]{8,14}\d)",
        r"[Vv][Nn]\.?\s*:?\s*(\d[\d\s,\.]{8,14}\d)",
    ]:
        m = re.search(pat, digit_text)
        if m:
            cand = re.sub(r"[^\d]", "", m.group(1))
            if len(cand) >= 9:
                fields["party2_tax_no"] = cand[:10]
                break
    if not fields["party2_tax_no"]:
        m = re.search(r"\d{9,11}", digit_clean)
        if m:
            fields["party2_tax_no"] = m.group(0)[:10]

    # ── Tax office ────────────────────────────────────────────────
    # Handles OCR noise: "Vergı", "Vergl", "Verg1", "V.D.", "VD", "VERGİ DAİRESİ"
    for l in lines:
        if re.search(r"verg[iı1lİ]\s*[.:]?\s*d[aâi]", l, re.IGNORECASE):
            name = re.split(r"verg[iı1lİ]\s*[.:]?\s*d[aâi]", l, flags=re.IGNORECASE)[0].strip()
            fields["party2_tax_office"] = (name + " Vergi Dairesi").strip() if name else ""
            break
        if re.search(r"\bV\.?\s*D\.?\b", l, re.IGNORECASE):
            name = re.split(r"\bV\.?\s*D\.?\b", l, flags=re.IGNORECASE)[0].strip()
            if name and len(name) < 50:
                fields["party2_tax_office"] = name + " Vergi Dairesi"
                break
        # Sometimes OCR reads "VERGİ DAİRESİ" as separate words on the same line
        if re.search(r"daire", l, re.IGNORECASE):
            name = re.split(r"daire", l, flags=re.IGNORECASE)[0].strip()
            name = re.sub(r"verg[iı]?\s*$", "", name, flags=re.IGNORECASE).strip()
            if name and len(name) < 50:
                fields["party2_tax_office"] = name + " Vergi Dairesi"
                break

    # ── Company name ──────────────────────────────────────────────
    LEGAL = re.compile(r"LTD|A\.?\s*[SŞ]\.?|TİC\.?|TIC\.?|SAN\.?|[SŞ]Tİ\.?|LİMİTED|ANONİM|GRUP|HOLDİNG", re.IGNORECASE)
    # 1) Explicit "Ünvanı:" label
    name_label = re.search(r"[Üü][Nn][Vv][Aa][Nn][Iiıİ]?\s*[:\-]?\s*(.+)", "\n".join(lines))
    if name_label:
        fields["party2_name"] = name_label.group(1).strip()
    else:
        # 2) First line containing a legal keyword; also try merging with the next line
        #    (OCR sometimes splits "... LTD. ŞTİ." onto two lines)
        for idx, l in enumerate(lines):
            if LEGAL.search(l) and 5 < len(l) < 100:
                name = l
                # Merge next line if it looks like a continuation (no legal keyword yet complete)
                if idx + 1 < len(lines):
                    nxt = lines[idx + 1]
                    if LEGAL.search(nxt) or re.search(r"[SŞ]Tİ|LTD|A\.S\.", nxt, re.IGNORECASE):
                        name = name + " " + nxt
                fields["party2_name"] = name.strip()
                break

    # ── Address ───────────────────────────────────────────────────
    ADDR = re.compile(r"mah[.\s]|mh[.\s]|cad[.\s]|cd[.\s]|sok[.\s]|sk[.\s]|bulvar|blv[.\s]|no\s*:|no\.\s*\d|posta|ilçe|mahallesi|sokak|cadde", re.IGNORECASE)
    addr_lines = []
    for l in lines:
        if ADDR.search(l):
            addr_lines.append(l)
            # Capture the immediately following line if it looks like a continuation
            # (no label keyword, not a tax number line)
            idx = lines.index(l)
            if idx + 1 < len(lines):
                nxt = lines[idx + 1]
                if not re.search(r"verg|V\.D\.|no\s*:|fax|tel|e-?posta|mail", nxt, re.IGNORECASE) and len(nxt) < 80:
                    addr_lines.append(nxt)
            break
    if addr_lines:
        fields["party2_address"] = " ".join(addr_lines)

    return fields

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
