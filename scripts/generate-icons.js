// Generates resources/icon.png (512), resources/icon.ico (16/32/48/256), and
// resources/tray.png (32) — Toasty's head, rasterized DIRECTLY from the
// canonical painted grid (cat-lab/toasty-cat-grid.json, the same data
// CatSvg.tsx renders via renderer/lib/toastyCatGrid.ts). No hand-mirrored
// cell data anymore: if the character changes, update the JSON, regenerate
// the renderer module, and rerun `npm run icons` — this script re-crops the
// head automatically.
//
// Pure Node (fs + zlib only) — deliberately no `sharp`/`canvas`/`png-to-ico`
// dependency, matching the project's $0-cost, minimal-deps preference.

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

// rows 2-22 AND cols <= 34 are the head — the tail tip also rises into rows
// 18-22 further right, so the crop needs both bounds. Keep in sync with CatSvg.tsx.
const HEAD_MAX_ROW = 22;
const HEAD_MAX_COL = 34;

function loadHeadGrid() {
  const raw = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "cat-lab", "toasty-cat-grid.json"), "utf8")
  );
  const head = {};
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  for (const key of Object.keys(raw.cells)) {
    const [x, y] = key.split(",").map(Number);
    if (y > HEAD_MAX_ROW || x > HEAD_MAX_COL) continue;
    head[key] = raw.cells[key];
    if (x < xmin) xmin = x;
    if (x > xmax) xmax = x;
    if (y < ymin) ymin = y;
    if (y > ymax) ymax = y;
  }
  // fit the head into a square local grid, centered, 1 cell of padding
  const w = xmax - xmin + 1, h = ymax - ymin + 1;
  const GRID = Math.max(w, h) + 2;
  const colOff = xmin - Math.floor((GRID - w) / 2);
  const rowOff = ymin - Math.floor((GRID - h) / 2);
  const grid = Array.from({ length: GRID }, () => new Array(GRID).fill(null));
  for (const key of Object.keys(head)) {
    const [x, y] = key.split(",").map(Number);
    const lc = x - colOff, lr = y - rowOff;
    if (lc >= 0 && lc < GRID && lr >= 0 && lr < GRID) grid[lr][lc] = head[key];
  }
  return { grid, GRID };
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rasterize(grid, GRID, size) {
  const rgba = new Uint8Array(size * size * 4);
  for (let py = 0; py < size; py++) {
    const row = Math.min(GRID - 1, Math.floor((py / size) * GRID));
    for (let px = 0; px < size; px++) {
      const col = Math.min(GRID - 1, Math.floor((px / size) * GRID));
      const hex = grid[row][col];
      if (!hex) continue;
      const [r, g, b] = hexToRgb(hex);
      const idx = (py * size + px) * 4;
      rgba[idx] = r; rgba[idx + 1] = g; rgba[idx + 2] = b; rgba[idx + 3] = 255;
    }
  }
  return rgba;
}

// ── Minimal PNG encoder (RGBA, 8-bit, no filtering) ──
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}
function encodePNG(rgba, size) {
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 6;  // color type: RGBA
  ihdrData[10] = 0; ihdrData[11] = 0; ihdrData[12] = 0;
  const ihdr = pngChunk("IHDR", ihdrData);

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter type: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const idat = pngChunk("IDAT", zlib.deflateSync(raw));
  const iend = pngChunk("IEND", Buffer.alloc(0));
  return Buffer.concat([sig, ihdr, idat, iend]);
}

// ── Minimal ICO encoder: wraps one PNG per size in a standard ICONDIR
// (Windows Vista+ supports PNG-compressed ICO entries at any listed size —
// the same trick libraries like png-to-ico use). ──
function encodeICO(sizes, pngBuffers) {
  const count = sizes.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);
  let offset = 6 + 16 * count;
  const dirEntries = [];
  for (let i = 0; i < count; i++) {
    const size = sizes[i];
    const png = pngBuffers[i];
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size; // width, 0 = 256
    entry[1] = size >= 256 ? 0 : size; // height, 0 = 256
    entry[2] = 0; entry[3] = 0;        // color count, reserved
    entry.writeUInt16LE(1, 4);         // planes
    entry.writeUInt16LE(32, 6);        // bit count
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    dirEntries.push(entry);
    offset += png.length;
  }
  return Buffer.concat([header, ...dirEntries, ...pngBuffers]);
}

function main() {
  const outDir = path.join(__dirname, "..", "resources");
  fs.mkdirSync(outDir, { recursive: true });
  const { grid, GRID } = loadHeadGrid();

  const icoSizes = [16, 32, 48, 256];
  const icoPngs = icoSizes.map((s) => encodePNG(rasterize(grid, GRID, s), s));
  fs.writeFileSync(path.join(outDir, "icon.ico"), encodeICO(icoSizes, icoPngs));

  fs.writeFileSync(path.join(outDir, "icon.png"), encodePNG(rasterize(grid, GRID, 512), 512));
  fs.writeFileSync(path.join(outDir, "tray.png"), encodePNG(rasterize(grid, GRID, 32), 32));

  console.log(`Wrote resources/icon.ico, resources/icon.png (512), resources/tray.png (32) — head grid ${GRID}x${GRID}`);
}

main();
