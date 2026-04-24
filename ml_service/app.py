import json, os, re, io
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
        reader = get_ocr_reader()
        results = reader.readtext(contents, detail=0, paragraph=True)
        full_text = "\n".join(results)
    except Exception as e:
        raise HTTPException(500, f"OCR failed: {e}")

    fields = parse_tax_certificate(full_text)
    return {"ok": True, "rawText": full_text, "fields": fields}

def parse_tax_certificate(text: str) -> dict:
    fields = {"party2_name": "", "party2_tax_office": "", "party2_tax_no": "", "party2_address": ""}
    lines = [l.strip() for l in text.split("\n") if l.strip()]

    # Tax number: 10-digit number
    m = re.search(r"\b(\d{10})\b", text)
    if m:
        fields["party2_tax_no"] = m.group(1)

    # Tax office: line containing "Vergi Dairesi"
    for l in lines:
        if re.search(r"vergi dairesi", l, re.IGNORECASE):
            fields["party2_tax_office"] = re.sub(r"vergi dairesi.*", "Vergi Dairesi", l, flags=re.IGNORECASE).strip()
            break

    # Company name: line with Ltd, A.Ş, Tic, San, Şti
    for l in lines:
        if re.search(r"LTD|A\.?Ş|TİC|SAN|ŞTİ|LİMİTED|ANONİM", l, re.IGNORECASE) and len(l) > 8:
            fields["party2_name"] = l
            break

    # Address: line with Mah., Cad., Sok., No:
    for l in lines:
        if re.search(r"mah\.|cad\.|sok\.|bulvar|no:", l, re.IGNORECASE):
            fields["party2_address"] = l
            break

    return fields

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
