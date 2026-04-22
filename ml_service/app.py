import json, os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from classifier import EmailClassifier
from trainer import load_all_data, train_model, LABELED_PATH, POSITIVE_DIR, NEGATIVE_DIR

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
