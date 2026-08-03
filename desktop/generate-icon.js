/**
 * Writes desktop/icon.ico with 16/32/48/64/128/256 sizes (32-bpp).
 * Solid blue circle with simple "AP" mark — good enough for installer/electron.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, 'icon.ico');
const SIZES = [16, 32, 48, 64, 128, 256];

function clamp(v) {
  return Math.max(0, Math.min(255, v | 0));
}

function drawIconRgba(size) {
  const data = Buffer.alloc(size * size * 4);
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const r = size * 0.42;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const i = (y * size + x) * 4;
      if (dist <= r) {
        const t = dist / r;
        // #00C6FF -> #0072FF
        data[i] = clamp(0);
        data[i + 1] = clamp(198 - t * (198 - 114));
        data[i + 2] = 255;
        data[i + 3] = 255;
      } else if (dist <= r + 1) {
        const a = clamp(255 * (1 - (dist - r)));
        data[i] = 0;
        data[i + 1] = 150;
        data[i + 2] = 255;
        data[i + 3] = a;
      }
    }
  }

  // Rough block letters "AP" for larger sizes
  if (size >= 32) {
    paintGlyph(data, size, 'A');
  }
  return data;
}

function paintGlyph(data, size, _letter) {
  // Draw a small white rounded square / bar mark in the center (brand glyph)
  const left = Math.floor(size * 0.34);
  const right = Math.floor(size * 0.66);
  const top = Math.floor(size * 0.32);
  const bottom = Math.floor(size * 0.68);
  const thick = Math.max(2, Math.floor(size * 0.08));

  const setWhite = (x, y) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    if (data[i + 3] < 200) return;
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
    data[i + 3] = 255;
  };

  // Left vertical of A
  for (let y = top; y <= bottom; y++) {
    for (let t = 0; t < thick; t++) setWhite(left + t, y);
  }
  // Right vertical of A
  for (let y = top; y <= bottom; y++) {
    for (let t = 0; t < thick; t++) setWhite(right - t, y);
  }
  // Top bar
  for (let x = left; x <= right; x++) {
    for (let t = 0; t < thick; t++) setWhite(x, top + t);
  }
  // Cross bar
  const midY = Math.floor((top + bottom) / 2);
  for (let x = left; x <= right; x++) {
    for (let t = 0; t < thick; t++) setWhite(x, midY + t);
  }
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  const crcVal = crc32(Buffer.concat([typeBuf, data]));
  crc.writeUInt32BE(crcVal >>> 0, 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }
  return ~c;
}

function rgbaToPng(size, rgba) {
  // PNG with IHDR + IDAT + IEND (RGBA)
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = 1 + size * 4;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filter none
    rgba.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4);
  }
  const compressed = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

function buildIco(pngImages) {
  const count = pngImages.length;
  const headerSize = 6 + 16 * count;
  let offset = headerSize;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  let o = 6;
  for (let i = 0; i < count; i++) {
    const size = SIZES[i];
    const png = pngImages[i];
    header.writeUInt8(size >= 256 ? 0 : size, o++);
    header.writeUInt8(size >= 256 ? 0 : size, o++);
    header.writeUInt8(0, o++);
    header.writeUInt8(0, o++);
    header.writeUInt16LE(1, o); o += 2;
    header.writeUInt16LE(32, o); o += 2;
    header.writeUInt32LE(png.length, o); o += 4;
    header.writeUInt32LE(offset, o); o += 4;
    offset += png.length;
  }

  return Buffer.concat([header, ...pngImages]);
}

const pngs = SIZES.map((size) => rgbaToPng(size, drawIconRgba(size)));
const ico = buildIco(pngs);
fs.writeFileSync(OUT, ico);
console.log(`Wrote ${OUT} (${ico.length} bytes) with sizes: ${SIZES.join(', ')}`);
