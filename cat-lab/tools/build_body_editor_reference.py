"""Build the A2 body-round collaborative pixel-editor artifact (v3).

v3 adds live customization: canvas cols/rows inputs (non-destructive resize),
a ghost-size slider (25-300%), and a "move ghost" drag tool — the reference
photo is now freely positionable/scalable instead of locked to the body zone.
Seed = approved head + ref 418 body recolored to the white coat.
"""
import base64
import io
import json
import os

from PIL import Image

d = os.path.dirname(os.path.abspath(__file__))
REFS = r"C:\Users\fahms\projects-portfolios\personal_projects\pet_assistant\toasty\cat-lab\shutterstock_images"

with open(os.path.join(d, "body_seed.json")) as f:
    seed_doc = json.load(f)
COLS, ROWS = seed_doc["cols"], seed_doc["rows"]
seed = seed_doc["cells"]
ZONE = seed_doc["bodyZone"]  # dx, dy, cols, rows, crop


def img_b64(path, crop=None, scale=2):
    im = Image.open(path).convert("RGB")
    if crop:
        im = im.crop(crop)
    im = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


# ghost: the exact body crop the seed was sampled from (starts aligned to the body zone)
ghost = img_b64(os.path.join(REFS, "Screenshot 2026-07-10 133418.png"), tuple(ZONE["crop"]), 2)
# side panel: the full sitting cat for context + the approved-head source as thumb
thumb418 = img_b64(os.path.join(REFS, "Screenshot 2026-07-10 133418.png"), (90, 60, 375, 400), 1)
thumb409 = img_b64(os.path.join(REFS, "Screenshot 2026-07-10 133409.png"), (60, 110, 390, 350), 1)

html = r"""<title>Toasty A2 — Body Pixel Editor</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  :root {
    color-scheme: light dark;
    --bg: #e9e1cf; --ink: #3b3024; --ink-soft: #6b5d4a;
    --stage: #2b2620; --stage-edge: #423a30; --accent: #bd5f2b;
    --line: rgba(59, 48, 36, 0.16); --shadow: rgba(30, 24, 16, 0.28);
    --card: rgba(59, 48, 36, 0.05);
    --font-display: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
    --font-ui: "Segoe UI", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
    --font-mono: "Cascadia Code", Consolas, "SFMono-Regular", ui-monospace, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#1a1611; --ink:#ece0cb; --ink-soft:#b8a98d; --stage:#100d0a; --stage-edge:#2a241c; --accent:#e8a87c; --line:rgba(236,224,203,0.14); --shadow:rgba(0,0,0,0.5); --card:rgba(236,224,203,0.05); }
  }
  :root[data-theme="dark"] { --bg:#1a1611; --ink:#ece0cb; --ink-soft:#b8a98d; --stage:#100d0a; --stage-edge:#2a241c; --accent:#e8a87c; --line:rgba(236,224,203,0.14); --shadow:rgba(0,0,0,0.5); --card:rgba(236,224,203,0.05); }
  :root[data-theme="light"] { --bg:#e9e1cf; --ink:#3b3024; --ink-soft:#6b5d4a; --stage:#2b2620; --stage-edge:#423a30; --accent:#bd5f2b; --line:rgba(59,48,36,0.16); --shadow:rgba(30,24,16,0.28); --card:rgba(59,48,36,0.05); }

  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; background:var(--bg); color:var(--ink); font-family:var(--font-ui); display:flex; flex-direction:column; align-items:center; gap:26px; padding:44px 18px 70px; }
  .header { display:flex; flex-direction:column; align-items:center; gap:8px; text-align:center; max-width:720px; }
  .eyebrow { font-family:var(--font-mono); font-size:0.72rem; letter-spacing:0.14em; text-transform:uppercase; color:var(--accent); }
  h1 { margin:0; font-family:var(--font-display); font-weight:400; font-size:clamp(1.7rem,4vw,2.4rem); letter-spacing:0.01em; text-wrap:balance; }
  .subhead { margin:0; max-width:62ch; font-size:0.93rem; line-height:1.6; color:var(--ink-soft); text-wrap:balance; }
  .subhead strong { color:var(--ink); }

  .workbench { display:flex; gap:22px; flex-wrap:wrap; justify-content:center; align-items:flex-start; width:min(1240px, 96vw); }

  .ref-col { display:flex; flex-direction:column; gap:12px; width:280px; flex-shrink:0; }
  .panel-label { font-family:var(--font-mono); font-size:0.66rem; letter-spacing:0.1em; text-transform:uppercase; color:var(--accent); border-bottom:1px solid var(--line); padding-bottom:6px; }
  .ref-col img.main { width:100%; height:auto; border-radius:14px; border:1px solid var(--stage-edge); box-shadow:0 14px 34px -16px var(--shadow); image-rendering:pixelated; }
  .thumb-row { display:flex; gap:10px; }
  .thumb-row img { width:calc(50% - 5px); height:auto; border-radius:10px; border:1px solid var(--stage-edge); opacity:0.85; image-rendering:pixelated; }
  .ref-tag { font-family:var(--font-mono); font-size:0.64rem; letter-spacing:0.05em; color:var(--ink-soft); }

  .editor-col { display:flex; flex-direction:column; gap:12px; }
  .canvas-frame { position:relative; border-radius:16px; background:var(--stage); border:1px solid var(--stage-edge); box-shadow:0 18px 44px -18px var(--shadow); padding:14px; }
  canvas#board { display:block; cursor:crosshair; touch-action:none; }

  .toolbar { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
  .toolbar button, .export-bar button {
    font-family:var(--font-mono); font-size:0.7rem; letter-spacing:0.05em; text-transform:uppercase;
    color:var(--ink); background:var(--card); border:1px solid var(--line); border-radius:8px;
    padding:7px 12px; cursor:pointer;
  }
  .toolbar button:hover, .export-bar button:hover { border-color:var(--accent); color:var(--accent); }
  .toolbar button.active { background:var(--accent); color:var(--bg); border-color:var(--accent); }
  .toolbar button:focus-visible, .swatch:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
  .ctl { display:flex; align-items:center; gap:8px; font-family:var(--font-mono); font-size:0.66rem; text-transform:uppercase; letter-spacing:0.05em; color:var(--ink-soft); }
  .ctl input[type="range"] { width:110px; accent-color:var(--accent); }
  .ctl input[type="number"] { width:58px; background:var(--card); color:var(--ink); border:1px solid var(--line); border-radius:6px; padding:4px 6px; font-family:var(--font-mono); font-size:0.7rem; }

  .palette { display:flex; flex-direction:column; gap:6px; }
  .swatch-row { display:flex; gap:6px; align-items:center; }
  .swatch-row .row-tag { font-family:var(--font-mono); font-size:0.62rem; letter-spacing:0.05em; color:var(--ink-soft); width:64px; text-align:right; padding-right:4px; }
  .swatch { width:30px; height:30px; border-radius:8px; border:2px solid var(--line); cursor:pointer; padding:0; }
  .swatch.selected { border-color:var(--accent); box-shadow:0 0 0 2px var(--accent); }

  .export-bar { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
  textarea#export-out { width:100%; height:84px; font-family:var(--font-mono); font-size:0.66rem; background:var(--card); color:var(--ink); border:1px solid var(--line); border-radius:8px; padding:8px; resize:vertical; display:none; }
  .status { font-family:var(--font-mono); font-size:0.64rem; color:var(--ink-soft); min-height:1em; }

  .note { width:min(1240px,96vw); font-size:0.85rem; line-height:1.6; color:var(--ink-soft); background:var(--card); border:1px solid var(--line); border-radius:12px; padding:14px 18px; }
  .note strong { color:var(--ink); }
  .note kbd { font-family:var(--font-mono); font-size:0.72rem; border:1px solid var(--line); border-radius:4px; padding:1px 5px; }

  .theme-toggle { position:fixed; top:16px; right:16px; font-family:var(--font-mono); font-size:0.68rem; letter-spacing:0.06em; text-transform:uppercase; color:var(--ink-soft); background:transparent; border:1px solid var(--line); border-radius:6px; padding:6px 10px; cursor:pointer; }
  .theme-toggle:hover { color:var(--ink); border-color:var(--ink-soft); }
</style>

<button class="theme-toggle" id="theme-toggle" type="button">&#9680; theme</button>

<div class="header">
  <div class="eyebrow">Toasty — Character Lab — Part A2 · body</div>
  <h1>Now Paint the Body</h1>
  <p class="subhead">
    <strong>Your approved head is loaded on top</strong> (still editable — blend the neck
    seam if you want). Below it, ref 418's sitting body is seeded and pre-recolored to your
    white coat. New this round: <strong>resize the canvas</strong> (cols &times; rows),
    <strong>scale the ghost photo</strong> with its slider, and use the
    <strong>move ghost</strong> tool to drag the reference anywhere. Export the JSON when
    the whole cat looks right.
  </p>
</div>

<div class="workbench">
  <div class="ref-col">
    <div class="panel-label">Reference — 418 body (pose source)</div>
    <img class="main" src="data:image/png;base64,__GHOST__" alt="ref 418 body crop" />
    <div class="panel-label">Context</div>
    <div class="thumb-row">
      <img src="data:image/png;base64,__T418__" alt="ref 418 full sitting cat" />
      <img src="data:image/png;base64,__T430__" alt="ref 409 head source" />
    </div>
    <span class="ref-tag">418 full sit pose &middot; 409 your head's source</span>
  </div>

  <div class="editor-col">
    <div class="toolbar">
      <button id="tool-paint" class="active" type="button">&#128396; paint</button>
      <button id="tool-erase" type="button">&#9003; erase</button>
      <button id="tool-pick" type="button">&#128167; pick</button>
      <button id="tool-ghost" type="button">&#10021; move ghost</button>
      <button id="undo" type="button">&#8630; undo</button>
      <button id="redo" type="button">&#8631; redo</button>
      <button id="grid-toggle" class="active" type="button"># grid</button>
    </div>
    <div class="toolbar">
      <span class="ctl">canvas <input id="grid-cols" type="number" min="10" max="100" /> &times; <input id="grid-rows" type="number" min="10" max="100" /></span>
      <span class="ctl">ghost <input id="ghost-alpha" type="range" min="0" max="100" value="0" /></span>
      <span class="ctl">ghost size <input id="ghost-scale" type="range" min="25" max="300" value="100" /></span>
    </div>
    <div class="canvas-frame"><canvas id="board"></canvas></div>
    <div class="palette">
      <div class="swatch-row"><span class="row-tag">409 coat</span><span id="row-neutral"></span></div>
      <div class="swatch-row"><span class="row-tag">tabby</span><span id="row-tabby"></span></div>
    </div>
    <div class="export-bar">
      <button id="export" type="button">&#8681; export grid</button>
      <button id="copy" type="button">copy json</button>
      <button id="reset" type="button">reset to seed</button>
      <span class="status" id="status"></span>
    </div>
    <textarea id="export-out" readonly aria-label="exported grid json"></textarea>
  </div>
</div>

<p class="note">
  <strong>Tips:</strong> drag to paint runs of cells &middot; right-click (or the erase tool)
  clears a cell &middot; <kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Y</kbd> undo/redo
  &middot; growing the canvas never deletes cells, and shrinking just hides what's outside
  (grow again to get it back) &middot; <strong>move ghost</strong> + the size slider line the
  photo up under any part you're working on &middot; when you export, the JSON is the
  complete cat.
</p>

<script>
(function () {
  var CELL = 16;
  var DEFAULT_COLS = __COLS__, DEFAULT_ROWS = __ROWS__;
  var SEED = __SEED__;
  var ZONE = __ZONE__;   // initial ghost placement (the zone the body seed was sampled into)
  var LS_KEY = "toasty-a2-body-v2";

  var NEUTRAL = ["#f4f0ec", "#d8d3cd", "#a8a09a", "#e8b4b8", "#c4828a", "#1f1a17"];
  var TABBY = ["#f0a25c", "#c9752f", "#7a4020", "#fbe8c8", "#e2a3a3", "#2a1a12"];

  var gridCols = DEFAULT_COLS, gridRows = DEFAULT_ROWS;
  var grid = null;
  var ghostBox = { x: ZONE.dx, y: ZONE.dy, w: ZONE.cols, h: ZONE.rows };
  var ghostAlpha = 0;

  try {
    var saved = JSON.parse(localStorage.getItem(LS_KEY));
    if (saved) {
      if (saved.cells) {
        grid = saved.cells;
        gridCols = saved.cols || DEFAULT_COLS;
        gridRows = saved.rows || DEFAULT_ROWS;
        if (saved.ghost) ghostBox = saved.ghost;
        if (typeof saved.ghostAlpha === "number") ghostAlpha = saved.ghostAlpha;
      } else {
        grid = saved; // pre-v3 save shape: raw cells map
      }
    }
  } catch (e) {}
  if (!grid) grid = JSON.parse(JSON.stringify(SEED));

  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");

  var ghostImg = new Image();
  ghostImg.src = document.querySelector(".ref-col img.main").src;

  var showGrid = true;
  var tool = "paint";
  var color = NEUTRAL[0];
  var undoStack = [], redoStack = [];
  var painting = false, strokeChanged = false;
  var ghostDrag = null;

  function save() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        cols: gridCols, rows: gridRows, cells: grid, ghost: ghostBox, ghostAlpha: ghostAlpha
      }));
    } catch (e) {}
  }
  function setStatus(msg) { document.getElementById("status").textContent = msg; }

  function resizeCanvas() {
    canvas.width = gridCols * CELL;
    canvas.height = gridRows * CELL;
    draw();
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (var y = 0; y < gridRows; y++) {
      for (var x = 0; x < gridCols; x++) {
        ctx.fillStyle = ((x + y) % 2) ? "rgba(255,255,255,0.045)" : "rgba(255,255,255,0.02)";
        ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
    }
    Object.keys(grid).forEach(function (key) {
      var xy = key.split(",");
      ctx.fillStyle = grid[key];
      ctx.fillRect(+xy[0] * CELL, +xy[1] * CELL, CELL, CELL);
    });
    if (showGrid) {
      ctx.strokeStyle = "rgba(128,120,110,0.18)";
      ctx.lineWidth = 1;
      for (var gx = 0; gx <= gridCols; gx++) { ctx.beginPath(); ctx.moveTo(gx * CELL + 0.5, 0); ctx.lineTo(gx * CELL + 0.5, canvas.height); ctx.stroke(); }
      for (var gy = 0; gy <= gridRows; gy++) { ctx.beginPath(); ctx.moveTo(0, gy * CELL + 0.5); ctx.lineTo(canvas.width, gy * CELL + 0.5); ctx.stroke(); }
    }
    if (ghostAlpha > 0 && ghostImg.complete) {
      ctx.globalAlpha = ghostAlpha;
      ctx.drawImage(ghostImg, ghostBox.x * CELL, ghostBox.y * CELL, ghostBox.w * CELL, ghostBox.h * CELL);
      ctx.globalAlpha = 1;
    }
    if (tool === "ghost") {
      ctx.strokeStyle = "rgba(232,168,124,0.8)";
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(ghostBox.x * CELL, ghostBox.y * CELL, ghostBox.w * CELL, ghostBox.h * CELL);
      ctx.setLineDash([]);
    }
  }

  function cellAt(evt) {
    var r = canvas.getBoundingClientRect();
    var x = Math.floor((evt.clientX - r.left) / r.width * gridCols);
    var y = Math.floor((evt.clientY - r.top) / r.height * gridRows);
    if (x < 0 || x >= gridCols || y < 0 || y >= gridRows) return null;
    return x + "," + y;
  }

  function applyAt(key, erase) {
    if (erase || tool === "erase") {
      if (key in grid) { delete grid[key]; strokeChanged = true; }
    } else if (tool === "pick") {
      if (key in grid) {
        color = grid[key];
        selectSwatchByColor(color);
        setStatus("picked " + color);
        setTool("paint");
      }
      return;
    } else {
      if (grid[key] !== color) { grid[key] = color; strokeChanged = true; }
    }
    draw();
  }

  function beginStroke() {
    undoStack.push(JSON.stringify(grid));
    if (undoStack.length > 100) undoStack.shift();
    redoStack = [];
    strokeChanged = false;
  }
  function endStroke() {
    if (!strokeChanged && undoStack.length) undoStack.pop();
    if (strokeChanged) { save(); setStatus("saved"); }
    painting = false;
  }

  canvas.addEventListener("pointerdown", function (e) {
    e.preventDefault();
    if (tool === "ghost") {
      ghostDrag = { sx: e.clientX, sy: e.clientY, ox: ghostBox.x, oy: ghostBox.y };
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    var key = cellAt(e);
    if (!key) return;
    painting = true;
    canvas.setPointerCapture(e.pointerId);
    beginStroke();
    applyAt(key, e.button === 2);
  });
  canvas.addEventListener("pointermove", function (e) {
    if (ghostDrag) {
      var r = canvas.getBoundingClientRect();
      ghostBox.x = ghostDrag.ox + (e.clientX - ghostDrag.sx) * (gridCols / r.width);
      ghostBox.y = ghostDrag.oy + (e.clientY - ghostDrag.sy) * (gridRows / r.height);
      draw();
      return;
    }
    if (!painting) return;
    var key = cellAt(e);
    if (key) applyAt(key, (e.buttons & 2) === 2);
  });
  canvas.addEventListener("pointerup", function () {
    if (ghostDrag) { ghostDrag = null; save(); setStatus("ghost moved"); return; }
    if (painting) endStroke();
  });
  canvas.addEventListener("pointercancel", function () {
    if (ghostDrag) { ghostDrag = null; save(); return; }
    if (painting) endStroke();
  });
  canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });

  function undo() {
    if (!undoStack.length) return;
    redoStack.push(JSON.stringify(grid));
    grid = JSON.parse(undoStack.pop());
    save(); draw(); setStatus("undone");
  }
  function redo() {
    if (!redoStack.length) return;
    undoStack.push(JSON.stringify(grid));
    grid = JSON.parse(redoStack.pop());
    save(); draw(); setStatus("redone");
  }
  document.getElementById("undo").addEventListener("click", undo);
  document.getElementById("redo").addEventListener("click", redo);
  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
  });

  function setTool(t) {
    tool = t;
    ["paint", "erase", "pick", "ghost"].forEach(function (name) {
      document.getElementById("tool-" + name).classList.toggle("active", name === t);
    });
    canvas.style.cursor = (t === "ghost") ? "move" : "crosshair";
    draw();
  }
  document.getElementById("tool-paint").addEventListener("click", function () { setTool("paint"); });
  document.getElementById("tool-erase").addEventListener("click", function () { setTool("erase"); });
  document.getElementById("tool-pick").addEventListener("click", function () { setTool("pick"); });
  document.getElementById("tool-ghost").addEventListener("click", function () { setTool("ghost"); });

  document.getElementById("grid-toggle").addEventListener("click", function () {
    showGrid = !showGrid;
    this.classList.toggle("active", showGrid);
    draw();
  });

  var alphaInput = document.getElementById("ghost-alpha");
  alphaInput.value = Math.round(ghostAlpha * 100);
  alphaInput.addEventListener("input", function () {
    ghostAlpha = +this.value / 100;
    save(); draw();
  });

  var scaleInput = document.getElementById("ghost-scale");
  scaleInput.value = Math.round(ghostBox.w / ZONE.cols * 100);
  scaleInput.addEventListener("input", function () {
    var s = +this.value / 100;
    var cx = ghostBox.x + ghostBox.w / 2, cy = ghostBox.y + ghostBox.h / 2;
    ghostBox.w = ZONE.cols * s;
    ghostBox.h = ZONE.rows * s;
    ghostBox.x = cx - ghostBox.w / 2;
    ghostBox.y = cy - ghostBox.h / 2;
    save(); draw();
  });

  var colsInput = document.getElementById("grid-cols");
  var rowsInput = document.getElementById("grid-rows");
  colsInput.value = gridCols;
  rowsInput.value = gridRows;
  function clampDim(v) { return Math.max(10, Math.min(100, Math.round(v) || 10)); }
  colsInput.addEventListener("change", function () {
    gridCols = clampDim(+this.value);
    this.value = gridCols;
    resizeCanvas(); save();
    setStatus("canvas " + gridCols + "×" + gridRows + " — cells outside stay saved");
  });
  rowsInput.addEventListener("change", function () {
    gridRows = clampDim(+this.value);
    this.value = gridRows;
    resizeCanvas(); save();
    setStatus("canvas " + gridCols + "×" + gridRows + " — cells outside stay saved");
  });

  ghostImg.onload = draw;

  var allSwatches = [];
  function makeSwatches(rowId, colors) {
    var host = document.getElementById(rowId);
    colors.forEach(function (c) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "swatch";
      b.style.background = c;
      b.setAttribute("aria-label", "color " + c);
      b.addEventListener("click", function () {
        color = c;
        selectSwatchByColor(c);
        setTool("paint");
      });
      b.dataset.color = c;
      host.appendChild(b);
      allSwatches.push(b);
    });
  }
  function selectSwatchByColor(c) {
    allSwatches.forEach(function (s) { s.classList.toggle("selected", s.dataset.color === c); });
  }
  makeSwatches("row-neutral", NEUTRAL);
  makeSwatches("row-tabby", TABBY);
  selectSwatchByColor(color);

  function exportJson() {
    return JSON.stringify({ cols: gridCols, rows: gridRows, cells: grid });
  }
  document.getElementById("export").addEventListener("click", function () {
    var out = document.getElementById("export-out");
    out.style.display = "block";
    out.value = exportJson();
    out.focus(); out.select();
    setStatus(Object.keys(grid).length + " cells exported — copy the box or hit copy json");
  });
  document.getElementById("copy").addEventListener("click", function () {
    var text = exportJson();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { setStatus("copied to clipboard"); },
        function () { setStatus("copy blocked — use export box"); });
    } else {
      var out = document.getElementById("export-out");
      out.style.display = "block"; out.value = text; out.focus(); out.select();
      setStatus("select-all + copy from the box");
    }
  });

  // two-click arm/confirm — window.confirm() is blocked in the artifact's sandboxed iframe
  var resetArmed = false, resetTimer = null;
  document.getElementById("reset").addEventListener("click", function () {
    if (!resetArmed) {
      resetArmed = true;
      this.textContent = "sure? click again";
      setStatus("this throws away your edits — click reset again to confirm");
      var btn = this;
      resetTimer = setTimeout(function () { resetArmed = false; btn.textContent = "reset to seed"; setStatus(""); }, 4000);
      return;
    }
    clearTimeout(resetTimer);
    resetArmed = false;
    this.textContent = "reset to seed";
    beginStroke();
    grid = JSON.parse(JSON.stringify(SEED));
    strokeChanged = true;
    gridCols = DEFAULT_COLS; gridRows = DEFAULT_ROWS;
    colsInput.value = gridCols; rowsInput.value = gridRows;
    ghostBox = { x: ZONE.dx, y: ZONE.dy, w: ZONE.cols, h: ZONE.rows };
    scaleInput.value = 100;
    endStroke();
    resizeCanvas(); setStatus("reset to seed");
  });

  resizeCanvas();

  var toggle = document.getElementById("theme-toggle");
  var root = document.documentElement;
  toggle.addEventListener("click", function () {
    var current = root.getAttribute("data-theme");
    var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var next;
    if (!current) next = prefersDark ? "light" : "dark";
    else next = current === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
  });
})();
</script>
"""

html = (html
        .replace("__GHOST__", ghost)
        .replace("__T418__", thumb418)
        .replace("__T430__", thumb409)
        .replace("__COLS__", str(COLS))
        .replace("__ROWS__", str(ROWS))
        .replace("__ZONE__", json.dumps(ZONE))
        .replace("__SEED__", json.dumps(seed)))

out_path = os.path.join(d, "toasty-a2-body-editor.html")
with open(out_path, "w", encoding="utf-8") as f:
    f.write(html)
print("wrote", out_path, len(html), "bytes | seed cells:", len(seed), "| default grid:", COLS, "x", ROWS)
