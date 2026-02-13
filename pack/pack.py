import json, struct, zlib, re
from pathlib import Path
from PIL import Image

MAGIC = b"AIPNGv1\n"

def deflate_data(data: bytes, level: int = 9) -> bytes:
    return zlib.compress(data, level=level)

def crc32(data: bytes) -> int:
    return zlib.crc32(data) & 0xFFFFFFFF

def minify_js(code: str) -> str:
    code = re.sub(r'//.*', '', code)
    code = re.sub(r'/\*[\s\S]*?\*/', '', code)
    return "\n".join(line.rstrip() for line in code.splitlines() if line.strip())

def minify_html(html: str) -> str:
    html = re.sub(r'>\s+<', '> <', html)
    html = re.sub(r'\s+', ' ', html)
    return html.strip()

def build_payload(model_path: str, app_js_path: str, ui_html_path: str) -> bytes:
    payload = {
        "meta": {"name": "Scheduling reply drafter (AI in a PNG)", "version": "1.0"},
        "model": json.loads(Path(model_path).read_text(encoding="utf-8")),
        "app_js": minify_js(Path(app_js_path).read_text(encoding="utf-8")),
        "ui_html": minify_html(Path(ui_html_path).read_text(encoding="utf-8")),
    }
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    compressed = deflate_data(raw)
    header = MAGIC + struct.pack("<I", len(compressed))
    blob_no_crc = header + compressed
    return blob_no_crc + struct.pack("<I", crc32(blob_no_crc))

def write_png(blob: bytes, out_path: str, width: int = 256) -> None:
    nbytes = len(blob)
    pixels = (nbytes + 2) // 3
    height = (pixels + width - 1) // width
    total_pixels = width * height
    buf = bytearray(total_pixels * 4)
    for i in range(3, len(buf), 4): buf[i] = 255
    data_idx = 0
    buf_idx = 0
    while data_idx < nbytes:
        buf[buf_idx] = blob[data_idx]
        data_idx += 1
        buf_idx += 1
        if data_idx >= nbytes: break
        buf[buf_idx] = blob[data_idx]
        data_idx += 1
        buf_idx += 1
        if data_idx >= nbytes: break
        buf[buf_idx] = blob[data_idx]
        data_idx += 1
        buf_idx += 2
    img = Image.frombytes("RGBA", (width, height), bytes(buf))
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path, optimize=False)
    print(f"Wrote {out_path} ({nbytes} bytes)")

if __name__ == "__main__":
    root = Path.cwd()
    blob = build_payload(
        str(root / "pack" / "model.json"),
        str(root / "pack" / "app.js"),
        str(root / "pack" / "ui.html"),
    )
    write_png(blob, str(root / "viewer" / "ai_payload.png"), width=256)
