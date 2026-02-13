import json, math, re
from pathlib import Path
from collections import Counter, defaultdict

def tokenize(text: str):
    text = text.lower()
    return re.findall(r"[a-z0-9']+", text)

def sigmoid(x):
    if x >= 0:
        z = math.exp(-x)
        return 1 / (1 + z)
    z = math.exp(x)
    return z / (1 + z)

def train_logreg(examples, iters=400, lr=0.2, l2=1e-4, vocab_limit=2000):
    counts = Counter()
    for x, y in examples:
        counts.update(tokenize(x))
    vocab = [w for w, _ in counts.most_common(vocab_limit)]
    stoi = {w:i for i,w in enumerate(vocab)}

    X, Y = [], []
    for x, y in examples:
        feats = defaultdict(float)
        for w in tokenize(x):
            if w in stoi: feats[stoi[w]] += 1.0
        X.append(feats)
        Y.append(1.0 if y == "scheduling" else 0.0)

    W = [0.0] * len(vocab)
    b = 0.0
    for _ in range(iters):
        gW, gb = [0.0] * len(vocab), 0.0
        for feats, y in zip(X, Y):
            z = b
            for j, v in feats.items(): z += W[j] * v
            p = sigmoid(z)
            err = (p - y)
            gb += err
            for j, v in feats.items(): gW[j] += err * v
        n = len(X)
        for j in range(len(W)): gW[j] = gW[j] / n + l2 * W[j]
        gb /= n
        for j in range(len(W)): W[j] -= lr * gW[j]
        b -= lr * gb
    return vocab, W, b

def eval_model(examples, vocab, W, b):
    stoi = {w:i for i,w in enumerate(vocab)}
    correct = 0
    for x, y in examples:
        feats = Counter(tokenize(x))
        z = b
        for w, c in feats.items():
            j = stoi.get(w)
            if j is not None: z += W[j] * c
        pred = "scheduling" if (1 / (1 + math.exp(-z))) >= 0.5 else "other"
        if pred == y: correct += 1
    return correct / len(examples)

def main():
    root = Path(__file__).parent.parent
    data_path = root / "data" / "train.jsonl"
    rows = [json.loads(line) for line in data_path.read_text(encoding="utf-8").splitlines() if line.strip()]
    examples = [(r["text"], r["label"]) for r in rows]
    vocab, W, b = train_logreg(examples)
    acc = eval_model(examples, vocab, W, b)
    print(f"Accuracy: {round(acc, 3)} | Vocab: {len(vocab)}")

    max_abs = max(1e-9, max(abs(x) for x in W + [b]))
    scale = max_abs / 127.0
    Wq = [int(round(w / scale)) for w in W]
    bq = int(round(b / scale))

    model = {
        "type": "logreg_bow_int8",
        "labels": ["other", "scheduling"],
        "vocab": vocab,
        "Wq": Wq,
        "bq": bq,
        "scale": scale,
        "sign_name": "Pawel"
    }

    out_path = root / "pack" / "model.json"
    out_path.write_text(json.dumps(model, separators=(",", ":")), encoding="utf-8")
    print(f"Saved: {out_path}")

if __name__ == "__main__":
    main()
