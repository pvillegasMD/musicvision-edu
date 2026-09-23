# Herramienta de evaluación en clase — App voz Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new, standalone HTML tool (`App voz/evaluacion.html`) that lets a teacher record a live, unaccompanied performance, automatically align the recording against a reference MIDI (whose tempo doesn't match the live human tempo), and produce a static SVG tuning report — with support for external audio interfaces (built-in mic or up to 2 channels of an external device).

**Architecture:** Two new pure-function files (`evaluacion-alignment-utils.js` for silence-based start/end detection + global tempo stretching + per-note judgment; `evaluacion-report-svg.js` for the single-color-per-note SVG report, reusing the shared piano-roll geometry) wired together by a new self-contained HTML page that reuses the practice app's existing MIDI parser, pitch detector, level meter, and note-tuning primitives via `<script src>`, without touching any file the practice app depends on.

**Tech Stack:** Vanilla HTML/CSS/JS, Web Audio API (`AnalyserNode`, `ChannelSplitterNode`, `ChannelMergerNode`), `navigator.mediaDevices` (`enumerateDevices`, `getUserMedia`), File System Access API (`showSaveFilePicker`, Chrome/Edge/Brave only), Node's built-in `node:test` runner — no build step, no npm, no external libraries.

**Spec:** `docs/superpowers/specs/2026-09-23-app-voz-herramienta-evaluacion-design.md`

## Global Constraints

- This entire plan is implemented on a new git branch `local/evaluacion`, created from the current tip of `fix/filenames-in-context-docs` — it is **never merged back and never pushed to GitHub**. It is a personal tool for the teacher's own computer only.
- No WAV playback, no song catalog, no live piano roll, no loop, no completion banner, no text (.txt) report — none of that applies to this tool. The only output is a static SVG.
- Each note in the report gets exactly **one** solid color: green if ≥50% of the captured samples in that note's (tempo-adjusted) time window were in tune, red otherwise (including notes with zero samples) — reuse the existing 50% threshold convention from `report-utils.js`'s `isNoteInTune`, but compute it inline (do not add a dependency on `report-utils.js`).
- The report SVG includes the same semitone/beat grid + per-note border treatment already built for the practice app's visual redesign (`computeSemitoneGridLines` from `piano-roll-geometry.js`, `rgba(0,0,0,0.28)` 1.5px note borders).
- Tempo alignment uses a **single global stretch factor** (sung duration ÷ MIDI duration) applied uniformly to every note's start/duration — no per-note onset detection, no tempo correction mid-performance.
- Device selection offers "Micrófono integrado" plus, for every other detected `audioinput` device, three virtual options — Canal 1 (L), Canal 2 (R), L+R (mezclado) — without probing whether the device is actually stereo.
- "Grabar" is disabled unless: the student-name field is non-empty, a MIDI is loaded, and there is no undownloaded report currently on screen. After a successful download, the name field and the on-screen report are cleared and "Grabar" is disabled again until a new name is typed.
- Downloading the report must use `window.showSaveFilePicker()` (Chrome/Edge/Brave) so the destination folder is chosen every time — never a silent save to the Downloads folder.
- Run `node --test` from `App voz/` after every task; all pre-existing tests plus this plan's new tests must pass.

---

### Task 1: `evaluacion-alignment-utils.js` — silence detection, tempo stretch, note warping, offline judgment

**Files:**
- Create: `App voz/evaluacion-alignment-utils.js`
- Test: `App voz/tests/evaluacion-alignment-utils.test.js`

**Interfaces:**
- Consumes: nothing from other tasks (pure functions only).
- Produces (consumed by Task 3):
  - `findSingingBounds(pitchHistory, options = {}) -> {startTime: number, endTime: number} | null` — `pitchHistory` is `[{time: number, pitch: number}]`; `options.minRunSamples` (default 5), `options.maxGapSec` (default 0.3).
  - `computeStretchFactor(singingDurationSec: number, midiDurationSec: number) -> number`
  - `warpNotes(notes: [{pitch, start, duration}], startTime: number, stretchFactor: number) -> [{pitch, start, duration}]` (new array, does not mutate input)
  - `warpBeats(beats: number[], startTime: number, stretchFactor: number) -> number[]`
  - `judgeNotes(warpedNotes, samples: [{time: number, frequency: number}], tuningToleranceCents: number, tuningFns: {centsOffTarget, isInTune}) -> [{timeInTune: number, timeTotal: number, hadSignal: boolean}]` — one entry per note, in the same order as `warpedNotes`. `timeInTune`/`timeTotal` are **sample counts**, not seconds (kept under these names so the shape matches what `isNoteInTune`-style ratio logic expects).

- [ ] **Step 1: Write the failing tests**

Create `App voz/tests/evaluacion-alignment-utils.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { findSingingBounds, computeStretchFactor, warpNotes, warpBeats, judgeNotes } = require('../evaluacion-alignment-utils.js');

test('findSingingBounds returns null for an empty pitch history', () => {
  assert.equal(findSingingBounds([], {}), null);
});

test('findSingingBounds ignores an isolated blip shorter than minRunSamples', () => {
  const history = [{ time: 0.5, pitch: 60 }];
  assert.equal(findSingingBounds(history, { minRunSamples: 5, maxGapSec: 0.3 }), null);
});

test('findSingingBounds finds the first and last sample of the longest stable run, trimming leading/trailing gaps', () => {
  const history = [
    { time: 0.1, pitch: 60 },
    { time: 2.0, pitch: 62 },
    { time: 2.05, pitch: 62 },
    { time: 2.10, pitch: 64 },
    { time: 2.15, pitch: 64 },
    { time: 2.20, pitch: 65 },
    { time: 5.0, pitch: 60 }
  ];
  const bounds = findSingingBounds(history, { minRunSamples: 5, maxGapSec: 0.3 });
  assert.deepEqual(bounds, { startTime: 2.0, endTime: 2.20 });
});

test('findSingingBounds uses default parameters when none are given', () => {
  const history = [
    { time: 0, pitch: 60 },
    { time: 0.05, pitch: 60 },
    { time: 0.10, pitch: 60 },
    { time: 0.15, pitch: 60 },
    { time: 0.20, pitch: 60 }
  ];
  assert.deepEqual(findSingingBounds(history), { startTime: 0, endTime: 0.20 });
});

test('computeStretchFactor divides sung duration by MIDI duration', () => {
  assert.equal(computeStretchFactor(23, 20), 1.15);
});

test('computeStretchFactor returns 1 when MIDI duration is zero or negative', () => {
  assert.equal(computeStretchFactor(10, 0), 1);
  assert.equal(computeStretchFactor(10, -5), 1);
});

test('warpNotes repositions each note using the start time and stretch factor, preserving pitch', () => {
  const notes = [
    { pitch: 60, start: 0, duration: 1 },
    { pitch: 64, start: 1, duration: 0.5 }
  ];
  const warped = warpNotes(notes, 10, 2);
  assert.deepEqual(warped, [
    { pitch: 60, start: 10, duration: 2 },
    { pitch: 64, start: 12, duration: 1 }
  ]);
});

test('warpNotes does not mutate the original notes array', () => {
  const notes = [{ pitch: 60, start: 0, duration: 1 }];
  warpNotes(notes, 5, 1);
  assert.equal(notes[0].start, 0);
});

test('warpBeats repositions each beat time using the start time and stretch factor', () => {
  const beats = [0, 0.5, 1];
  assert.deepEqual(warpBeats(beats, 10, 2), [10, 11, 12]);
});

const tuningFns = {
  centsOffTarget: (frequency, targetMidi) => {
    const exactMidi = 69 + 12 * Math.log2(frequency / 440);
    return (exactMidi - targetMidi) * 100;
  },
  isInTune: (cents, tolerance = 50) => Math.abs(cents) <= tolerance
};

test('judgeNotes counts in-tune and total samples within each note window', () => {
  const notes = [{ pitch: 69, start: 0, duration: 1 }];
  const samples = [
    { time: 0.1, frequency: 440 },
    { time: 0.2, frequency: 440 },
    { time: 0.3, frequency: 466.16 }
  ];
  const progress = judgeNotes(notes, samples, 50, tuningFns);
  assert.equal(progress.length, 1);
  assert.equal(progress[0].hadSignal, true);
  assert.equal(progress[0].timeTotal, 3);
  assert.equal(progress[0].timeInTune, 2);
});

test('judgeNotes ignores samples outside the note\'s time window', () => {
  const notes = [{ pitch: 69, start: 0, duration: 1 }];
  const samples = [{ time: 5, frequency: 440 }];
  const progress = judgeNotes(notes, samples, 50, tuningFns);
  assert.equal(progress[0].hadSignal, false);
  assert.equal(progress[0].timeTotal, 0);
});

test('judgeNotes handles multiple notes independently', () => {
  const notes = [
    { pitch: 69, start: 0, duration: 1 },
    { pitch: 72, start: 1, duration: 1 }
  ];
  const samples = [
    { time: 0.5, frequency: 440 },
    { time: 1.5, frequency: 523.25 }
  ];
  const progress = judgeNotes(notes, samples, 50, tuningFns);
  assert.equal(progress[0].hadSignal, true);
  assert.equal(progress[1].hadSignal, true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `App voz/`): `node --test`
Expected: failures for all the new tests above with "Cannot find module '../evaluacion-alignment-utils.js'" (or similar), 105 pre-existing tests still passing.

- [ ] **Step 3: Implement `evaluacion-alignment-utils.js`**

Create `App voz/evaluacion-alignment-utils.js`:

```js
function findSingingBounds(pitchHistory, options = {}) {
  const minRunSamples = options.minRunSamples || 5;
  const maxGapSec = options.maxGapSec || 0.3;

  if (pitchHistory.length === 0) return null;

  const runs = [];
  let runStart = 0;
  for (let i = 1; i <= pitchHistory.length; i++) {
    const brokeRun = i === pitchHistory.length || (pitchHistory[i].time - pitchHistory[i - 1].time) > maxGapSec;
    if (brokeRun) {
      const runLength = i - runStart;
      if (runLength >= minRunSamples) {
        runs.push({ startIndex: runStart, endIndex: i - 1 });
      }
      runStart = i;
    }
  }

  if (runs.length === 0) return null;

  const firstRun = runs[0];
  const lastRun = runs[runs.length - 1];
  return {
    startTime: pitchHistory[firstRun.startIndex].time,
    endTime: pitchHistory[lastRun.endIndex].time
  };
}

function computeStretchFactor(singingDurationSec, midiDurationSec) {
  if (midiDurationSec <= 0) return 1;
  return singingDurationSec / midiDurationSec;
}

function warpNotes(notes, startTime, stretchFactor) {
  return notes.map((note) => ({
    ...note,
    start: startTime + note.start * stretchFactor,
    duration: note.duration * stretchFactor
  }));
}

function warpBeats(beats, startTime, stretchFactor) {
  return beats.map((t) => startTime + t * stretchFactor);
}

function judgeNotes(warpedNotes, samples, tuningToleranceCents, tuningFns) {
  const { centsOffTarget, isInTune } = tuningFns;
  return warpedNotes.map((note) => {
    let timeInTune = 0;
    let timeTotal = 0;
    let hadSignal = false;
    samples.forEach((sample) => {
      if (sample.time < note.start || sample.time >= note.start + note.duration) return;
      hadSignal = true;
      timeTotal += 1;
      const cents = centsOffTarget(sample.frequency, note.pitch);
      if (isInTune(cents, tuningToleranceCents)) {
        timeInTune += 1;
      }
    });
    return { timeInTune, timeTotal, hadSignal };
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { findSingingBounds, computeStretchFactor, warpNotes, warpBeats, judgeNotes };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test`
Expected: 118 tests (105 baseline + 13 new), all passing.

- [ ] **Step 5: Commit**

```bash
git add "App voz/evaluacion-alignment-utils.js" "App voz/tests/evaluacion-alignment-utils.test.js"
git commit -m "feat(evaluacion): add silence-detection, tempo-stretch, and note-judgment utils

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `evaluacion-report-svg.js` — single-color-per-note SVG report builder

**Files:**
- Create: `App voz/evaluacion-report-svg.js`
- Test: `App voz/tests/evaluacion-report-svg.test.js`

**Interfaces:**
- Consumes: `computeSemitoneGridLines`, `pitchRange`, `computeNoteRect`, `pitchToY`, `pitchPointX`, `shouldBreakLine` from `App voz/piano-roll-geometry.js` (already exist, unchanged) — injected via a `geometryFns` parameter, same dependency-injection pattern already used by `report-svg.js`.
- Produces (consumed by Task 3): `buildEvaluationReportSvg(notes, noteProgress, pitchHistory, beats, options, geometryFns) -> string` (an SVG document as a string). `notes` are already tempo-warped `[{pitch, start, duration}]`. `noteProgress` is the array Task 1's `judgeNotes` produces, `[{timeInTune, timeTotal, hadSignal}]`, same order as `notes`. `pitchHistory` is `[{time, pitch}]` (MIDI-space, already converted from Hz by the caller). `beats` is an already-warped `number[]`. `options` is `{pixelsPerSecond, rowHeight, height, gapThresholdSec, colors: {inTune, outOfTune, gridRow, gridBeat, noteBorder, pitchLine}}`.

- [ ] **Step 1: Write the failing tests**

Create `App voz/tests/evaluacion-report-svg.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildEvaluationReportSvg } = require('../evaluacion-report-svg.js');
const { pitchRange, computeNoteRect, pitchToY, pitchPointX, shouldBreakLine, computeSemitoneGridLines } = require('../piano-roll-geometry.js');

const geometryFns = { pitchRange, computeNoteRect, pitchToY, pitchPointX, shouldBreakLine, computeSemitoneGridLines };
const colors = {
  inTune: '#3ecf6e',
  outOfTune: '#e05a4e',
  gridRow: 'rgba(255,255,255,0.04)',
  gridBeat: 'rgba(255,255,255,0.05)',
  noteBorder: 'rgba(0,0,0,0.28)',
  pitchLine: '#f5d90a'
};
const options = { pixelsPerSecond: 100, rowHeight: 20, height: 200, gapThresholdSec: 0.15, colors };

test('buildEvaluationReportSvg draws a note in a single solid color when ratio >= 0.5', () => {
  const notes = [{ pitch: 60, start: 0, duration: 1 }];
  const noteProgress = [{ timeInTune: 3, timeTotal: 4, hadSignal: true }];
  const svg = buildEvaluationReportSvg(notes, noteProgress, [], [], options, geometryFns);
  assert.ok(svg.includes(`fill="${colors.inTune}"`));
  assert.ok(!svg.includes(`fill="${colors.outOfTune}"`));
});

test('buildEvaluationReportSvg draws a note out of tune when the ratio is below 0.5', () => {
  const notes = [{ pitch: 60, start: 0, duration: 1 }];
  const noteProgress = [{ timeInTune: 1, timeTotal: 4, hadSignal: true }];
  const svg = buildEvaluationReportSvg(notes, noteProgress, [], [], options, geometryFns);
  assert.ok(svg.includes(`fill="${colors.outOfTune}"`));
});

test('buildEvaluationReportSvg treats an unsung note (timeTotal 0) as out of tune', () => {
  const notes = [{ pitch: 60, start: 0, duration: 1 }];
  const noteProgress = [{ timeInTune: 0, timeTotal: 0, hadSignal: false }];
  const svg = buildEvaluationReportSvg(notes, noteProgress, [], [], options, geometryFns);
  assert.ok(svg.includes(`fill="${colors.outOfTune}"`));
});

test('buildEvaluationReportSvg gives every note rect the border stroke', () => {
  const notes = [{ pitch: 60, start: 0, duration: 1 }];
  const noteProgress = [{ timeInTune: 4, timeTotal: 4, hadSignal: true }];
  const svg = buildEvaluationReportSvg(notes, noteProgress, [], [], options, geometryFns);
  assert.ok(svg.includes(`stroke="${colors.noteBorder}"`));
});

test('buildEvaluationReportSvg draws one horizontal grid line per semitone in the note range', () => {
  const notes = [{ pitch: 60, start: 0, duration: 1 }];
  const noteProgress = [{ timeInTune: 4, timeTotal: 4, hadSignal: true }];
  const svg = buildEvaluationReportSvg(notes, noteProgress, [], [], options, geometryFns);
  const { minPitch, maxPitch } = pitchRange(notes);
  const expectedLines = computeSemitoneGridLines(minPitch, maxPitch, options.height).length;
  const actualLines = (svg.match(/<line x1="0"/g) || []).length;
  assert.equal(actualLines, expectedLines);
});

test('buildEvaluationReportSvg draws one vertical grid line per beat', () => {
  const notes = [{ pitch: 60, start: 0, duration: 1 }];
  const noteProgress = [{ timeInTune: 4, timeTotal: 4, hadSignal: true }];
  const beats = [0, 0.5, 1];
  const svg = buildEvaluationReportSvg(notes, noteProgress, [], beats, options, geometryFns);
  const actualLines = (svg.match(/y1="0" x2="[\d.]+" y2="200"/g) || []).length;
  assert.equal(actualLines, 3);
});

test('buildEvaluationReportSvg draws the pitch line when pitch history is present', () => {
  const notes = [{ pitch: 60, start: 0, duration: 1 }];
  const noteProgress = [{ timeInTune: 4, timeTotal: 4, hadSignal: true }];
  const pitchHistory = [{ time: 0.1, pitch: 60 }, { time: 0.2, pitch: 61 }];
  const svg = buildEvaluationReportSvg(notes, noteProgress, pitchHistory, [], options, geometryFns);
  assert.ok(svg.includes(`stroke="${colors.pitchLine}"`));
});

test('buildEvaluationReportSvg omits the pitch path when there is no pitch history', () => {
  const notes = [{ pitch: 60, start: 0, duration: 1 }];
  const noteProgress = [{ timeInTune: 4, timeTotal: 4, hadSignal: true }];
  const svg = buildEvaluationReportSvg(notes, noteProgress, [], [], options, geometryFns);
  assert.ok(!svg.includes('<path'));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test`
Expected: failures for all 8 new tests ("Cannot find module '../evaluacion-report-svg.js'"), 118 prior tests still passing.

- [ ] **Step 3: Implement `evaluacion-report-svg.js`**

Create `App voz/evaluacion-report-svg.js`:

```js
function round2(value) {
  return Math.round(value * 100) / 100;
}

function buildEvaluationReportSvg(notes, noteProgress, pitchHistory, beats, options, geometryFns) {
  const { pitchRange, computeNoteRect, pitchToY, pitchPointX, shouldBreakLine, computeSemitoneGridLines } = geometryFns;
  const { pixelsPerSecond, rowHeight, height, gapThresholdSec, colors } = options;
  const { minPitch, maxPitch } = pitchRange(notes);
  const notesEnd = notes.reduce((max, n) => Math.max(max, n.start + n.duration), 0);
  const lastPitchTime = pitchHistory.length > 0 ? pitchHistory[pitchHistory.length - 1].time : 0;
  const durationSec = Math.max(notesEnd, lastPitchTime);
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

  const gridRowLines = computeSemitoneGridLines(minPitch, maxPitch, height)
    .map((y) => `<line x1="0" y1="${round2(y)}" x2="${width}" y2="${round2(y)}" stroke="${colors.gridRow}" />`)
    .join('\n');

  const gridBeatLines = beats
    .map((beatTime) => {
      const x = round2(pitchPointX(beatTime, 0, pixelsPerSecond, 0));
      return `<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="${colors.gridBeat}" />`;
    })
    .join('\n');

  const noteRects = notes.map((note, i) => {
    const rect = computeNoteRect(note, view);
    const progress = noteProgress[i];
    const ratio = progress.timeTotal > 0 ? progress.timeInTune / progress.timeTotal : 0;
    const fill = ratio >= 0.5 ? colors.inTune : colors.outOfTune;
    return `<rect x="${round2(rect.x)}" y="${round2(rect.y)}" width="${round2(rect.width)}" height="${round2(rect.height)}" fill="${fill}" stroke="${colors.noteBorder}" stroke-width="1.5" />`;
  }).join('\n');

  let pathData = '';
  pitchHistory.forEach((point, i) => {
    const x = round2(pitchPointX(point.time, 0, pixelsPerSecond, 0));
    const y = round2(pitchToY(point.pitch, minPitch, maxPitch, height));
    if (i === 0 || shouldBreakLine(pitchHistory[i - 1].time, point.time, gapThresholdSec)) {
      pathData += `M ${x} ${y} `;
    } else {
      pathData += `L ${x} ${y} `;
    }
  });
  const pitchPath = pitchHistory.length > 0
    ? `<path d="${pathData.trim()}" fill="none" stroke="${colors.pitchLine}" stroke-width="2" />`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n${gridRowLines}\n${gridBeatLines}\n${noteRects}\n${pitchPath}\n</svg>`;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { buildEvaluationReportSvg, round2 };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test`
Expected: 126 tests (118 + 8 new), all passing.

- [ ] **Step 5: Commit**

```bash
git add "App voz/evaluacion-report-svg.js" "App voz/tests/evaluacion-report-svg.test.js"
git commit -m "feat(evaluacion): add single-color-per-note SVG report builder

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `evaluacion.html` — the full tool (device selection, recording, processing, download)

**Files:**
- Create: `App voz/evaluacion.html`

**Interfaces:**
- Consumes: `parseMidi` (`midi-parser.js`), `pitchRange`/`computeNoteRect`/`pitchToY`/`pitchPointX`/`shouldBreakLine`/`computeSemitoneGridLines` (`piano-roll-geometry.js`), `computeLevel` (`audio-level.js`), `detectPitch` (`pitch-detection.js`), `frequencyToMidi` (`note-utils.js`), `centsOffTarget`/`isInTune` (`note-tuning.js`), `findSingingBounds`/`computeStretchFactor`/`warpNotes`/`warpBeats`/`judgeNotes` (Task 1's `evaluacion-alignment-utils.js`), `buildEvaluationReportSvg` (Task 2's `evaluacion-report-svg.js`) — all loaded as globals via `<script src>`, same convention as `index.html`.
- Produces: nothing consumed by later tasks (Task 4 is documentation only).

This task has no automated tests — it is UI/glue code verified by manual browser testing (Step 6). No `.js` module file changes, so the test count from Task 2 (122) is unaffected.

- [ ] **Step 1: Write the HTML skeleton, CSS, and script includes**

Create `App voz/evaluacion.html`:

```html
<!doctype html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>App voz — Evaluación</title>
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
  button { background:#fff; color:var(--color-secondary-text); border:none; padding:9px 16px; border-radius:8px; cursor:pointer; font-size:14px; font-weight:600; box-shadow: 0 3px 0 var(--color-secondary-shadow); }
  button:disabled { opacity:0.4; cursor:not-allowed; box-shadow:none; }
  button.primary { background:linear-gradient(180deg, var(--color-accent-1), var(--color-accent-2)); color:#fff; box-shadow: 0 3px 0 var(--color-accent-shadow), 0 5px 10px rgba(139,68,22,0.25); }
  select, input[type="file"], input[type="text"] { border:1px solid var(--color-border-input); border-radius:6px; padding:6px 10px; font-size:13px; background:#fff; color:var(--color-text); }
  input[type="text"] { min-width:220px; }
  #reportSvgContainer { overflow-x:auto; background:#1a1d29; border-radius:8px; max-width:900px; margin-top:16px; }
</style>
</head>
<body>
  <h1>App voz — Evaluación</h1>

  <div class="section">
    <div class="section-label">Canción de referencia</div>
    <div class="section-row">
      <label>MIDI: <input type="file" id="midiInput" accept=".mid,.midi"></label>
    </div>
  </div>

  <div class="section">
    <div class="section-label">Dispositivo de entrada</div>
    <div class="section-row">
      <button id="detectDevicesBtn">Detectar dispositivos de audio</button>
      <select id="deviceSelect" disabled>
        <option value="default::both">Micrófono integrado</option>
      </select>
    </div>
  </div>

  <div class="section">
    <div class="section-label">Grabación</div>
    <div class="section-row">
      <label>Nombre del alumno/a: <input type="text" id="studentName" placeholder="Nombre..."></label>
      <button id="recordBtn" class="primary" disabled>Grabar</button>
      <button id="stopBtn" disabled>Detener</button>
      <button id="downloadReportBtn" disabled>Descargar informe</button>
    </div>
  </div>

  <div id="status">
    <div id="midiStatus">Sin MIDI cargado.</div>
    <div id="deviceStatus"></div>
    <div id="recordingStatus"></div>
  </div>

  <div id="reportSvgContainer"></div>

  <script src="./midi-parser.js"></script>
  <script src="./piano-roll-geometry.js"></script>
  <script src="./audio-level.js"></script>
  <script src="./pitch-detection.js"></script>
  <script src="./note-utils.js"></script>
  <script src="./note-tuning.js"></script>
  <script src="./evaluacion-alignment-utils.js"></script>
  <script src="./evaluacion-report-svg.js"></script>
  <script>
  </script>
</body>
</html>
```

- [ ] **Step 2: Add state, constants, MIDI loading, and device detection**

Inside the empty `<script>` tag at the bottom of `App voz/evaluacion.html`, add:

```js
    const state = {
      audioContext: new (window.AudioContext || window.webkitAudioContext)(),
      notes: [],
      beats: [],
      durationSec: 0,
      voz: null,
      mediaStream: null,
      recording: false,
      recordStartTime: null,
      recordedSamples: [],
      lastReportSvg: null,
      recordingRafId: null
    };

    const PIXELS_PER_SECOND = 150;
    const ROW_HEIGHT = 18;
    const CANVAS_HEIGHT = 240;
    const COLOR_IN_TUNE = '#3ecf6e';
    const COLOR_OUT_OF_TUNE = '#e05a4e';
    const COLOR_GRID_ROW = 'rgba(255,255,255,0.04)';
    const COLOR_GRID_BEAT = 'rgba(255,255,255,0.05)';
    const COLOR_NOTE_BORDER = 'rgba(0,0,0,0.28)';
    const COLOR_PITCH_LINE = '#f5d90a';

    function updateRecordButtonState() {
      const hasName = document.getElementById('studentName').value.trim().length > 0;
      const hasPendingReport = state.lastReportSvg !== null;
      const hasMidi = state.notes.length > 0;
      document.getElementById('recordBtn').disabled = !hasName || hasPendingReport || !hasMidi;
    }

    document.getElementById('midiInput').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const buffer = await file.arrayBuffer();
        const { notes, durationSec, beats } = parseMidi(buffer);
        state.notes = notes;
        state.durationSec = durationSec;
        state.beats = beats;
        document.getElementById('midiStatus').textContent =
          `MIDI cargado: ${notes.length} notas, duración ${durationSec.toFixed(2)}s`;
      } catch (err) {
        state.notes = [];
        state.durationSec = 0;
        state.beats = [];
        document.getElementById('midiStatus').textContent =
          `Error al cargar el MIDI: ${err.message || 'Archivo MIDI inválido'}`;
      }
      updateRecordButtonState();
    });

    document.getElementById('studentName').addEventListener('input', updateRecordButtonState);

    async function detectDevices() {
      const statusEl = document.getElementById('deviceStatus');
      const select = document.getElementById('deviceSelect');
      try {
        const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        tempStream.getTracks().forEach((track) => track.stop());
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter((d) => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default');
        select.innerHTML = '';
        const defaultOption = document.createElement('option');
        defaultOption.value = 'default::both';
        defaultOption.textContent = 'Micrófono integrado';
        select.appendChild(defaultOption);
        audioInputs.forEach((device) => {
          const label = device.label || 'Dispositivo de audio';
          [['L', 'Canal 1 (L)'], ['R', 'Canal 2 (R)'], ['both', 'L+R (mezclado)']].forEach(([channelValue, channelLabel]) => {
            const option = document.createElement('option');
            option.value = `${device.deviceId}::${channelValue}`;
            option.textContent = `${label} — ${channelLabel}`;
            select.appendChild(option);
          });
        });
        select.disabled = false;
        statusEl.textContent = `${audioInputs.length} dispositivo(s) externo(s) detectado(s).`;
      } catch (err) {
        statusEl.textContent = `Error al detectar dispositivos: ${err.message || err.name}`;
      }
    }

    document.getElementById('detectDevicesBtn').addEventListener('click', detectDevices);
```

- [ ] **Step 3: Add the recording flow**

Append to the same `<script>` block:

```js
    function createVozWithChannel(stream, audioContext, channel) {
      const source = audioContext.createMediaStreamSource(stream);
      let routedSource = source;
      if (channel === 'L' || channel === 'R') {
        const splitter = audioContext.createChannelSplitter(2);
        const merger = audioContext.createChannelMerger(1);
        source.connect(splitter);
        splitter.connect(merger, channel === 'L' ? 0 : 1, 0);
        routedSource = merger;
      }
      const gainNode = audioContext.createGain();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      routedSource.connect(gainNode);
      gainNode.connect(analyser);
      const byteBuffer = new Uint8Array(analyser.fftSize);
      const floatBuffer = new Float32Array(analyser.fftSize);
      return {
        getLevel() {
          analyser.getByteTimeDomainData(byteBuffer);
          return computeLevel(byteBuffer);
        },
        getPitch() {
          analyser.getFloatTimeDomainData(floatBuffer);
          return detectPitch(floatBuffer, audioContext.sampleRate);
        }
      };
    }

    async function startRecording() {
      const [deviceId, channel] = document.getElementById('deviceSelect').value.split('::');
      const constraints = deviceId === 'default'
        ? { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }
        : { audio: { deviceId: { exact: deviceId }, channelCount: 2, echoCancellation: false, noiseSuppression: false, autoGainControl: false } };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      state.mediaStream = stream;

      if (state.audioContext.state === 'suspended') {
        await state.audioContext.resume();
      }

      state.voz = createVozWithChannel(stream, state.audioContext, channel);
      state.recording = true;
      state.recordStartTime = state.audioContext.currentTime;
      state.recordedSamples = [];
      document.getElementById('recordBtn').disabled = true;
      document.getElementById('stopBtn').disabled = false;
      recordLoop();
    }

    function recordLoop() {
      if (!state.recording) return;
      const t = state.audioContext.currentTime - state.recordStartTime;
      const { peak } = state.voz.getLevel();
      const frequency = peak > 0.02 ? state.voz.getPitch() : null;
      if (frequency !== null) {
        state.recordedSamples.push({ time: t, frequency });
      }
      document.getElementById('recordingStatus').textContent = `Grabando... ${t.toFixed(1)}s`;
      state.recordingRafId = requestAnimationFrame(recordLoop);
    }

    function stopRecording() {
      state.recording = false;
      if (state.recordingRafId !== null) {
        cancelAnimationFrame(state.recordingRafId);
        state.recordingRafId = null;
      }
      if (state.mediaStream) {
        state.mediaStream.getTracks().forEach((track) => track.stop());
        state.mediaStream = null;
      }
      document.getElementById('stopBtn').disabled = true;
      document.getElementById('recordingStatus').textContent = 'Procesando...';
      processRecording();
    }

    document.getElementById('recordBtn').addEventListener('click', async () => {
      try {
        await startRecording();
      } catch (err) {
        document.getElementById('recordingStatus').textContent = `No se pudo activar el micrófono: ${err.message || err.name}`;
      }
    });

    document.getElementById('stopBtn').addEventListener('click', stopRecording);
```

- [ ] **Step 4: Add the processing pipeline**

Append to the same `<script>` block:

```js
    function processRecording() {
      const bounds = findSingingBounds(state.recordedSamples, {});
      if (!bounds) {
        document.getElementById('recordingStatus').textContent =
          'No se detectó canto en la grabación. Intenta grabar de nuevo.';
        updateRecordButtonState();
        return;
      }
      const singingDurationSec = bounds.endTime - bounds.startTime;
      const stretchFactor = computeStretchFactor(singingDurationSec, state.durationSec);
      const warpedNotes = warpNotes(state.notes, bounds.startTime, stretchFactor);
      const warpedBeats = warpBeats(state.beats, bounds.startTime, stretchFactor);
      const noteProgress = judgeNotes(warpedNotes, state.recordedSamples, 50, { centsOffTarget, isInTune });
      const pitchHistoryForSvg = state.recordedSamples.map((s) => ({ time: s.time, pitch: frequencyToMidi(s.frequency) }));
      const svg = buildEvaluationReportSvg(
        warpedNotes,
        noteProgress,
        pitchHistoryForSvg,
        warpedBeats,
        {
          pixelsPerSecond: PIXELS_PER_SECOND,
          rowHeight: ROW_HEIGHT,
          height: CANVAS_HEIGHT,
          gapThresholdSec: 0.15,
          colors: {
            inTune: COLOR_IN_TUNE,
            outOfTune: COLOR_OUT_OF_TUNE,
            gridRow: COLOR_GRID_ROW,
            gridBeat: COLOR_GRID_BEAT,
            noteBorder: COLOR_NOTE_BORDER,
            pitchLine: COLOR_PITCH_LINE
          }
        },
        { pitchRange, computeNoteRect, pitchToY, pitchPointX, shouldBreakLine, computeSemitoneGridLines }
      );
      state.lastReportSvg = svg;
      document.getElementById('reportSvgContainer').innerHTML = svg;
      document.getElementById('recordingStatus').textContent = 'Informe generado. Descárgalo para poder grabar de nuevo.';
      document.getElementById('downloadReportBtn').disabled = false;
      updateRecordButtonState();
    }
```

- [ ] **Step 5: Add the download flow**

Append to the same `<script>` block:

```js
    async function downloadReport() {
      if (!window.showSaveFilePicker) {
        document.getElementById('recordingStatus').textContent =
          'Este navegador no permite elegir carpeta de destino. Usa Chrome, Edge o Brave.';
        return;
      }
      const name = document.getElementById('studentName').value.trim();
      const filename = `${name || 'informe'}.svg`;
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: 'Imagen SVG', accept: { 'image/svg+xml': ['.svg'] } }]
        });
        const writable = await handle.createWritable();
        await writable.write(state.lastReportSvg);
        await writable.close();
        resetAfterDownload();
      } catch (err) {
        if (err.name === 'AbortError') return;
        document.getElementById('recordingStatus').textContent = `Error al guardar: ${err.message || err.name}`;
      }
    }

    function resetAfterDownload() {
      document.getElementById('studentName').value = '';
      document.getElementById('reportSvgContainer').innerHTML = '';
      state.lastReportSvg = null;
      state.recordedSamples = [];
      document.getElementById('downloadReportBtn').disabled = true;
      document.getElementById('recordingStatus').textContent = 'Escribe el nombre del siguiente alumno/a para grabar.';
      updateRecordButtonState();
    }

    document.getElementById('downloadReportBtn').addEventListener('click', downloadReport);
```

- [ ] **Step 6: Run the test suite to confirm no regression**

Run (from `App voz/`): `node --test`
Expected: 126 tests, 126 passing — this task adds no `.js` module, so the count from Task 2 is unchanged.

- [ ] **Step 7: Manual verification in Chrome**

Start a local static server (`python3 -m http.server <port>` from inside `App voz/`) and open `evaluacion.html` in Chrome (a plain `file://` open may run scripts fine too, but `getUserMedia`/`showSaveFilePicker` are more reliable served over `http://localhost`). Confirm:
- Loading a MIDI file updates `#midiStatus` and does NOT enable "Grabar" yet (name field still empty).
- Clicking "Detectar dispositivos de audio" prompts for microphone permission, then populates `#deviceSelect` with "Micrófono integrado" plus 3 entries per external device connected (or just the built-in mic if no external interface is plugged in — this is expected and fine).
- Typing a name in "Nombre del alumno/a" enables "Grabar" (with a MIDI loaded).
- Clicking "Grabar" starts `#recordingStatus` counting up ("Grabando... 0.1s", "0.2s", ...); "Grabar" is disabled, "Detener" is enabled.
- Singing/talking briefly, then clicking "Detener": status shows "Procesando..." then either the tuning report appears in `#reportSvgContainer` (colored note rectangles + yellow pitch line + grid) or, if nothing was said, "No se detectó canto en la grabación."
- With a report showing, "Grabar" stays disabled even after typing a new name — until "Descargar informe" is clicked and a save dialog actually appears (Chrome's native "Save As").
- After choosing a destination and saving: the name field and the SVG container clear, "Grabar" is disabled again, ready for the next name.
- Cancelling the save dialog leaves the report and disabled "Grabar" state untouched.

- [ ] **Step 8: Commit**

```bash
git add "App voz/evaluacion.html"
git commit -m "feat(evaluacion): add the evaluation tool page (recording, alignment, report)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Context doc for the evaluation tool

**Files:**
- Create: `App voz/evaluacion_contexto.md`

**Interfaces:** none — documentation only.

- [ ] **Step 1: Write the context doc**

Create `App voz/evaluacion_contexto.md`:

```markdown
# App voz — Evaluación (contexto)

Herramienta separada de la app de práctica (`index.html`), de uso exclusivo del profesor en su propio computador. Vive en la rama `local/evaluacion`, que nunca se fusiona ni se sube a GitHub — no está pensada para los alumnos.

## Propósito

Evaluar una interpretación cantada en vivo, en clase, sin pista de acompañamiento (la tocan compañeros en vivo, con tempo humano variable). El profesor aprieta "Grabar", puede alejarse a evaluar otros instrumentos, y da la entrada de voz desde cualquier parte de la sala — no hay ningún reloj compartido entre la grabación y el MIDI de referencia.

## Características implementadas

- **Grabación sin reproducción**: a diferencia de la app de práctica, esta herramienta no reproduce ningún WAV ni sigue un reloj de MIDI en tiempo real — solo captura una lista continua de `{tiempo, tono}` mientras haya señal, desde que se aprieta "Grabar" hasta "Detener".
- **Detección automática de inicio/fin de canto** (`evaluacion-alignment-utils.js`, `findSingingBounds`): busca el primer y último tramo de muestras sin huecos largos (por defecto, al menos 5 muestras seguidas con menos de 0.3s de separación entre ellas) para descartar ruido aislado antes/después del canto real. Los parámetros (`minRunSamples`, `maxGapSec`) son un punto de partida razonable, no calibrado con grabaciones reales todavía — ajustar si en la práctica el corte queda mal.
- **Ajuste de tempo con un solo factor de estiramiento global** (`computeStretchFactor`, `warpNotes`, `warpBeats`): compara la duración cantada real contra la duración del MIDI original, y reposiciona todas las notas/pulsos del MIDI proporcionalmente. No corrige aceleraciones/atrasos de tempo a mitad de la interpretación — decisión explícita para mantenerlo simple y confiable.
- **Juzgamiento de notas post-grabación** (`judgeNotes`): para cada nota ya reposicionada, cuenta qué porcentaje de las muestras capturadas en su ventana de tiempo estuvieron afinadas (reutiliza `centsOffTarget`/`isInTune` de `note-tuning.js`, igual que la app de práctica).
- **Informe: un solo color por nota** (`evaluacion-report-svg.js`, `buildEvaluationReportSvg`): verde si ≥50% de las muestras de una nota estuvieron afinadas, rojo en caso contrario (incluida una nota sin ninguna muestra) — a diferencia del informe bicolor de la app de práctica. Incluye la misma grilla de semitonos/pulsos y borde por nota del rediseño visual reciente.
- **Selector de dispositivo de entrada**: además del micrófono integrado, cualquier dispositivo externo detectado (`navigator.mediaDevices.enumerateDevices`) se ofrece en 3 variantes — Canal 1 (L), Canal 2 (R), L+R — separando canales con un `ChannelSplitterNode`/`ChannelMergerNode` de Web Audio API. Cubre interfaces de hasta 2 canales (ej. PreSonus AudioBox, Behringer XENYX X2442USB vía "USB Audio Codec"); interfaces con más canales (ej. Focusrite Saffire Pro 24) solo entregan su par estéreo por defecto — limitación real del navegador, no de esta herramienta.
- **Descarga obligatoria antes de volver a grabar**: el botón "Grabar" queda deshabilitado mientras haya un informe generado sin descargar. La descarga usa `window.showSaveFilePicker()` (Chrome/Edge/Brave) para forzar la ventana de "Guardar como" cada vez.
- **Nombre de alumno/a obligatorio**: sin nombre no se puede grabar; el nombre se usa como nombre de archivo sugerido al descargar, y se limpia automáticamente después de una descarga exitosa.

## Pendientes / decisiones diferidas

- **2 señales simultáneas** (evaluar un dúo con 2 micrófonos a la vez, 2 informes por separado): fase futura, no incluida en esta primera versión.
- **Calibración de `findSingingBounds`**: los valores por defecto (`minRunSamples=5`, `maxGapSec=0.3`) necesitan probarse con grabaciones reales del profesor y ajustarse si el corte de inicio/fin queda mal.
- Ver también `docs/superpowers/specs/2026-09-23-plugin-correccion-pitch-produccion-vision.md` — una idea más grande (plugin de DAW para sesiones multipista) que surgió durante el diseño de esta herramienta, documentada por separado, sin relación de código con esta herramienta.
```

- [ ] **Step 2: Commit**

```bash
git add "App voz/evaluacion_contexto.md"
git commit -m "docs(evaluacion): add context doc for the evaluation tool

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
