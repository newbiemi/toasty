// Generates resources/icon.png (512), resources/icon.ico (16/32/48/256), and
// resources/tray.png (32) — Toasty's head, rasterized from the SAME cell data
// as CatSvg.tsx's head variant (buildSilhouetteAndMarks + HEAD_MAX_ROW=11
// filter). Duplicated here (not imported) because this is a plain Node
// script with no TS/bundler step — if the head shape in CatSvg.tsx changes,
// mirror the change in buildHeadCells() below and rerun `npm run icons`.
//
// Pure Node (fs + zlib only) — deliberately no `sharp`/`canvas`/`png-to-ico`
// dependency, matching the project's $0-cost, minimal-deps preference.

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const CENTER = 10.5;
const mirror = (x) => 2 * CENTER - x;

function addSpan(map, y, lo, hi, color) {
  for (let x = lo; x <= hi; x++) map[`${x},${y}`] = color;
}
function addMirroredSpan(map, y, lo, hi, color) {
  addSpan(map, y, lo, hi, color);
  addSpan(map, y, mirror(hi), mirror(lo), color);
}
function dilate(map) {
  const d = {};
  for (const key of Object.keys(map)) {
    const [x, y] = key.split(",").map(Number);
    for (const [ox, oy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) d[`${x + ox},${y + oy}`] = true;
  }
  return d;
}

// Mirrors CatSvg.tsx buildSilhouetteAndMarks() — ears + face rows only
// (rows > 11 are belly/paws/tail, not part of the head).
function buildHeadCells() {
  const silhouette = {};
  const BODY_ROWS = [
    [3, 8, 13], [4, 6, 15], [5, 5, 16], [6, 4, 17], [7, 4, 17], [8, 4, 17],
    [9, 3, 18], [10, 3, 18], [11, 4, 17],
  ];
  BODY_ROWS.forEach(([y, lo, hi]) => addSpan(silhouette, y, lo, hi, "F"));
  const EAR_ROWS = [[0, 5, 5], [1, 4, 6], [2, 3, 7], [3, 3, 7], [4, 4, 6]];
  EAR_ROWS.forEach(([y, lo, hi]) => addMirroredSpan(silhouette, y, lo, hi, "F"));

  const marks = {};
  addSpan(marks, 4, 9, 12, "M");
  addSpan(marks, 5, 10, 11, "M");
  addMirroredSpan(marks, 1, 5, 5, "M");
  addMirroredSpan(marks, 2, 4, 6, "M");
  addMirroredSpan(marks, 3, 4, 6, "M");

  return { silhouette, marks };
}

const COLORS = {
  fur: "#f5e6d3",
  edge: "#5b4636",
  mark: "#e8a87c",
  blush: "#f7b7c4",
  eye: "#3a2e28",
  eyeHi: "#fffaf0",
};
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Local square grid: origCol 3..18 -> localCol 0..15; origRow -2..13 -> localRow 0..15
// (2 rows of padding above/below so the 16-col x 12-row head content sits in a square grid).
const COL_OFFSET = 3, ROW_OFFSET = -2, GRID = 16;

function buildGridPixels() {
  const { silhouette, marks } = buildHeadCells();
  const outline = dilate(silhouette);
  const grid = Array.from({ length: GRID }, () => new Array(GRID).fill(null));

  const setLocal = (origCol, origRow, hex) => {
    const lc = origCol - COL_OFFSET, lr = origRow - ROW_OFFSET;
    if (lc < 0 || lc >= GRID || lr < 0 || lr >= GRID) return;
    grid[lr][lc] = hex;
  };

  Object.keys(outline).forEach((k) => { const [x, y] = k.split(",").map(Number); setLocal(x, y, COLORS.edge); });
  Object.keys(silhouette).forEach((k) => { const [x, y] = k.split(",").map(Number); setLocal(x, y, COLORS.fur); });
  Object.keys(marks).forEach((k) => { const [x, y] = k.split(",").map(Number); setLocal(x, y, COLORS.mark); });

  for (const cx of [4, 16]) for (let x = cx; x <= cx + 1; x++) for (let y = 10; y <= 11; y++) setLocal(x, y, COLORS.blush);

  for (const cx of [6, 13]) {
    for (const [x, y] of [[cx, 7], [cx + 1, 7], [cx + 2, 7], [cx, 8], [cx + 1, 8], [cx + 2, 8], [cx, 9], [cx + 1, 9], [cx + 2, 9]])
      setLocal(x, y, COLORS.eye);
    setLocal(cx, 7, COLORS.eyeHi);
  }
  return grid;
}

function rasterize(grid, size) {
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
  const grid = buildGridPixels();

  const icoSizes = [16, 32, 48, 256];
  const icoPngs = icoSizes.map((s) => encodePNG(rasterize(grid, s), s));
  fs.writeFileSync(path.join(outDir, "icon.ico"), encodeICO(icoSizes, icoPngs));

  fs.writeFileSync(path.join(outDir, "icon.png"), encodePNG(rasterize(grid, 512), 512));
  fs.writeFileSync(path.join(outDir, "tray.png"), encodePNG(rasterize(grid, 32), 32));

  console.log("Wrote resources/icon.ico, resources/icon.png (512), resources/tray.png (32)");
}

main();
