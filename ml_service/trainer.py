import os, json, torch
from transformers import (
    AutoTokenizer,
    AutoModelForSequenceClassification,
    TrainingArguments,
    Trainer,
)
from torch.utils.data import Dataset

BASE_DIR        = os.path.dirname(__file__)
LABELED_PATH    = os.path.join(BASE_DIR, "data", "labeled.json")
POSITIVE_DIR    = os.path.join(BASE_DIR, "data", "positive")
NEGATIVE_DIR    = os.path.join(BASE_DIR, "data", "negative")
OUTPUT_DIR      = os.path.join(BASE_DIR, "models", "fine_tuned")
BERTURK_MODEL   = "dbmdz/bert-base-turkish-cased"
MIN_SAMPLES     = 20

class _EmailDataset(Dataset):
    def __init__(self, encodings, labels):
        self.encodings = encodings
        self.labels    = labels

    def __len__(self):
        return len(self.labels)

    def __getitem__(self, idx):
        item = {k: torch.tensor(v[idx]) for k, v in self.encodings.items()}
        item["labels"] = torch.tensor(self.labels[idx])
        return item

def _load_txt_dir(path, label_int):
    texts, labels = [], []
    if not os.path.isdir(path):
        return texts, labels
    for fname in os.listdir(path):
        if fname.endswith(".txt"):
            with open(os.path.join(path, fname), "r", encoding="utf-8") as f:
                content = f.read().strip()
                if content:
                    texts.append(content)
                    labels.append(label_int)
    return texts, labels

def load_all_data():
    texts, labels = [], []

    # labeled.json (from ERP labeling interface)
    with open(LABELED_PATH, "r", encoding="utf-8") as f:
        for item in json.load(f):
            texts.append(item["text"])
            labels.append(1 if item["label"] == "positive" else 0)

    # .txt files dropped manually into data/positive and data/negative
    t, l = _load_txt_dir(POSITIVE_DIR, 1)
    texts += t; labels += l
    t, l = _load_txt_dir(NEGATIVE_DIR, 0)
    texts += t; labels += l

    return texts, labels

def train_model():
    texts, labels = load_all_data()

    if len(texts) < MIN_SAMPLES:
        return {
            "success": False,
            "error": f"Not enough data: {len(texts)} samples found, need at least {MIN_SAMPLES}.",
        }

    pos = sum(labels); neg = len(labels) - pos
    if pos < 5 or neg < 5:
        return {"success": False, "error": f"Need at least 5 samples per class. Have {pos} positive, {neg} negative."}

    print(f"Fine-tuning BERTurk on {len(texts)} samples ({pos} positive, {neg} negative)...")

    tokenizer = AutoTokenizer.from_pretrained(BERTURK_MODEL)
    model     = AutoModelForSequenceClassification.from_pretrained(BERTURK_MODEL, num_labels=2)

    encodings = tokenizer(texts, truncation=True, padding=True, max_length=256)
    dataset   = _EmailDataset(encodings, labels)

    split     = max(1, int(0.8 * len(dataset)))
    train_ds, eval_ds = torch.utils.data.random_split(dataset, [split, len(dataset) - split])

    args = TrainingArguments(
        output_dir=OUTPUT_DIR,
        num_train_epochs=5,
        per_device_train_batch_size=8,
        per_device_eval_batch_size=8,
        evaluation_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        logging_dir=os.path.join(BASE_DIR, "models", "logs"),
        report_to="none",
    )

    trainer = Trainer(model=model, args=args, train_dataset=train_ds, eval_dataset=eval_ds)
    trainer.train()
    trainer.save_model(OUTPUT_DIR)
    tokenizer.save_pretrained(OUTPUT_DIR)

    return {"success": True, "samples": len(texts), "positive": pos, "negative": neg}
