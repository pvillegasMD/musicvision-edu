# App voz — Rediseño visual Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace App voz's dark, single-row control layout with the light/warm page palette, grouped sections, and piano-roll grid/note-border treatment confirmed in the design spec, without changing any existing playback/scoring/report logic.

**Architecture:** Pure-CSS/HTML restructuring of `index.html`'s `<style>` and the top of `<body>` (palette, button styling, three labeled `.section` groups, collapsed `<details>` for rarely-used manual inputs); a new small pure geometry helper (`computeSemitoneGridLines`) in `piano-roll-geometry.js` reused by both the live canvas (`renderPianoRoll()`) and the static report SVG (`buildReportSvg()`); canvas-drawing additions (grid lines + note borders) in `renderPianoRoll()`; matching SVG-string additions in `report-svg.js`; and a new completion-banner mechanism (`showCompletionBanner()`/`hideCompletionBanner()`) that replaces the permanent `#viewReportBtn` toolbar button, wired into the same 3 existing call sites that already call `generateReport()`.

**Tech Stack:** Vanilla HTML/CSS/JS, Canvas 2D API, hand-built SVG strings, Node's built-in `node:test` runner (no frameworks, no build step — this app is a single self-contained `index.html` plus sibling `.js` files loaded via `<script src>`).

## Global Constraints

- No external fonts, no CSS/JS libraries, no build step — every file stays hand-authored and loads via a plain `<script src="./file.js">` tag or inline `<style>`/`<script>` in `index.html`.
- Every existing element `id` referenced by JS (`document.getElementById(...)`) must be preserved exactly — this is a visual/structural reorganization, not a behavior change, except where a task explicitly says otherwise (the completion banner replacing the permanent report button).
- The piano roll and waveform canvases (`#pianoRoll`, `#waveformCanvas`) keep their dark background `#1a1d29` and every existing functional color constant (`COLOR_UPCOMING`, `COLOR_IN_TUNE`, `COLOR_OUT_OF_TUNE`, `COLOR_NO_SIGNAL`, `COLOR_PITCH_LINE`, `COLOR_WAVEFORM`, `COLOR_LOOP_MARKER`) unchanged — do not alter their hex values.
- New page-wide colors (verbatim from the spec): background `#fbf9f5`, main text `#2b2420`, secondary/label text `#a8886a`, card borders `#eee2d3`, input borders `#e3d8c8`, primary-button gradient `#d16f37` → `#b8571f` with shadow `#8a4416`, secondary-button text `#8a7a68` with shadow `#e3d8c8`.
- The piano-roll vertical grid must align to real musical beats (`state.beats`), never an arbitrary fixed pixel/time interval — this was an explicit user correction during design.
- Run `node --test` from `App voz/` after every task; all 97 pre-existing tests plus this plan's new tests must pass (no regressions).
- Every commit happens from inside `App voz/` or with paths prefixed `App voz/` — this repo has other unrelated apps at the root.

---

### Task 1: `computeSemitoneGridLines` pure geometry helper

**Files:**
- Modify: `App voz/piano-roll-geometry.js`
- Test: `App voz/tests/piano-roll-geometry.test.js`

**Interfaces:**
- Produces: `computeSemitoneGridLines(minPitch, maxPitch, canvasHeight) -> number[]` — one y-coordinate (via the existing `pitchToY`) per integer semitone in the inclusive range `[minPitch, maxPitch]`. Exported from `piano-roll-geometry.js` alongside the existing functions. Consumed by Task 3 (both `renderPianoRoll()` in `index.html` and `buildReportSvg()` in `report-svg.js`).

- [ ] **Step 1: Write the failing tests**

Append to `App voz/tests/piano-roll-geometry.test.js`:

```js
test('computeSemitoneGridLines returns one y-coordinate per integer semitone in range', () => {
  const lines = computeSemitoneGridLines(58, 62, 200);
  assert.equal(lines.length, 5);
});

test('computeSemitoneGridLines matches pitchToY for the first and last semitone', () => {
  const lines = computeSemitoneGridLines(60, 64, 100);
  assert.equal(lines[0], pitchToY(60, 60, 64, 100));
  assert.equal(lines[lines.length - 1], pitchToY(64, 60, 64, 100));
});

test('computeSemitoneGridLines only includes integers within a fractional range', () => {
  const lines = computeSemitoneGridLines(58.5, 61.5, 100);
  assert.equal(lines.length, 3);
});

test('computeSemitoneGridLines returns an empty array when the range contains no integer', () => {
  const lines = computeSemitoneGridLines(60.2, 60.8, 100);
  assert.deepEqual(lines, []);
});
```

Also update the destructuring import line at the top of the test file to include the new function:

```js
const { pitchRange, pitchToY, computeNoteRect, desintegrationProgress, pitchPointX, shouldBreakLine, computeSemitoneGridLines } = require('../piano-roll-geometry.js');
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `App voz/`): `node --test`
Expected: 4 new failures with "computeSemitoneGridLines is not defined" (or similar ReferenceError), 97 pre-existing tests still passing.

- [ ] **Step 3: Implement `computeSemitoneGridLines`**

In `App voz/piano-roll-geometry.js`, add this function after `pitchToY` and before `computeNoteRect`:

```js
function computeSemitoneGridLines(minPitch, maxPitch, canvasHeight) {
  const lines = [];
  const start = Math.ceil(minPitch);
  const end = Math.floor(maxPitch);
  for (let pitch = start; pitch <= end; pitch++) {
    lines.push(pitchToY(pitch, minPitch, maxPitch, canvasHeight));
  }
  return lines;
}
```

Update the module.exports line at the bottom of the same file from:

```js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { pitchRange, pitchToY, computeNoteRect, desintegrationProgress, pitchPointX, shouldBreakLine };
}
```

to:

```js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { pitchRange, pitchToY, computeNoteRect, desintegrationProgress, pitchPointX, shouldBreakLine, computeSemitoneGridLines };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test`
Expected: 101 tests, 101 passing, 0 failing.

- [ ] **Step 5: Commit**

```bash
git add "App voz/piano-roll-geometry.js" "App voz/tests/piano-roll-geometry.test.js"
git commit -m "feat(app-voz): add computeSemitoneGridLines geometry helper

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Page palette, button styling, and control-section reorganization

**Files:**
- Modify: `App voz/index.html:1-97` (the `<head><style>` block and the opening of `<body>` through the two `<canvas>` tags)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: no new JS interfaces — every existing element `id` (`songSelect`, `midiInput`, `voiceTypeSelect`, `wavInput`, `instrumentInput`, `instrumentReferenceNote`, `playBtn`, `stopBtn`, `viewReportBtn`, `loopToggleBtn`, `muteWavCheckbox`, `metronomeCheckbox`, `playMidiCheckbox`, `midiStatus`, `wavStatus`, `songNotifyBtn`, `instrumentStatus`, `playbackStatus`, `micBtn`, `micGain`, `levelMeterTrack`, `levelMeterBar`, `calibrateBtn`, `micStatus`, `pitchDisplay`, `latencyStatus`, `waveformCanvas`, `pianoRoll`, `reportPanel`, `reportScrollLeftBtn`, `reportScrollRightBtn`, `downloadTxtBtn`, `downloadSvgBtn`, `closeReportBtn`, `reportSvgContainer`, `reportTextView`) is preserved so every later script line in `index.html` keeps working unchanged. `#viewReportBtn` still exists after this task (still `disabled` by default) — Task 4 is the one that removes it from this toolbar and relocates it into a new banner.

This task is purely visual/structural: no `<script>` content changes, no JS logic changes. There is no meaningful automated test for CSS/layout — verification is manual (open the file in a browser and confirm every control still triggers its existing behavior).

- [ ] **Step 1: Replace the `<style>` block**

In `App voz/index.html`, replace lines 6–24 (the entire `<style>...</style>` block) with:

```html
<style>
  :root {
    --color-bg: #fbf9f5;
    --color-text: #2b2420;
    --color-text-muted: #a8886a;
    --color-border: #eee2d3;
    --color-border-input: #e3d8c8;
    --color-accent-1: #d16f37;
    --color-accent-2: #b8571f;
    --color-accent-shadow: #8a4416;
    --color-secondary-text: #8a7a68;
    --color-secondary-shadow: #e3d8c8;
  }
  body { background:var(--color-bg); color:var(--color-text); font-family: system-ui, sans-serif; margin:0; padding:24px; }
  h1 { font-size:20px; margin:0 0 16px; }
  .section { background:#fff; border:1px solid var(--color-border); border-radius:10px; padding:14px 16px; margin-bottom:16px; }
  .section-label { font-size:12px; text-transform:uppercase; letter-spacing:0.04em; font-weight:600; color:var(--color-text-muted); margin-bottom:10px; }
  .section-row { display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
  #status { font-size:14px; opacity:0.8; margin-bottom:12px; line-height:1.6; }
  #pianoRoll { width:100%; max-width:900px; height:240px; background:#1a1d29; border-radius:8px; display:block; }
  #waveformCanvas { width:100%; max-width:900px; height:60px; background:#1a1d29; border-radius:8px; display:block; margin-bottom:12px; cursor:pointer; }
  button { background:#fff; color:var(--color-secondary-text); border:none; padding:9px 16px; border-radius:8px; cursor:pointer; font-size:14px; font-weight:600; box-shadow: 0 3px 0 var(--color-secondary-shadow); }
  button:disabled { opacity:0.4; cursor:not-allowed; box-shadow:none; }
  button.primary { background:linear-gradient(180deg, var(--color-accent-1), var(--color-accent-2)); color:#fff; box-shadow: 0 3px 0 var(--color-accent-shadow), 0 5px 10px rgba(139,68,22,0.25); }
  button.active { background:var(--color-accent-1); color:#fff; box-shadow: 0 3px 0 var(--color-accent-shadow); }
  #songNotifyBtn { min-width: 220px; }
  #levelMeterTrack { width:220px; height:16px; background:var(--color-bg); border:1px solid var(--color-border-input); border-radius:4px; overflow:hidden; }
  #levelMeterBar { height:100%; width:0%; background:#3ecf6e; transition: width 0.05s linear, background-color 0.1s linear; }
  input[type="range"] { width:160px; }
  select, input[type="file"], input[type="number"] { border:1px solid var(--color-border-input); border-radius:6px; padding:6px 10px; font-size:13px; background:#fff; color:var(--color-text); }
  details.manual-inputs { margin-top:10px; font-size:13px; }
  details.manual-inputs summary { cursor:pointer; color:var(--color-text-muted); }
  details.manual-inputs .section-row { margin-top:10px; }
  .report-controls { display:flex; align-items:center; gap:12px; margin-bottom:8px; }
  .report-controls h2 { margin:0; font-size:16px; }
  #reportSvgContainer { overflow-x:auto; background:#1a1d29; border-radius:8px; max-width:900px; }
  #reportTextView { background:#fff; border:1px solid var(--color-border); color:var(--color-text); padding:12px; border-radius:8px; max-width:900px; overflow-x:auto; white-space:pre-wrap; margin-top:12px; font-size:13px; }
</style>
```

- [ ] **Step 2: Replace the header and control markup**

In the same file, replace lines 27–70 (from `<h1>App voz — Etapa 1</h1>` through the closing `<canvas id="pianoRoll" ...>` tag — leave the `<body>` tag on line 26 itself untouched) with:

```html
  <h1>App voz</h1>

  <div class="section">
    <div class="section-label">Canción</div>
    <div class="section-row">
      <label>Canción:
        <select id="songSelect">
          <option value="" selected disabled>Elige una canción...</option>
        </select>
      </label>
    </div>
    <details class="manual-inputs">
      <summary>Cargar archivos manualmente ▾</summary>
      <div class="section-row">
        <label>MIDI: <input type="file" id="midiInput" accept=".mid,.midi"></label>
        <label>Tipo de voz:
          <select id="voiceTypeSelect">
            <option value="0" selected>Original (sin transportar)</option>
            <option value="-12">Voz masculina (-1 octava)</option>
            <option value="-24">Bajo/Barítono (-2 octavas)</option>
          </select>
        </label>
        <label>WAV: <input type="file" id="wavInput" accept=".wav"></label>
        <label>Instrumento: <input type="file" id="instrumentInput" accept=".wav"></label>
        <label>Nota de referencia: <input type="number" id="instrumentReferenceNote" min="0" max="127" value="60"></label>
      </div>
    </details>
  </div>

  <div class="section">
    <div class="section-label">Reproducción</div>
    <div class="section-row">
      <button id="playBtn" class="primary">Reproducir</button>
      <button id="stopBtn">Detener</button>
      <button id="loopToggleBtn" disabled>Loop</button>
      <button id="viewReportBtn" disabled>Ver informe</button>
      <label><input type="checkbox" id="muteWavCheckbox"> Silenciar pista</label>
      <label><input type="checkbox" id="metronomeCheckbox"> Metrónomo</label>
      <label><input type="checkbox" id="playMidiCheckbox"> Reproducir MIDI</label>
    </div>
  </div>

  <div class="section">
    <div class="section-label">Micrófono</div>
    <div class="section-row">
      <button id="micBtn">Activar micrófono</button>
      <label>Ganancia: <input type="range" id="micGain" min="0" max="2" step="0.01" value="1" disabled></label>
      <div id="levelMeterTrack"><div id="levelMeterBar"></div></div>
      <button id="calibrateBtn" disabled>Calibrar latencia</button>
    </div>
  </div>

  <div id="status">
    <div id="midiStatus">Sin MIDI cargado.</div>
    <div id="wavStatus">Sin WAV cargado.</div>
    <button id="songNotifyBtn" hidden>Informar al profesor</button>
    <div id="instrumentStatus">Sin instrumento cargado.</div>
    <div id="playbackStatus"></div>
    <div id="micStatus">Micrófono no activado.</div>
    <div id="pitchDisplay">Nota detectada: —</div>
    <div id="latencyStatus">Latencia: sin calibrar.</div>
  </div>
  <canvas id="waveformCanvas" width="900" height="60"></canvas>
  <canvas id="pianoRoll" width="900" height="240"></canvas>
```

- [ ] **Step 3: Apply the `.section` class to the report panel**

In the same file, change:

```html
  <div id="reportPanel" hidden>
```

to:

```html
  <div id="reportPanel" class="section" hidden>
```

- [ ] **Step 4: Run the test suite to confirm no regression**

Run (from `App voz/`): `node --test`
Expected: 101 tests, 101 passing (this task touches no `.js` file, so the count from Task 1 is unchanged).

- [ ] **Step 5: Manual verification in a browser**

Open `App voz/index.html` directly in a browser (double-click, or reload if already open via Live Server). Confirm:
- The page uses the light palette (`#fbf9f5` background) everywhere except the two canvases, which stay dark.
- Three labeled sections (Canción, Reproducción, Micrófono) are visible, each with a visible card border and a bottom-shadow on every button.
- The `<details>` under "Canción" is collapsed by default; clicking "Cargar archivos manualmente ▾" expands it to reveal MIDI/tipo de voz/WAV/Instrumento/Nota de referencia.
- Loading a song from `#songSelect` still works (WAV + MIDI auto-load, status text updates).
- `#playBtn` renders with the orange gradient (`.primary`); every other button is white/secondary.
- Pressing Reproducir/Detener still works exactly as before.

- [ ] **Step 6: Commit**

```bash
git add "App voz/index.html"
git commit -m "feat(app-voz): apply light palette and grouped control sections

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Piano-roll grid + note borders (live canvas and report SVG)

**Files:**
- Modify: `App voz/index.html` (the constants block and `renderPianoRoll()`)
- Modify: `App voz/report-svg.js`
- Test: `App voz/tests/report-svg.test.js` (create if it does not already exist — check first with `ls App voz/tests/` before writing; if it exists, append to it following its existing style instead of overwriting)

**Interfaces:**
- Consumes: `computeSemitoneGridLines(minPitch, maxPitch, canvasHeight)` from Task 1 (`piano-roll-geometry.js`, already loaded via `<script src="./piano-roll-geometry.js">` in `index.html`, and already destructured into `report-svg.js`'s `geometryFns` parameter via `buildReportSvg`'s existing call site in `generateReport()`).
- Produces: no new externally-consumed interfaces — this task only changes drawing/rendering code inside `renderPianoRoll()` and `buildReportSvg()`.

- [ ] **Step 1: Add grid/border constants**

In `App voz/index.html`, after this existing line (around line 179):

```js
    const LOOP_MARKER_TRIANGLE_SIZE = 8;
```

add:

```js
    const COLOR_GRID_ROW = 'rgba(255,255,255,0.04)';
    const COLOR_GRID_BEAT = 'rgba(255,255,255,0.05)';
    const COLOR_NOTE_BORDER = 'rgba(0,0,0,0.28)';
    const NOTE_BORDER_WIDTH = 1.5;
```

- [ ] **Step 2: Rewrite `renderPianoRoll()` with grid lines and note borders**

In `App voz/index.html`, replace the entire current `renderPianoRoll()` function (currently lines 250–340, from `function renderPianoRoll() {` through its closing `}` right before `function renderWaveform() {`) with:

```js
    function renderPianoRoll() {
      const canvas = document.getElementById('pianoRoll');
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const { minPitch, maxPitch } = pitchRange(state.notes);
      const currentTime = currentPlaybackTime();
      const view = {
        currentTime,
        pixelsPerSecond: PIXELS_PER_SECOND,
        playheadX: PLAYHEAD_X,
        minPitch, maxPitch,
        canvasHeight: canvas.height,
        rowHeight: ROW_HEIGHT
      };

      ctx.strokeStyle = COLOR_GRID_ROW;
      ctx.beginPath();
      computeSemitoneGridLines(minPitch, maxPitch, canvas.height).forEach((y) => {
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
      });
      ctx.stroke();

      ctx.strokeStyle = COLOR_GRID_BEAT;
      ctx.beginPath();
      state.beats.forEach((beatTime) => {
        const x = pitchPointX(beatTime, currentTime, PIXELS_PER_SECOND, PLAYHEAD_X);
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
      });
      ctx.stroke();

      const isLive = state.sourceNode !== null;

      ctx.lineWidth = NOTE_BORDER_WIDTH;
      state.notes.forEach((note, i) => {
        const rect = computeNoteRect(note, view);

        if (!hasMic()) {
          ctx.fillStyle = COLOR_UPCOMING;
          ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
          ctx.strokeStyle = COLOR_NOTE_BORDER;
          ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
          ctx.strokeStyle = '#ffffff';
          ctx.beginPath();
          ctx.moveTo(rect.x, rect.y + rect.height / 2);
          ctx.lineTo(rect.x + rect.width, rect.y + rect.height / 2);
          ctx.stroke();
          return;
        }

        const status = noteStatus(note, currentTime);

        if (status === 'active' && isLive) {
          const color = i === state.activeNoteIndex ? state.activeNoteColor : 'no-signal';
          ctx.fillStyle =
            color === 'in-tune' ? COLOR_IN_TUNE :
            color === 'out-of-tune' ? COLOR_OUT_OF_TUNE :
            COLOR_NO_SIGNAL;
          ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
          ctx.strokeStyle = COLOR_NOTE_BORDER;
          ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
        } else if (status !== 'past') {
          ctx.fillStyle = COLOR_UPCOMING;
          ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
          ctx.strokeStyle = COLOR_NOTE_BORDER;
          ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
        } else if (!noteWasSung(state.noteProgress[i])) {
          const noteEndTime = note.start + note.duration;
          const progress = desintegrationProgress(currentTime, noteEndTime, SCROLL_OUT_DURATION_SEC);
          const opacity = 1 - progress * (1 - DESINTEGRATION_MIN_OPACITY);
          const scale = 1 - progress * (1 - DESINTEGRATION_MIN_SCALE);
          const scaledWidth = rect.width * scale;
          const scaledHeight = rect.height * scale;
          const scaledX = rect.x + (rect.width - scaledWidth) / 2;
          const scaledY = rect.y + (rect.height - scaledHeight) / 2;
          ctx.save();
          ctx.globalAlpha = opacity;
          ctx.fillStyle = COLOR_OUT_OF_TUNE;
          ctx.fillRect(scaledX, scaledY, scaledWidth, scaledHeight);
          ctx.strokeStyle = COLOR_NOTE_BORDER;
          ctx.strokeRect(scaledX, scaledY, scaledWidth, scaledHeight);
          ctx.restore();
        } else {
          const ratio = tuningRatio(state.noteProgress[i]);
          const greenWidth = rect.width * ratio;
          ctx.fillStyle = COLOR_IN_TUNE;
          ctx.fillRect(rect.x, rect.y, greenWidth, rect.height);
          ctx.fillStyle = COLOR_OUT_OF_TUNE;
          ctx.fillRect(rect.x + greenWidth, rect.y, rect.width - greenWidth, rect.height);
          ctx.strokeStyle = COLOR_NOTE_BORDER;
          ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
        }
      });
      ctx.lineWidth = 1;

      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(PLAYHEAD_X, 0);
      ctx.lineTo(PLAYHEAD_X, canvas.height);
      ctx.stroke();

      if (state.pitchHistory.length > 0) {
        ctx.strokeStyle = COLOR_PITCH_LINE;
        ctx.lineWidth = 2;
        ctx.beginPath();
        state.pitchHistory.forEach((point, i) => {
          const x = pitchPointX(point.time, currentTime, PIXELS_PER_SECOND, PLAYHEAD_X);
          const y = pitchToY(point.pitch, minPitch, maxPitch, canvas.height);
          if (i === 0 || shouldBreakLine(state.pitchHistory[i - 1].time, point.time, PITCH_LINE_GAP_SEC)) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        });
        ctx.stroke();
        ctx.lineWidth = 1;
      }
    }
```

(This adds two `ctx.strokeStyle`/`beginPath`/`stroke` blocks for the horizontal semitone grid and vertical beat grid before the notes loop, sets `ctx.lineWidth = NOTE_BORDER_WIDTH` once before the loop and resets it to `1` right after, and adds one `ctx.strokeStyle = COLOR_NOTE_BORDER; ctx.strokeRect(...)` call in each of the four note-drawing branches — using the full unscaled `rect` in the bicolor branch so the border wraps the whole note, not just its green or red portion.)

- [ ] **Step 3: Run tests to confirm no regression from the `index.html` change**

Run (from `App voz/`): `node --test`
Expected: still 101 passing — `index.html` itself has no automated tests (it's not a `require`-able module), so this step is a sanity check that Task 1/2's tests remain green.

- [ ] **Step 4: Extend `buildReportSvg` with the same grid + note-border treatment**

First check whether `App voz/tests/report-svg.test.js` already exists:

Run: `ls "App voz/tests/" | grep report-svg`

If it does NOT exist, create `App voz/tests/report-svg.test.js` with this full content:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReportSvg } = require('../report-svg.js');
const { pitchRange, computeNoteRect, pitchToY, pitchPointX, shouldBreakLine, computeSemitoneGridLines } = require('../piano-roll-geometry.js');

const geometryFns = { pitchRange, computeNoteRect, pitchToY, pitchPointX, shouldBreakLine, computeSemitoneGridLines };
const colors = { inTune: '#3ecf6e', outOfTune: '#e05a4e', noSignal: '#6b7280', pitchLine: '#f5d90a', gridRow: 'rgba(255,255,255,0.04)', gridBeat: 'rgba(255,255,255,0.05)', noteBorder: 'rgba(0,0,0,0.28)' };
const options = { pixelsPerSecond: 100, rowHeight: 20, height: 200, gapThresholdSec: 0.15, durationSec: 2, colors };

test('buildReportSvg draws one horizontal grid line per semitone in the note range', () => {
  const notes = [{ pitch: 60, start: 0, duration: 1 }];
  const noteProgress = [{ hadSignal: true, timeInTune: 1, timeTotal: 1 }];
  const svg = buildReportSvg(notes, noteProgress, [], options, geometryFns);
  const { minPitch, maxPitch } = pitchRange(notes);
  const expectedLines = computeSemitoneGridLines(minPitch, maxPitch, options.height).length;
  const actualLines = (svg.match(/class="grid-row"/g) || []).length;
  assert.equal(actualLines, expectedLines);
});

test('buildReportSvg draws each note rect with a border stroke', () => {
  const notes = [{ pitch: 60, start: 0, duration: 1 }];
  const noteProgress = [{ hadSignal: true, timeInTune: 1, timeTotal: 1 }];
  const svg = buildReportSvg(notes, noteProgress, [], options, geometryFns);
  assert.ok(svg.includes(`stroke="${colors.noteBorder}"`));
});

test('buildReportSvg still draws the no-signal note fill when the note had no signal', () => {
  const notes = [{ pitch: 60, start: 0, duration: 1 }];
  const noteProgress = [{ hadSignal: false, timeInTune: 0, timeTotal: 0 }];
  const svg = buildReportSvg(notes, noteProgress, [], options, geometryFns);
  assert.ok(svg.includes(`fill="${colors.noSignal}"`));
});
```

If `App voz/tests/report-svg.test.js` already exists, append these same three `test(...)` blocks to the end of the existing file instead (do not duplicate its existing `require`/setup lines — reuse what's already there, adding `computeSemitoneGridLines` to the existing geometry import and adding `gridRow`/`gridBeat`/`noteBorder` to the existing `colors` object if that file defines its own).

- [ ] **Step 5: Run the new report-svg tests to verify they fail**

Run: `node --test`
Expected: the 3 new tests fail (grid lines / border stroke / expected fill not found yet), all other tests still pass.

- [ ] **Step 6: Implement the grid + border additions in `report-svg.js`**

Replace the full current content of `App voz/report-svg.js`:

```js
function round2(value) {
  return Math.round(value * 100) / 100;
}

function buildReportSvg(notes, noteProgress, fullPitchHistory, options, geometryFns) {
  const { pitchRange, computeNoteRect, pitchToY, pitchPointX, shouldBreakLine } = geometryFns;
  const { pixelsPerSecond, rowHeight, height, gapThresholdSec, colors } = options;
  const { minPitch, maxPitch } = pitchRange(notes);
  const notesEnd = notes.reduce((max, n) => Math.max(max, n.start + n.duration), 0);
  const lastPitchTime = fullPitchHistory.length > 0 ? fullPitchHistory[fullPitchHistory.length - 1].time : 0;
  const durationSec = Math.max(notesEnd, options.durationSec || 0, lastPitchTime);
  const width = Math.max(1, Math.round(durationSec * pixelsPerSecond));

  const view = {
    currentTime: 0,
    pixelsPerSecond,
    playheadX: 0,
    minPitch,
    maxPitch,
    canvasHeight: height,
    rowHeight
  };

  const noteRects = notes.map((note, i) => {
    const rect = computeNoteRect(note, view);
    const progress = noteProgress[i];
    if (!progress.hadSignal) {
      return `<rect x="${round2(rect.x)}" y="${round2(rect.y)}" width="${round2(rect.width)}" height="${round2(rect.height)}" fill="${colors.noSignal}" />`;
    }
    const ratio = progress.timeTotal > 0 ? progress.timeInTune / progress.timeTotal : 0;
    const greenWidth = rect.width * ratio;
    return (
      `<rect x="${round2(rect.x)}" y="${round2(rect.y)}" width="${round2(greenWidth)}" height="${round2(rect.height)}" fill="${colors.inTune}" />` +
      `<rect x="${round2(rect.x + greenWidth)}" y="${round2(rect.y)}" width="${round2(rect.width - greenWidth)}" height="${round2(rect.height)}" fill="${colors.outOfTune}" />`
    );
  }).join('\n');

  let pathData = '';
  fullPitchHistory.forEach((point, i) => {
    const x = round2(pitchPointX(point.time, 0, pixelsPerSecond, 0));
    const y = round2(pitchToY(point.pitch, minPitch, maxPitch, height));
    if (i === 0 || shouldBreakLine(fullPitchHistory[i - 1].time, point.time, gapThresholdSec)) {
      pathData += `M ${x} ${y} `;
    } else {
      pathData += `L ${x} ${y} `;
    }
  });
  const pitchPath = fullPitchHistory.length > 0
    ? `<path d="${pathData.trim()}" fill="none" stroke="${colors.pitchLine}" stroke-width="2" />`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n${noteRects}\n${pitchPath}\n</svg>`;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { buildReportSvg };
}
```

with:

```js
function round2(value) {
  return Math.round(value * 100) / 100;
}

function buildReportSvg(notes, noteProgress, fullPitchHistory, options, geometryFns) {
  const { pitchRange, computeNoteRect, pitchToY, pitchPointX, shouldBreakLine, computeSemitoneGridLines } = geometryFns;
  const { pixelsPerSecond, rowHeight, height, gapThresholdSec, colors } = options;
  const { minPitch, maxPitch } = pitchRange(notes);
  const notesEnd = notes.reduce((max, n) => Math.max(max, n.start + n.duration), 0);
  const lastPitchTime = fullPitchHistory.length > 0 ? fullPitchHistory[fullPitchHistory.length - 1].time : 0;
  const durationSec = Math.max(notesEnd, options.durationSec || 0, lastPitchTime);
  const width = Math.max(1, Math.round(durationSec * pixelsPerSecond));

  const view = {
    currentTime: 0,
    pixelsPerSecond,
    playheadX: 0,
    minPitch,
    maxPitch,
    canvasHeight: height,
    rowHeight
  };

  const gridColor = colors.gridRow || 'rgba(255,255,255,0.04)';
  const beatGridColor = colors.gridBeat || 'rgba(255,255,255,0.05)';
  const noteBorderColor = colors.noteBorder || 'rgba(0,0,0,0.28)';

  const gridRowLines = computeSemitoneGridLines(minPitch, maxPitch, height)
    .map((y) => `<line class="grid-row" x1="0" y1="${round2(y)}" x2="${width}" y2="${round2(y)}" stroke="${gridColor}" />`)
    .join('\n');

  const beats = options.beats || [];
  const gridBeatLines = beats
    .map((beatTime) => {
      const x = round2(pitchPointX(beatTime, 0, pixelsPerSecond, 0));
      return `<line class="grid-beat" x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="${beatGridColor}" />`;
    })
    .join('\n');

  const noteRects = notes.map((note, i) => {
    const rect = computeNoteRect(note, view);
    const progress = noteProgress[i];
    if (!progress.hadSignal) {
      return `<rect x="${round2(rect.x)}" y="${round2(rect.y)}" width="${round2(rect.width)}" height="${round2(rect.height)}" fill="${colors.noSignal}" stroke="${noteBorderColor}" stroke-width="1.5" />`;
    }
    const ratio = progress.timeTotal > 0 ? progress.timeInTune / progress.timeTotal : 0;
    const greenWidth = rect.width * ratio;
    return (
      `<rect x="${round2(rect.x)}" y="${round2(rect.y)}" width="${round2(greenWidth)}" height="${round2(rect.height)}" fill="${colors.inTune}" />` +
      `<rect x="${round2(rect.x + greenWidth)}" y="${round2(rect.y)}" width="${round2(rect.width - greenWidth)}" height="${round2(rect.height)}" fill="${colors.outOfTune}" />` +
      `<rect x="${round2(rect.x)}" y="${round2(rect.y)}" width="${round2(rect.width)}" height="${round2(rect.height)}" fill="none" stroke="${noteBorderColor}" stroke-width="1.5" />`
    );
  }).join('\n');

  let pathData = '';
  fullPitchHistory.forEach((point, i) => {
    const x = round2(pitchPointX(point.time, 0, pixelsPerSecond, 0));
    const y = round2(pitchToY(point.pitch, minPitch, maxPitch, height));
    if (i === 0 || shouldBreakLine(fullPitchHistory[i - 1].time, point.time, gapThresholdSec)) {
      pathData += `M ${x} ${y} `;
    } else {
      pathData += `L ${x} ${y} `;
    }
  });
  const pitchPath = fullPitchHistory.length > 0
    ? `<path d="${pathData.trim()}" fill="none" stroke="${colors.pitchLine}" stroke-width="2" />`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n${gridRowLines}\n${gridBeatLines}\n${noteRects}\n${pitchPath}\n</svg>`;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { buildReportSvg };
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `node --test`
Expected: 104 tests, 104 passing.

- [ ] **Step 8: Wire the vertical grid's beat list and border colors into the live `generateReport()` call**

In `App voz/index.html`, find `generateReport()` (the function that calls `buildReportSvg`). Replace this exact block:

```js
      const svg = buildReportSvg(
        state.notes,
        state.noteProgress,
        state.fullPitchHistory,
        {
          pixelsPerSecond: PIXELS_PER_SECOND,
          rowHeight: ROW_HEIGHT,
          height: CANVAS_HEIGHT,
          gapThresholdSec: PITCH_LINE_GAP_SEC,
          durationSec: state.durationSec,
          colors: {
            inTune: COLOR_IN_TUNE,
            outOfTune: COLOR_OUT_OF_TUNE,
            noSignal: COLOR_NO_SIGNAL,
            pitchLine: COLOR_PITCH_LINE
          }
        },
        { pitchRange, computeNoteRect, pitchToY, pitchPointX, shouldBreakLine }
      );
```

with:

```js
      const svg = buildReportSvg(
        state.notes,
        state.noteProgress,
        state.fullPitchHistory,
        {
          pixelsPerSecond: PIXELS_PER_SECOND,
          rowHeight: ROW_HEIGHT,
          height: CANVAS_HEIGHT,
          gapThresholdSec: PITCH_LINE_GAP_SEC,
          durationSec: state.durationSec,
          beats: state.beats,
          colors: {
            inTune: COLOR_IN_TUNE,
            outOfTune: COLOR_OUT_OF_TUNE,
            noSignal: COLOR_NO_SIGNAL,
            pitchLine: COLOR_PITCH_LINE,
            gridRow: COLOR_GRID_ROW,
            gridBeat: COLOR_GRID_BEAT,
            noteBorder: COLOR_NOTE_BORDER
          }
        },
        { pitchRange, computeNoteRect, pitchToY, pitchPointX, shouldBreakLine, computeSemitoneGridLines }
      );
```

- [ ] **Step 9: Manual verification in a browser**

Reload `App voz/index.html`, load a song (e.g. "Three Little Birds"), and confirm: the piano roll shows a faint horizontal line per semitone and faint vertical lines aligned to the beat marks (compare against where the metronome clicks land with "Metrónomo" checked), and every note rectangle has a visible thin dark border, including two consecutive same-pitch notes reading as separate blocks. Play the song to completion and open "Ver informe" — the report SVG should show the same grid + border treatment.

- [ ] **Step 10: Commit**

```bash
git add "App voz/index.html" "App voz/report-svg.js" "App voz/tests/report-svg.test.js"
git commit -m "feat(app-voz): add semitone/beat grid and note borders to piano roll and report

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Completion banner replaces the permanent "Ver informe" button

**Files:**
- Modify: `App voz/index.html`

**Interfaces:**
- Consumes: `state.lastReport.stats.inTunePercent` (already produced by the existing `computeReportStats` in `report-utils.js` — verified present, no change needed there).
- Produces: `showCompletionBanner()` and `hideCompletionBanner()` — module-scope functions in `index.html`'s inline `<script>`, called from `generateReport()` and from the 3 existing playback-start/stop code paths that currently hide `#reportPanel`.

- [ ] **Step 1: Add the banner CSS**

In `App voz/index.html`, inside the `<style>` block, immediately after this existing line:

```css
  #reportTextView { background:#fff; border:1px solid var(--color-border); color:var(--color-text); padding:12px; border-radius:8px; max-width:900px; overflow-x:auto; white-space:pre-wrap; margin-top:12px; font-size:13px; }
```

add:

```css
  #completionBanner { max-width:900px; background:#fff3e8; border:1px solid #f0d3ae; color:#8a5a2c; border-radius:8px; padding:12px 16px; margin-bottom:16px; display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
  #completionBanner button { padding:6px 14px; }
```

- [ ] **Step 2: Remove `#viewReportBtn` from the Reproducción section and add the banner markup**

In `App voz/index.html`, in the Reproducción section written by Task 2, remove this line:

```html
      <button id="viewReportBtn" disabled>Ver informe</button>
```

so the Reproducción section's button row reads:

```html
      <button id="playBtn" class="primary">Reproducir</button>
      <button id="stopBtn">Detener</button>
      <button id="loopToggleBtn" disabled>Loop</button>
      <label><input type="checkbox" id="muteWavCheckbox"> Silenciar pista</label>
      <label><input type="checkbox" id="metronomeCheckbox"> Metrónomo</label>
      <label><input type="checkbox" id="playMidiCheckbox"> Reproducir MIDI</label>
```

Then, immediately after the closing `</canvas>` tag of `#pianoRoll` and before the `<div id="reportPanel" ...>` block, add:

```html
  <div id="completionBanner" hidden>
    <span id="completionBannerText"></span>
    <button id="viewReportBtn" class="primary">Ver informe</button>
  </div>
```

(`#viewReportBtn` keeps its id — it moves from the toolbar into the banner, so the existing `document.getElementById('viewReportBtn').addEventListener('click', showReport)` line needs no change. It no longer needs a `disabled` attribute since it only exists in the DOM inside a banner that itself starts `hidden`.)

- [ ] **Step 3: Replace `generateReport()` to show the banner instead of auto-opening the report**

Replace this exact block in `App voz/index.html`:

```js
      state.lastReport = { stats, text, svg };
      document.getElementById('viewReportBtn').disabled = false;
      showReport();
    }
```

with:

```js
      state.lastReport = { stats, text, svg };
      showCompletionBanner();
    }

    function showCompletionBanner() {
      if (!state.lastReport) return;
      const pct = Math.round(state.lastReport.stats.inTunePercent);
      document.getElementById('completionBannerText').textContent = `Terminaste — ${pct}% afinado.`;
      document.getElementById('completionBanner').hidden = false;
    }

    function hideCompletionBanner() {
      document.getElementById('completionBanner').hidden = true;
    }
```

- [ ] **Step 4: Hide the banner whenever a new playback starts**

In `App voz/index.html`, inside `play()`, find this line:

```js
      document.getElementById('reportPanel').hidden = true;
```

and add a call right after it:

```js
      document.getElementById('reportPanel').hidden = true;
      hideCompletionBanner();
```

- [ ] **Step 5: Run the test suite to confirm no regression**

Run (from `App voz/`): `node --test`
Expected: 104 tests, 104 passing (this task touches no `.js` module file).

- [ ] **Step 6: Manual verification in a browser**

Reload `App voz/index.html`, confirm `#viewReportBtn` no longer appears as a permanent disabled button in the Reproducción section. Load a song, sing along or let it play through untouched, and confirm: (a) when playback ends (naturally, via Detener, or via the silence auto-stop), a banner appears below the piano roll reading "Terminaste — N% afinado." with an orange "Ver informe" button; (b) clicking that button opens `#reportPanel` exactly as `showReport()` did before; (c) pressing Reproducir again immediately hides the banner.

- [ ] **Step 7: Commit**

```bash
git add "App voz/index.html"
git commit -m "feat(app-voz): replace permanent Ver informe button with completion banner

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Update the app's context doc

**Files:**
- Modify: `App voz/musicvision_contexto.md`

**Interfaces:** none — documentation only.

- [ ] **Step 1: Read the current file**

Run: `cat "App voz/musicvision_contexto.md"` and find the "Características implementadas" and "Pendientes / decisiones diferidas" sections (following this file's established per-feature pattern from every prior feature this session).

- [ ] **Step 2: Append a new "Características implementadas" entry**

Add a new subsection (matching the existing style/heading level used for prior entries like the octave shifter, informe de desempeño, etc.) describing:
- The light/warm page palette via CSS custom properties in `:root`, with the piano roll and waveform canvases intentionally kept on the dark `#1a1d29` background.
- The three grouped control sections (Canción / Reproducción / Micrófono) with rarely-used manual file inputs collapsed behind a native `<details>`.
- The completion banner (`#completionBanner`, `showCompletionBanner()`/`hideCompletionBanner()`) that replaced the permanent `#viewReportBtn` toolbar button — it now only appears once a report exists, right below the piano roll, and hides again when a new playback starts.
- The semitone/beat grid (`computeSemitoneGridLines` in `piano-roll-geometry.js`, reused by both `renderPianoRoll()` and `buildReportSvg()`) and the subtle per-note border (`COLOR_NOTE_BORDER`), both applied identically to the live piano roll and the static report SVG.

- [ ] **Step 3: Commit**

```bash
git add "App voz/musicvision_contexto.md"
git commit -m "docs(app-voz): document the visual redesign

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
