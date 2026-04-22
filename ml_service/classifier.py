import os
from transformers import pipeline, AutoTokenizer, AutoModelForSequenceClassification

FINE_TUNED_PATH = os.path.join(os.path.dirname(__file__), "models", "fine_tuned")
ZERO_SHOT_MODEL = "joeddav/xlm-roberta-large-xnli"
BERTURK_MODEL   = "dbmdz/bert-base-turkish-cased"

POSITIVE_LABEL = "ilgileniyor"
NEGATIVE_LABEL = "ilgilenmiyorum"
HYPOTHESIS     = "Bu e-posta {} mesajı içeriyor."

class EmailClassifier:
    def __init__(self):
        self.pipe       = None
        self.model_type = None
        self._load()

    def _load(self):
        if os.path.isdir(FINE_TUNED_PATH) and os.listdir(FINE_TUNED_PATH):
            print("Loading fine-tuned BERTurk model...")
            tokenizer  = AutoTokenizer.from_pretrained(FINE_TUNED_PATH)
            model      = AutoModelForSequenceClassification.from_pretrained(FINE_TUNED_PATH)
            self.pipe  = pipeline("text-classification", model=model, tokenizer=tokenizer)
            self.model_type = "fine-tuned"
        else:
            print("Loading zero-shot XLM-RoBERTa model (first run may take a while to download)...")
            self.pipe  = pipeline("zero-shot-classification", model=ZERO_SHOT_MODEL)
            self.model_type = "zero-shot"
        print(f"Model ready: {self.model_type}")

    def classify(self, text: str) -> dict:
        if self.model_type == "zero-shot":
            result     = self.pipe(text, candidate_labels=[POSITIVE_LABEL, NEGATIVE_LABEL], hypothesis_template=HYPOTHESIS)
            top_label  = result["labels"][0]
            confidence = result["scores"][0]
            label      = "positive" if top_label == POSITIVE_LABEL else "negative"
        else:
            result     = self.pipe(text, truncation=True, max_length=512)[0]
            raw_label  = result["label"]
            confidence = result["score"]
            label      = "positive" if raw_label in ("LABEL_1", "positive") else "negative"

        return {"label": label, "confidence": round(confidence, 4), "model_type": self.model_type}

    def reload(self):
        self._load()
