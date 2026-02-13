const MAGIC = new TextEncoder().encode("AIPNGv1\n");

function u32le(bytes, off) {
    return (bytes[off] | (bytes[off + 1] << 8) | (bytes[off + 2] << 16) | (bytes[off + 3] << 24)) >>> 0;
}

function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) {
        c ^= bytes[i];
        for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & (-(c & 1)));
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
}

async function inflate(data) {
    try {
        const ds = new DecompressionStream("deflate");
        const writer = ds.writable.getWriter();
        writer.write(data);
        writer.close();

        const output = [];
        const reader = ds.readable.getReader();
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            output.push(value);
        }

        const totalLength = output.reduce((acc, chunk) => acc + chunk.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of output) {
            result.set(chunk, offset);
            offset += chunk.length;
        }
        return result;
    } catch (err) {
        throw new Error(`Decompression failed (${err.name}: ${err.message})`);
    }
}

export async function extractPayloadFromPngFile(file) {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    await img.decode();

    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);

    const rgba = ctx.getImageData(0, 0, c.width, c.height).data;

    const totalPixels = rgba.length / 4;
    const bytes = new Uint8Array(totalPixels * 3);

    for (let i = 0, j = 0; i < rgba.length; i += 4) {
        bytes[j++] = rgba[i];
        bytes[j++] = rgba[i + 1];
        bytes[j++] = rgba[i + 2];
    }

    for (let i = 0; i < MAGIC.length; i++) {
        if (bytes[i] !== MAGIC[i]) throw new Error("Not a packed AI PNG (magic mismatch)");
    }

    const len = u32le(bytes, MAGIC.length);
    const start = MAGIC.length + 4;
    const end = start + len;
    const crcOff = end;
    const crcEnd = crcOff + 4;

    if (crcEnd > bytes.length) throw new Error("Corrupt length (outside image)");

    const blobNoCrc = bytes.slice(0, end);
    const crcStored = u32le(bytes, crcOff);
    const crcCalc = crc32(blobNoCrc);

    if (crcStored !== crcCalc) throw new Error("CRC check failed (payload corrupted)");

    const compressed = bytes.slice(start, end);
    const jsonBytes = await inflate(compressed);
    const text = new TextDecoder().decode(jsonBytes);
    return JSON.parse(text);
}
