# AI in a PNG: Intent Classifier

A functional tiny (3089 bytes) ML model and application embedded within the pixels of a single PNG image

![AI in a PNG](viewer/ai_payload.png)
*(The image above contains the entire brain and heart of this app)*

In a world of cloud-heavy LLMs, we explore the opposite. How much intelligence can we pack into a tiny, self-contained binary containers that runs entirely in the user's browser?

- **Zero Trust**: No data leaves the user's machine
- **Zero Server**: No API calls, no Python backend, no GPU clusters needed for inference
- **Portability**: The entire app (Model + Logic + UI) is just a single ~3 KB payload hidden inside an image

## How it Works

### 1. Steganography
The data is stored in the **RGB channels** of the image pixels. We keep the Alpha channel at 255 to ensure visual consistency. A custom JavaScript routine (`stegano.js`) reconstructs the binary blob from the browser's `ImageData` buffer

### 2. Machine Learning
We use a **Logistic Regression** model trained on a small list of email snippets to classify user intent, e.g., "scheduling" a meeting)
- **Quantization**: Weights are quantized to `int8` to reduce the footprint
- **Inference**: High-speed inference happens in pure JavaScript using a simple Bag-of-Words (BoW) approach

### 3. Distribution
Because the paths are flattened, the viewer requires only three files to function:
- `index.html`: The glassmorphic UI frame
- `stegano.js`: The "Key" that unlocks and runs the PNG payload
- `ai_payload.png`: The "Brain" (Model + App logic + UI templates)

## Getting Started

### Quick Start (View Demo)
1. Clone the repo:
   ```bash
   git clone https://github.com/intagen/ai-in-a-png.git
   cd ai-in-a-png
   ```
2. Start a local server:
   ```bash
   python3 -m http.server 8000
   ```
3. Open `http://localhost:8000/viewer/` in your browser

### Development

1. **Train(re-train) the model**: Update `data/train.jsonl` and run the trainer:
   ```bash
   python3 train/train_intent.py
   ```
   *This outputs `pack/model.json`.*

2. **Pack the PNG**: Combine the model, app logic (`pack/app.js`), and UI (`pack/ui.html`):
   ```bash
   python3 pack/pack.py
   ```
   *This generates the fresh `viewer/ai_payload.png`*

## Deployment
You can host this anywhere.

---
*Powered by steganography*
