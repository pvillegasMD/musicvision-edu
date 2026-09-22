# App voz — Etapa 7: Calibración de latencia + línea de canto en tiempo real — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Draw a real-time pitch line over the piano roll (the original brief's vision, never built) that shows the user's sung pitch as it happens, alongside the existing note-rectangle coloring — and calibrate a per-device latency offset (an interactive "say Ta on each click" test) that corrects both the line's position and the existing color/auto-stop judgment logic, so a mic reading that arrives late doesn't get blamed on the wrong note.

**Architecture:** Three new pure functions get added to the existing pure-logic files, plus one new pure file (`latency-calibration.js`, same dual-export pattern as the rest) — covered by Node tests before any DOM code touches them. `index.html` then wires them in: every frame, `mainLoop` computes `judgmentTime = currentTime - state.latencyOffsetSec` and uses it (instead of the real `currentTime`) everywhere a mic reading gets attributed to a note or beat — `updateNoteProgress`, the Etapa 6 auto-stop check, and a new rolling `state.pitchHistory` buffer that `renderPianoRoll` draws as a polyline on top of the note rectangles. The visual scroll position of the rectangles themselves, and the WAV's own playback, are never touched — only mic-driven judgments and the new line's own historical points use the corrected clock. Calibration reuses the existing `playMetronomeClick` sound and the same per-frame `peak`/`detectedFrequency` detection `mainLoop` already runs — no second audio-analysis loop.

**Tech Stack:** Vanilla JS, Web Audio API, Canvas 2D, `localStorage`. No npm, no build, no external libraries — same as prior etapas.

## Global Constraints

- No external libraries, no npm packages, no build step. The app remains `index.html` + `midi-parser.js` + `piano-roll-geometry.js` + `audio-level.js` + `pitch-detection.js` + `note-utils.js` + `note-tuning.js` + `silence-guard.js` + a new `latency-calibration.js` — still zero-build, still opens with a double-click (or via a local static server for browser-tool verification, same as every prior etapa).
- Automated tests exist only for pure, DOM-free logic (`node --test tests/*.test.js` from `App voz/`). Everything that touches `state`, the canvas, Web Audio, or `localStorage` is verified manually in a real browser, same established pattern as Etapas 1-6.
- **The visual scroll of note rectangles, the playhead, and the WAV's own audio timing are never shifted by the latency offset.** Only three things use `judgmentTime` (`currentTime - state.latencyOffsetSec`) instead of the real `currentTime`: the note/beat lookup inside `updateNoteProgress`, the auto-stop's `state.lastSignalTime`/`countUnsungBeats` comparison, and the timestamp recorded on each new pitch-history point. Everything else keeps using the real, uncorrected `currentTime`.
- **The pitch line coexists with the existing note-rectangle coloring** — it does not replace it. Both render every frame; the line draws on top.
- **`state.latencyOffsetSec` defaults to `0`** (loaded from `localStorage` key `appVozLatencyOffsetSec` at page load, falling back to `0` if absent/invalid) — with no calibration ever run, `judgmentTime === currentTime` and nothing in this etapa changes existing behavior.
- Calibration is 4 trials, one click per second, reusing `playMetronomeClick(audioContext, when)` exactly as-is (no changes to that function). A trial is valid only if a clear signal (`peak > 0.02`, same threshold used everywhere else in this app) is detected within 900ms after its click. The final offset is the median of valid trials (at least 2 required), computed by a pure function — never a DOM concern.
- Calibration piggybacks on `mainLoop`'s existing per-frame `peak`/`detectedFrequency` computation — it does not start a second detection loop, and it works independently of whether a MIDI/WAV is loaded (only requires the mic to be active).
- Continue on the existing branch/worktree from prior etapas (`worktree-app-voz-etapa1`) — don't create a new worktree for this plan.
- This stage does not change `centsOffTarget`, `isInTune`, `noteStatus`, `accumulateTuning`, `tuningRatio`, `liveNoteColor`, `noteWasSung`, `countUnsungBeats`, `desintegrationProgress`, `computeNoteRect`, `pitchRange`, or any of their existing tests — only additive changes.

---

### Task 1: `computeCalibrationOffset` pure function (new file `latency-calibration.js`)

**Files:**
- Create: `App voz/latency-calibration.js`
- Create: `App voz/tests/latency-calibration.test.js`
- Modify: `App voz/index.html`

**Interfaces:**
- Produces: `computeCalibrationOffset(deltas, minValid = 2, minDelta = 0, maxDelta = 0.5) -> number | null`. `deltas` is an array where each entry is either a number (seconds between a calibration click and the detected "Ta") or `null` (no detection within that trial's window). Filters out `null`s and anything outside `[minDelta, maxDelta]`, then returns the median of what's left — or `null` if fewer than `minValid` entries survive. Same dual-export pattern as every other pure file in this app.

- [ ] **Step 1: Write the failing tests**

Create `App voz/tests/latency-calibration.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { computeCalibrationOffset } = require('../latency-calibration.js');

test('computeCalibrationOffset returns the median of valid deltas (odd count)', () => {
  assert.equal(computeCalibrationOffset([0.05, 0.08, 0.06]), 0.06);
});

test('computeCalibrationOffset averages the two middle values for an even count of valid deltas', () => {
  const result = computeCalibrationOffset([0.04, 0.05, 0.08, 0.07]);
  assert.ok(Math.abs(result - 0.06) < 1e-9);
});

test('computeCalibrationOffset ignores null trials (missed detections)', () => {
  assert.equal(computeCalibrationOffset([0.05, null, 0.06, 0.07]), 0.06);
});

test('computeCalibrationOffset ignores deltas outside the default [0, 0.5] range', () => {
  const result = computeCalibrationOffset([0.05, 0.06, 0.9, -0.1]);
  assert.ok(Math.abs(result - 0.055) < 1e-9);
});

test('computeCalibrationOffset returns null when fewer than minValid deltas remain', () => {
  assert.equal(computeCalibrationOffset([0.05, null, null, null]), null);
});

test('computeCalibrationOffset honors custom minValid, minDelta and maxDelta', () => {
  assert.equal(computeCalibrationOffset([0.9], 1, 0, 1), 0.9);
  assert.equal(computeCalibrationOffset([0.9], 2, 0, 1), null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "App voz" && node --test tests/latency-calibration.test.js`
Expected: FAIL — cannot find module `../latency-calibration.js`.

- [ ] **Step 3: Write the implementation**

Create `App voz/latency-calibration.js`:

```js
function computeCalibrationOffset(deltas, minValid = 2, minDelta = 0, maxDelta = 0.5) {
  const valid = deltas.filter(d => d !== null && d >= minDelta && d <= maxDelta);
  if (valid.length < minValid) return null;
  const sorted = [...valid].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { computeCalibrationOffset };
}
```

- [ ] **Step 4: Load it in the browser**

In `App voz/index.html`, change:

```html
  <script src="./midi-parser.js"></script>
  <script src="./piano-roll-geometry.js"></script>
  <script src="./audio-level.js"></script>
  <script src="./pitch-detection.js"></script>
  <script src="./note-utils.js"></script>
  <script src="./note-tuning.js"></script>
  <script src="./silence-guard.js"></script>
  <script>
```

to:

```html
  <script src="./midi-parser.js"></script>
  <script src="./piano-roll-geometry.js"></script>
  <script src="./audio-level.js"></script>
  <script src="./pitch-detection.js"></script>
  <script src="./note-utils.js"></script>
  <script src="./note-tuning.js"></script>
  <script src="./silence-guard.js"></script>
  <script src="./latency-calibration.js"></script>
  <script>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd "App voz" && node --test tests/latency-calibration.test.js`
Expected: PASS — 6 tests, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add "App voz/latency-calibration.js" "App voz/tests/latency-calibration.test.js" "App voz/index.html"
git commit -m "feat(app-voz): add computeCalibrationOffset pure function"
```

---

### Task 2: `pitchPointX` and `shouldBreakLine` pure functions (`piano-roll-geometry.js`)

**Files:**
- Modify: `App voz/piano-roll-geometry.js`
- Modify: `App voz/tests/piano-roll-geometry.test.js`

**Interfaces:**
- Produces: `pitchPointX(pointTime, currentTime, pixelsPerSecond, playheadX) -> number` — same time-to-x mapping `computeNoteRect` already uses for a note's `start`, applied to a single point in time. `shouldBreakLine(prevTime, nextTime, gapThresholdSec = 0.15) -> boolean` — `true` when two consecutive pitch-history points are far enough apart in time that they represent a real silence, not just consecutive frames.

- [ ] **Step 1: Write the failing tests**

In `App voz/tests/piano-roll-geometry.test.js`, change the require line from:

```js
const { pitchRange, pitchToY, computeNoteRect, desintegrationProgress } = require('../piano-roll-geometry.js');
```

to:

```js
const { pitchRange, pitchToY, computeNoteRect, desintegrationProgress, pitchPointX, shouldBreakLine } = require('../piano-roll-geometry.js');
```

Then add these tests at the end of the file:

```js

test('pitchPointX places a point using the same time-to-x mapping as computeNoteRect', () => {
  assert.equal(pitchPointX(1, 0, 100, 50), 150);
  assert.equal(pitchPointX(0, 1, 100, 50), -50);
});

test('shouldBreakLine is false within the default 150ms threshold, true beyond it', () => {
  assert.equal(shouldBreakLine(1, 1.1), false);
  assert.equal(shouldBreakLine(1, 1.2), true);
});

test('shouldBreakLine respects a custom gap threshold', () => {
  assert.equal(shouldBreakLine(1, 1.3, 0.5), false);
  assert.equal(shouldBreakLine(1, 1.6, 0.5), true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "App voz" && node --test tests/piano-roll-geometry.test.js`
Expected: FAIL — `pitchPointX`/`shouldBreakLine` are `undefined`.

- [ ] **Step 3: Write the implementation**

In `App voz/piano-roll-geometry.js`, change:

```js
function desintegrationProgress(currentTime, noteEndTime, scrollOutDurationSec) {
  if (scrollOutDurationSec <= 0) return 1;
  const elapsed = currentTime - noteEndTime;
  return Math.max(0, Math.min(1, elapsed / scrollOutDurationSec));
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { pitchRange, pitchToY, computeNoteRect, desintegrationProgress };
}
```

to:

```js
function desintegrationProgress(currentTime, noteEndTime, scrollOutDurationSec) {
  if (scrollOutDurationSec <= 0) return 1;
  const elapsed = currentTime - noteEndTime;
  return Math.max(0, Math.min(1, elapsed / scrollOutDurationSec));
}

function pitchPointX(pointTime, currentTime, pixelsPerSecond, playheadX) {
  return playheadX + (pointTime - currentTime) * pixelsPerSecond;
}

function shouldBreakLine(prevTime, nextTime, gapThresholdSec = 0.15) {
  return (nextTime - prevTime) > gapThresholdSec;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { pitchRange, pitchToY, computeNoteRect, desintegrationProgress, pitchPointX, shouldBreakLine };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "App voz" && node --test tests/piano-roll-geometry.test.js`
Expected: PASS — 11 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add "App voz/piano-roll-geometry.js" "App voz/tests/piano-roll-geometry.test.js"
git commit -m "feat(app-voz): add pitchPointX and shouldBreakLine pure functions"
```

---

### Task 3: `judgmentTime` + pitch-history recording (`index.html`)

**Files:**
- Modify: `App voz/index.html`

**Interfaces:**
- Consumes: `frequencyToMidi` (already global via the existing `note-utils.js` script tag).
- Produces: `state.pitchHistory` (`{time, pitch}[]`, the rolling buffer of recent detected pitches, timestamped with `judgmentTime`), `state.latencyOffsetSec` (loaded from `localStorage` at page load, `0` by default). `judgmentTime` (`currentTime - state.latencyOffsetSec`) is computed once per frame inside `mainLoop` and becomes what `updateNoteProgress` and the auto-stop check receive instead of the real `currentTime` — `updateNoteProgress`'s own body is unchanged, only what `mainLoop` passes into it changes.

- [ ] **Step 1: Add `pitchHistory` and `latencyOffsetSec` to `state`, and load the stored offset**

Change:

```js
    const state = {
      audioContext: new (window.AudioContext || window.webkitAudioContext)(),
      audioBuffer: null,
      notes: [],
      durationSec: 0,
      sourceNode: null,
      playStartTime: 0,
      voces: [],
      noteProgress: [],
      lastFrameTime: null,
      activeNoteIndex: null,
      activeNoteColor: null,
      lastActiveNoteIndex: null,
      lastActiveNoteColor: null,
      frozenTime: null,
      beats: [],
      metronomeNodes: [],
      lastSignalTime: 0
    };

    state.wavGainNode = state.audioContext.createGain();
```

to:

```js
    const state = {
      audioContext: new (window.AudioContext || window.webkitAudioContext)(),
      audioBuffer: null,
      notes: [],
      durationSec: 0,
      sourceNode: null,
      playStartTime: 0,
      voces: [],
      noteProgress: [],
      lastFrameTime: null,
      activeNoteIndex: null,
      activeNoteColor: null,
      lastActiveNoteIndex: null,
      lastActiveNoteColor: null,
      frozenTime: null,
      beats: [],
      metronomeNodes: [],
      lastSignalTime: 0,
      pitchHistory: [],
      latencyOffsetSec: 0
    };

    const storedLatencyOffset = parseFloat(localStorage.getItem('appVozLatencyOffsetSec'));
    if (Number.isFinite(storedLatencyOffset)) {
      state.latencyOffsetSec = storedLatencyOffset;
    }

    state.wavGainNode = state.audioContext.createGain();
```

- [ ] **Step 2: Add the new constants**

Change:

```js
    const SCROLL_OUT_DURATION_SEC = PLAYHEAD_X / PIXELS_PER_SECOND;
    const DESINTEGRATION_MIN_OPACITY = 0.15;
    const DESINTEGRATION_MIN_SCALE = 0.6;
    const SILENCE_STOP_BEATS = 8;
```

to:

```js
    const SCROLL_OUT_DURATION_SEC = PLAYHEAD_X / PIXELS_PER_SECOND;
    const DESINTEGRATION_MIN_OPACITY = 0.15;
    const DESINTEGRATION_MIN_SCALE = 0.6;
    const SILENCE_STOP_BEATS = 8;
    const CANVAS_WIDTH = document.getElementById('pianoRoll').width;
    const MAX_PITCH_HISTORY_SEC = (PLAYHEAD_X + CANVAS_WIDTH) / PIXELS_PER_SECOND;
    const PITCH_LINE_GAP_SEC = 0.15;
```

- [ ] **Step 3: Reset `pitchHistory` alongside the rest of the per-playthrough state**

Change:

```js
    function resetNoteProgress() {
      state.noteProgress = state.notes.map(() => ({ timeInTune: 0, timeTotal: 0, hadSignal: false }));
      state.activeNoteIndex = null;
      state.activeNoteColor = null;
      state.lastActiveNoteIndex = null;
      state.lastActiveNoteColor = null;
      state.frozenTime = null;
    }
```

to:

```js
    function resetNoteProgress() {
      state.noteProgress = state.notes.map(() => ({ timeInTune: 0, timeTotal: 0, hadSignal: false }));
      state.activeNoteIndex = null;
      state.activeNoteColor = null;
      state.lastActiveNoteIndex = null;
      state.lastActiveNoteColor = null;
      state.frozenTime = null;
      state.pitchHistory = [];
    }
```

- [ ] **Step 4: Compute `judgmentTime`, record pitch history, and use `judgmentTime` for judgment**

Change:

```js
    function mainLoop() {
      const now = state.audioContext.currentTime;
      const deltaSeconds = state.lastFrameTime === null ? 0 : now - state.lastFrameTime;
      state.lastFrameTime = now;

      const currentTime = currentPlaybackTime();
      let detectedFrequency = null;
      if (state.voces[0]) {
        const { peak } = state.voces[0].getLevel();
        updateLevelMeter(peak);
        detectedFrequency = peak > 0.02 ? state.voces[0].getPitch() : null;
        updatePitchDisplay(detectedFrequency);
      }

      if (detectedFrequency !== null) {
        state.lastSignalTime = currentTime;
      }

      if (hasMic() && state.sourceNode && countUnsungBeats(state.beats, state.notes, state.lastSignalTime, currentTime) >= SILENCE_STOP_BEATS) {
        stopPlayback('Reproducción detenida: no se detectó canto durante varios pulsos.');
      }

      updateNoteProgress(currentTime, detectedFrequency, deltaSeconds);
      renderPianoRoll();

      requestAnimationFrame(mainLoop);
    }
```

to:

```js
    function mainLoop() {
      const now = state.audioContext.currentTime;
      const deltaSeconds = state.lastFrameTime === null ? 0 : now - state.lastFrameTime;
      state.lastFrameTime = now;

      const currentTime = currentPlaybackTime();
      const judgmentTime = currentTime - state.latencyOffsetSec;
      let detectedFrequency = null;
      if (state.voces[0]) {
        const { peak } = state.voces[0].getLevel();
        updateLevelMeter(peak);
        detectedFrequency = peak > 0.02 ? state.voces[0].getPitch() : null;
        updatePitchDisplay(detectedFrequency);
      }

      if (detectedFrequency !== null) {
        state.lastSignalTime = judgmentTime;
      }

      if (hasMic() && state.sourceNode && countUnsungBeats(state.beats, state.notes, state.lastSignalTime, judgmentTime) >= SILENCE_STOP_BEATS) {
        stopPlayback('Reproducción detenida: no se detectó canto durante varios pulsos.');
      }

      if (hasMic() && state.sourceNode && detectedFrequency !== null) {
        state.pitchHistory.push({ time: judgmentTime, pitch: frequencyToMidi(detectedFrequency) });
      }
      state.pitchHistory = state.pitchHistory.filter((p) => p.time > currentTime - MAX_PITCH_HISTORY_SEC);

      updateNoteProgress(judgmentTime, detectedFrequency, deltaSeconds);
      renderPianoRoll();

      requestAnimationFrame(mainLoop);
    }
```

(`updateNoteProgress`'s own function body is untouched by this task — it already took a time parameter named `currentTime` and only ever passed it to `noteStatus`, so passing `judgmentTime` into that same parameter is a call-site change only.)

- [ ] **Step 5: Manual verification**

No automated test — real `state`/timing behavior, verified in a real browser per this app's established pattern.

**Harness note (from Etapa 6):** this browser-automation tab reports `document.visibilityState: "visible"` even when unfocused, so `mainLoop`'s own `requestAnimationFrame` self-reschedule can keep firing in the background while you drive frames manually. If your script depends on only your manual `mainLoop()` calls advancing state, temporarily neutralize `window.requestAnimationFrame` (save the original, restore it at the end). Reload the page between runs to avoid stale state from a previous run.

1. Start a local static server in `App voz/` (`python3 -m http.server <puerto>`), open `index.html` in the browser tool.
2. Run this in the page via `javascript_exec` (loads the two-note fixture — note 0 spans 0–0.5s, note 1 spans 0.5–1.0s — sets a large 0.5s latency offset to make the effect obvious, fakes a `Voz` whose pitch is controlled by a local variable, waits until real playback time is ~0.9s — which without correction would fall inside note 1's window — then sends a signal and confirms it gets credited to note 0 instead, because `judgmentTime ≈ 0.9 - 0.5 = 0.4` correctly falls inside note 0's window):

```js
const midiBuf = await fetch('./tests/fixtures/sample.mid').then(r => r.arrayBuffer());
const wavBuf = await fetch('./tests/fixtures/sample.wav').then(r => r.arrayBuffer());
const { notes, durationSec, beats } = parseMidi(midiBuf);
state.notes = notes;
state.durationSec = durationSec;
state.beats = beats;
resetNoteProgress();
state.audioBuffer = await state.audioContext.decodeAudioData(wavBuf);
state.latencyOffsetSec = 0.5;

let simulatedFrequency = null;
state.voces.push({
  getLevel: () => ({ rms: 0, peak: simulatedFrequency !== null ? 0.5 : 0 }),
  getPitch: () => simulatedFrequency
});

await play();
await new Promise(r => setTimeout(r, 900));
simulatedFrequency = 300;
mainLoop();

JSON.stringify({
  hadSignal: state.noteProgress.map(p => p.hadSignal),
  pitchHistoryLen: state.pitchHistory.length,
  lastPointTime: state.pitchHistory[state.pitchHistory.length - 1].time
});
```

3. Confirm `hadSignal` is `[true, false]` — note 0 gets credited despite the real signal arriving at ~0.9s, because the corrected `judgmentTime` (~0.4s) falls inside note 0's window. Without this task's change, this would have been `[false, ...]` (or note 1 wrongly credited).
4. Confirm `pitchHistoryLen` is `1` and `lastPointTime` is close to `0.4` (± ~0.05 for the real elapsed-time variance in the test itself).
5. Confirm no console errors throughout. Stop the server and close any tabs you opened.

- [ ] **Step 6: Commit**

```bash
git add "App voz/index.html"
git commit -m "feat(app-voz): apply the calibrated latency offset to note/beat judgment and record pitch history"
```

---

### Task 4: Render the pitch line (`index.html`)

**Files:**
- Modify: `App voz/index.html`

**Interfaces:**
- Consumes: `pitchPointX`, `shouldBreakLine` (Task 2), `state.pitchHistory` (Task 3).
- Produces: a new `COLOR_PITCH_LINE` constant and a new drawing block at the end of `renderPianoRoll`.

- [ ] **Step 1: Add the pitch-line color constant**

Change:

```js
    const SCROLL_OUT_DURATION_SEC = PLAYHEAD_X / PIXELS_PER_SECOND;
    const DESINTEGRATION_MIN_OPACITY = 0.15;
    const DESINTEGRATION_MIN_SCALE = 0.6;
    const SILENCE_STOP_BEATS = 8;
    const CANVAS_WIDTH = document.getElementById('pianoRoll').width;
    const MAX_PITCH_HISTORY_SEC = (PLAYHEAD_X + CANVAS_WIDTH) / PIXELS_PER_SECOND;
    const PITCH_LINE_GAP_SEC = 0.15;
```

to:

```js
    const SCROLL_OUT_DURATION_SEC = PLAYHEAD_X / PIXELS_PER_SECOND;
    const DESINTEGRATION_MIN_OPACITY = 0.15;
    const DESINTEGRATION_MIN_SCALE = 0.6;
    const SILENCE_STOP_BEATS = 8;
    const CANVAS_WIDTH = document.getElementById('pianoRoll').width;
    const MAX_PITCH_HISTORY_SEC = (PLAYHEAD_X + CANVAS_WIDTH) / PIXELS_PER_SECOND;
    const PITCH_LINE_GAP_SEC = 0.15;
    const COLOR_PITCH_LINE = '#f5d90a';
```

- [ ] **Step 2: Draw the pitch line on top of everything else in `renderPianoRoll`**

Change:

```js
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(PLAYHEAD_X, 0);
      ctx.lineTo(PLAYHEAD_X, canvas.height);
      ctx.stroke();
    }
```

to:

```js
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

(This is unconditional on `hasMic()`/`isLive` — `state.pitchHistory` is only ever populated under those conditions per Task 3, so it naturally stays empty and draws nothing otherwise. `ctx.lineWidth` is reset to `1` afterward so it doesn't leak into the next frame's other strokes, which all rely on the canvas default.)

- [ ] **Step 3: Manual verification**

No automated test — Canvas rendering, verified in a real browser. Same harness note as Task 3 applies if your script drives `mainLoop()` manually across a wait.

1. Start a local static server in `App voz/`, open `index.html`.
2. Run this in the page via `javascript_exec` (loads the fixture, plays it, fakes a `Voz` singing note 0's pitch, and samples the canvas pixel at the newest pitch-history point's computed position):

```js
const midiBuf = await fetch('./tests/fixtures/sample.mid').then(r => r.arrayBuffer());
const wavBuf = await fetch('./tests/fixtures/sample.wav').then(r => r.arrayBuffer());
const { notes, durationSec, beats } = parseMidi(midiBuf);
state.notes = notes;
state.durationSec = durationSec;
state.beats = beats;
resetNoteProgress();
state.audioBuffer = await state.audioContext.decodeAudioData(wavBuf);

let simulatedFrequency = null;
state.voces.push({
  getLevel: () => ({ rms: 0, peak: simulatedFrequency !== null ? 0.5 : 0 }),
  getPitch: () => simulatedFrequency
});

await play();
simulatedFrequency = 261.63;
mainLoop();

const canvas = document.getElementById('pianoRoll');
const ctx = canvas.getContext('2d');
const { minPitch, maxPitch } = pitchRange(state.notes);
const point = state.pitchHistory[state.pitchHistory.length - 1];
const x = Math.round(pitchPointX(point.time, currentPlaybackTime(), PIXELS_PER_SECOND, PLAYHEAD_X));
const y = Math.round(pitchToY(point.pitch, minPitch, maxPitch, canvas.height));
const px = ctx.getImageData(x, y, 1, 1).data;

JSON.stringify({ pitchHistoryLen: state.pitchHistory.length, pixel: [px[0], px[1], px[2]] });
```

3. Confirm `pitchHistoryLen` is at least `1`, and `pixel` is close to `COLOR_PITCH_LINE` (`#f5d90a` → roughly `[245, 217, 10]`) — clearly yellow, not the background or any note-rectangle color.
4. Confirm no console errors throughout. Stop the server and close any tabs you opened.

- [ ] **Step 4: Commit**

```bash
git add "App voz/index.html"
git commit -m "feat(app-voz): draw a real-time pitch line over the piano roll"
```

---

### Task 5: Interactive latency calibration (`index.html`)

**Files:**
- Modify: `App voz/index.html`

**Interfaces:**
- Consumes: `computeCalibrationOffset` (Task 1), `playMetronomeClick` (already existing).
- Produces: `state.calibration` (`null` when idle, or `{clickTimes, deltas, endTime}` while a calibration run is in progress), `finishCalibration()`, `updateLatencyStatusDisplay()`, a `#calibrateBtn` button and `#latencyStatus` status line in the HTML.

- [ ] **Step 1: Add the calibration constants and `calibration` state field**

Change:

```js
      lastSignalTime: 0,
      pitchHistory: [],
      latencyOffsetSec: 0
    };
```

to:

```js
      lastSignalTime: 0,
      pitchHistory: [],
      latencyOffsetSec: 0,
      calibration: null
    };
```

Then change:

```js
    const PITCH_LINE_GAP_SEC = 0.15;
    const COLOR_PITCH_LINE = '#f5d90a';
```

to:

```js
    const PITCH_LINE_GAP_SEC = 0.15;
    const COLOR_PITCH_LINE = '#f5d90a';
    const CALIBRATION_TRIALS = 4;
    const CALIBRATION_INTERVAL_SEC = 1.0;
    const CALIBRATION_WINDOW_SEC = 0.9;
```

- [ ] **Step 2: Add the calibration UI**

In the HTML, change:

```html
  <div class="mic-controls">
    <button id="micBtn">Activar micrófono</button>
    <label>Ganancia: <input type="range" id="micGain" min="0" max="2" step="0.01" value="1" disabled></label>
    <div id="levelMeterTrack"><div id="levelMeterBar"></div></div>
  </div>
  <div id="micStatus">Micrófono no activado.</div>
  <div id="pitchDisplay">Nota detectada: —</div>
```

to:

```html
  <div class="mic-controls">
    <button id="micBtn">Activar micrófono</button>
    <label>Ganancia: <input type="range" id="micGain" min="0" max="2" step="0.01" value="1" disabled></label>
    <div id="levelMeterTrack"><div id="levelMeterBar"></div></div>
    <button id="calibrateBtn" disabled>Calibrar latencia</button>
  </div>
  <div id="micStatus">Micrófono no activado.</div>
  <div id="pitchDisplay">Nota detectada: —</div>
  <div id="latencyStatus">Latencia: sin calibrar.</div>
```

- [ ] **Step 3: Enable the button once the mic is active, and show the loaded offset at startup**

Change:

```js
        const voz = createVoz(stream, state.audioContext);
        state.voces.push(voz);
        micStatus.textContent = 'Micrófono activado.';
        document.getElementById('micGain').disabled = false;
```

to:

```js
        const voz = createVoz(stream, state.audioContext);
        state.voces.push(voz);
        micStatus.textContent = 'Micrófono activado.';
        document.getElementById('micGain').disabled = false;
        document.getElementById('calibrateBtn').disabled = false;
```

Then change:

```js
    const storedLatencyOffset = parseFloat(localStorage.getItem('appVozLatencyOffsetSec'));
    if (Number.isFinite(storedLatencyOffset)) {
      state.latencyOffsetSec = storedLatencyOffset;
    }
```

to:

```js
    const storedLatencyOffset = parseFloat(localStorage.getItem('appVozLatencyOffsetSec'));
    if (Number.isFinite(storedLatencyOffset)) {
      state.latencyOffsetSec = storedLatencyOffset;
      updateLatencyStatusDisplay();
    }
```

(`updateLatencyStatusDisplay` is defined in Step 4 below — this call is safe because `function` declarations are hoisted to the top of the script, so the order they appear in the file doesn't matter for calling them.)

- [ ] **Step 4: Add `updateLatencyStatusDisplay` and `finishCalibration`**

Change:

```js
    function updatePitchDisplay(frequency) {
      const el = document.getElementById('pitchDisplay');
      if (frequency === null) {
        el.textContent = 'Nota detectada: —';
        return;
      }
      const { noteName, cents } = describePitch(frequency);
      const sign = cents >= 0 ? '+' : '';
      el.textContent = `Nota detectada: ${noteName} (${frequency.toFixed(1)} Hz, ${sign}${cents.toFixed(0)} cents)`;
    }

    function updateNoteProgress(currentTime, detectedFrequency, deltaSeconds) {
```

to:

```js
    function updatePitchDisplay(frequency) {
      const el = document.getElementById('pitchDisplay');
      if (frequency === null) {
        el.textContent = 'Nota detectada: —';
        return;
      }
      const { noteName, cents } = describePitch(frequency);
      const sign = cents >= 0 ? '+' : '';
      el.textContent = `Nota detectada: ${noteName} (${frequency.toFixed(1)} Hz, ${sign}${cents.toFixed(0)} cents)`;
    }

    function updateLatencyStatusDisplay() {
      const ms = Math.round(state.latencyOffsetSec * 1000);
      document.getElementById('latencyStatus').textContent = `Latencia calibrada: ${ms}ms`;
    }

    function finishCalibration() {
      const offset = computeCalibrationOffset(state.calibration.deltas);
      state.calibration = null;
      document.getElementById('calibrateBtn').disabled = false;
      if (offset === null) {
        document.getElementById('latencyStatus').textContent =
          'Calibración fallida: no se detectaron suficientes "Ta". Intentá de nuevo.';
        return;
      }
      state.latencyOffsetSec = offset;
      localStorage.setItem('appVozLatencyOffsetSec', String(offset));
      updateLatencyStatusDisplay();
    }

    function updateNoteProgress(currentTime, detectedFrequency, deltaSeconds) {
```

- [ ] **Step 5: Feed calibration trials from `mainLoop`**

Change:

```js
      if (state.voces[0]) {
        const { peak } = state.voces[0].getLevel();
        updateLevelMeter(peak);
        detectedFrequency = peak > 0.02 ? state.voces[0].getPitch() : null;
        updatePitchDisplay(detectedFrequency);
      }

      if (detectedFrequency !== null) {
        state.lastSignalTime = judgmentTime;
      }
```

to:

```js
      if (state.voces[0]) {
        const { peak } = state.voces[0].getLevel();
        updateLevelMeter(peak);
        detectedFrequency = peak > 0.02 ? state.voces[0].getPitch() : null;
        updatePitchDisplay(detectedFrequency);
      }

      if (state.calibration) {
        const nowAudio = state.audioContext.currentTime;
        state.calibration.clickTimes.forEach((clickTime, i) => {
          if (state.calibration.deltas[i] !== null) return;
          if (nowAudio < clickTime || nowAudio > clickTime + CALIBRATION_WINDOW_SEC) return;
          if (detectedFrequency !== null) {
            state.calibration.deltas[i] = nowAudio - clickTime;
          }
        });
        if (nowAudio >= state.calibration.endTime) {
          finishCalibration();
        }
      }

      if (detectedFrequency !== null) {
        state.lastSignalTime = judgmentTime;
      }
```

- [ ] **Step 6: Start a calibration run from the button**

Change:

```js
    document.getElementById('micGain').addEventListener('input', (e) => {
      if (state.voces[0]) {
        state.voces[0].setGain(parseFloat(e.target.value));
      }
    });
  </script>
```

to:

```js
    document.getElementById('micGain').addEventListener('input', (e) => {
      if (state.voces[0]) {
        state.voces[0].setGain(parseFloat(e.target.value));
      }
    });

    document.getElementById('calibrateBtn').addEventListener('click', () => {
      document.getElementById('calibrateBtn').disabled = true;
      document.getElementById('latencyStatus').textContent = 'Calibrando... decí "Ta" en cada click.';
      const startTime = state.audioContext.currentTime + 0.1;
      const clickTimes = [];
      for (let i = 0; i < CALIBRATION_TRIALS; i++) {
        const when = startTime + i * CALIBRATION_INTERVAL_SEC;
        clickTimes.push(when);
        playMetronomeClick(state.audioContext, when);
      }
      state.calibration = {
        clickTimes,
        deltas: clickTimes.map(() => null),
        endTime: clickTimes[clickTimes.length - 1] + CALIBRATION_WINDOW_SEC
      };
    });
  </script>
```

- [ ] **Step 7: Manual verification**

No automated test — Web Audio scheduling and real elapsed time, verified in a real browser. Same harness note as Tasks 3-4 applies.

1. Start a local static server in `App voz/`, open `index.html`.
2. Run this in the page via `javascript_exec` (fakes a `Voz` and simulates the mic activation's effect on the UI directly — no real `getUserMedia` needed — then clicks "Calibrar latencia" and, for about 5 real seconds, drives `mainLoop()` every 50ms, simulating a "Ta" in the 50-300ms window after each scheduled click):

```js
state.voces.push({ getLevel: () => ({ rms: 0, peak: 0 }), getPitch: () => null });
document.getElementById('calibrateBtn').disabled = false;

document.getElementById('calibrateBtn').click();
const clickTimes = state.calibration.clickTimes.slice();

for (let t = 0; t < 5000; t += 50) {
  await new Promise(r => setTimeout(r, 50));
  const nowAudio = state.audioContext.currentTime;
  const justAfterAClick = clickTimes.some(c => nowAudio >= c + 0.05 && nowAudio <= c + 0.3);
  state.voces[0].getPitch = () => (justAfterAClick ? 300 : null);
  state.voces[0].getLevel = () => ({ rms: 0, peak: justAfterAClick ? 0.5 : 0 });
  mainLoop();
  if (!state.calibration) break;
}

JSON.stringify({
  latencyOffsetSec: state.latencyOffsetSec,
  storedInLocalStorage: localStorage.getItem('appVozLatencyOffsetSec'),
  statusText: document.getElementById('latencyStatus').textContent,
  calibrateBtnDisabled: document.getElementById('calibrateBtn').disabled
});
```

3. Confirm `latencyOffsetSec` is a small positive number (roughly between `0.05` and `0.3`, matching the simulated "Ta" window), `storedInLocalStorage` matches it, `statusText` reads `"Latencia calibrada: <N>ms"`, and `calibrateBtnDisabled` is `false` (re-enabled after finishing).
4. Now verify the failure path — reload the page, repeat steps but never simulate a "Ta" (skip setting `getPitch`/`getLevel` inside the loop, leaving them always returning no signal), and confirm after ~5s that `document.getElementById('latencyStatus').textContent` reads the `"Calibración fallida..."` message, `localStorage.getItem('appVozLatencyOffsetSec')` is unchanged from before this run, and `state.latencyOffsetSec` is unchanged.
5. Confirm no console errors throughout either run. Stop the server and close any tabs you opened.

- [ ] **Step 8: Commit**

```bash
git add "App voz/index.html"
git commit -m "feat(app-voz): add interactive latency calibration (say \"Ta\" on 4 clicks)"
```
