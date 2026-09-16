# App voz — Informe de desempeño Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a song finishes (or is stopped), show and let the user download a performance report: a `.txt` with 4 summary metrics plus a per-note table, and a full-song SVG "piano roll" (static, not scrolling) with a horizontally-scrollable in-app viewer.

**Architecture:** Two new pure, `node --test`-able files (`report-utils.js` for the metrics/text, `report-svg.js` for the visual) get wired into `index.html`'s existing state machine at the 3 points where playback already ends (`node.onended`, `stopPlayback()`, and the silence-guard auto-stop which itself calls `stopPlayback()`). Two small pieces of state that don't exist today get recorded during playback: `noteProgress[i].firstSignalTime` (when the singer first hit a note) and `state.fullPitchHistory` (the sung-pitch trace for the whole song, unlike the existing `pitchHistory` which is pruned to a few seconds for the live scrolling view).

**Tech Stack:** Vanilla JS, no build step. Tests run with `node --test` against pure functions exported via `module.exports`. Manual browser verification via a local `python3 -m http.server` and the `mcp__Claude_Browser__*` tools.

## Global Constraints

- No build step, no npm, no external libraries — hand-written JS only, consistent with the rest of the repo (`CLAUDE.md`).
- Every new file exports pure functions via `module.exports` guarded by `typeof module !== 'undefined' && module.exports`, so both `node --test` and the plain `<script>` browser global work.
- **Dependency-injection pattern for cross-file logic reuse:** every existing pure `.js` file in `App voz/` is self-contained — none of them `require()` or otherwise depend on another library file (verified: no `require` of a sibling file appears in any existing test file). `report-svg.js` genuinely needs `piano-roll-geometry.js`'s functions (`pitchRange`, `computeNoteRect`, `pitchToY`, `pitchPointX`, `shouldBreakLine`) to keep the report's visual layout byte-for-byte consistent with the live piano roll's math — duplicating that geometry would risk drift. Rather than breaking the "no cross-file dependency" convention with a `require`/global-detection hack, `buildReportSvg` takes those functions as an explicit parameter object (`geometryFns`) supplied by the caller — `index.html` passes the already-loaded browser globals; tests pass `require('../piano-roll-geometry.js')` directly. Same pattern for `formatReportText`, which takes `midiToNoteName` (from `note-utils.js`) as an explicit parameter rather than depending on it globally. `report-utils.js`'s own in-tune ratio check is small enough (one division) that it's inlined directly rather than importing `tuningRatio` from `note-tuning.js` — consistent with this app's established preference for small duplication over cross-module coupling.
- Design spec: `docs/superpowers/specs/2026-09-15-app-voz-informe-desempeno-design.md`.

---

### Task 1: `report-utils.js` — metrics and text report

**Files:**
- Create: `App voz/report-utils.js`
- Test: `App voz/tests/report-utils.test.js`

**Interfaces:**
- Produces: `isNoteInTune(progress, threshold = 0.5) -> boolean`, `beatDurationAt(beats, time) -> number`, `startedOnTime(progress, note, beats) -> boolean`, `longestStreak(values, target) -> number`, `computeReportStats(notes, noteProgress, beats) -> {totalNotes, inTuneCount, inTunePercent, onTimeCount, onTimePercent, longestInTuneStreak, longestOutOfTuneStreak, perNote: [{index, start, pitch, sung, inTune, onTime}]}`, `formatReportText(stats, durationSec, midiToNoteName) -> string`.
- Consumes (Task 3 only, not this task): `midiToNoteName` from `note-utils.js`, passed in by the caller — `report-utils.js` itself does not `require` or reference it.
- `noteProgress[i]` objects passed in are expected to have `{timeInTune, timeTotal, hadSignal, firstSignalTime}` — `firstSignalTime` is `null` if the note was never sung, otherwise the timestamp (same clock as `judgmentTime` elsewhere in the app) of the first detected signal within that note's active window. This field does not exist in `index.html` yet — Task 3 adds it. This task's tests construct these objects by hand.

- [ ] **Step 1: Write the failing tests**

Create `App voz/tests/report-utils.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { isNoteInTune, beatDurationAt, startedOnTime, longestStreak, computeReportStats, formatReportText } = require('../report-utils.js');
const { midiToNoteName } = require('../note-utils.js');

test('isNoteInTune is true at exactly the 0.5 threshold and false just under it', () => {
  assert.equal(isNoteInTune({ timeInTune: 0.5, timeTotal: 1 }), true);
  assert.equal(isNoteInTune({ timeInTune: 0.49, timeTotal: 1 }), false);
});

test('isNoteInTune is false for a note with no elapsed time (never sung)', () => {
  assert.equal(isNoteInTune({ timeInTune: 0, timeTotal: 0 }), false);
});

test('beatDurationAt returns the interval containing the given time', () => {
  const beats = [0, 1, 2, 3, 4];
  assert.equal(beatDurationAt(beats, 1.5), 1);
});

test('beatDurationAt falls back to the first interval before the first beat', () => {
  const beats = [2, 3, 4];
  assert.equal(beatDurationAt(beats, 0.5), 1);
});

test('beatDurationAt falls back to the last interval at or after the last beat', () => {
  const beats = [0, 1, 2];
  assert.equal(beatDurationAt(beats, 5), 1);
});

test('beatDurationAt returns a default when fewer than 2 beats are available', () => {
  assert.equal(beatDurationAt([], 1), 0.5);
  assert.equal(beatDurationAt([0], 1), 0.5);
});

test('startedOnTime is false when the note was never sung (firstSignalTime is null)', () => {
  const progress = { timeInTune: 0, timeTotal: 0, hadSignal: false, firstSignalTime: null };
  const note = { start: 2, duration: 1 };
  assert.equal(startedOnTime(progress, note, [0, 1, 2, 3]), false);
});

test('startedOnTime is true within half a beat of the note start, false just outside it', () => {
  const note = { start: 2, duration: 1 };
  const beats = [0, 1, 2, 3]; // 1s beat interval around note.start, so tolerance is 0.5s
  const onTime = { timeInTune: 0, timeTotal: 0, hadSignal: true, firstSignalTime: 2.5 };
  const late = { timeInTune: 0, timeTotal: 0, hadSignal: true, firstSignalTime: 2.51 };
  assert.equal(startedOnTime(onTime, note, beats), true);
  assert.equal(startedOnTime(late, note, beats), false);
});

test('longestStreak finds the longest run of a target value', () => {
  assert.equal(longestStreak([true, true, false, true, true, true, false], true), 3);
  assert.equal(longestStreak([true, true, false, true, true, true, false], false), 1);
});

test('longestStreak returns 0 for an empty array', () => {
  assert.equal(longestStreak([], true), 0);
});

test('computeReportStats aggregates in-tune %, on-time %, and both streaks correctly', () => {
  const notes = [
    { start: 0, duration: 1, pitch: 60 },
    { start: 1, duration: 1, pitch: 62 },
    { start: 2, duration: 1, pitch: 64 },
    { start: 3, duration: 1, pitch: 65 }
  ];
  const beats = [0, 1, 2, 3, 4]; // 1s intervals, 0.5s tolerance throughout
  const noteProgress = [
    { timeInTune: 0.9, timeTotal: 1, hadSignal: true, firstSignalTime: 0.1 },  // in tune, on time
    { timeInTune: 0.9, timeTotal: 1, hadSignal: true, firstSignalTime: 1.1 },  // in tune, on time
    { timeInTune: 0.1, timeTotal: 1, hadSignal: true, firstSignalTime: 2.9 },  // out of tune, NOT on time (0.9s late, tolerance 0.5s)
    { timeInTune: 0, timeTotal: 0, hadSignal: false, firstSignalTime: null }   // never sung
  ];

  const stats = computeReportStats(notes, noteProgress, beats);

  assert.equal(stats.totalNotes, 4);
  assert.equal(stats.inTuneCount, 2);
  assert.equal(stats.inTunePercent, 50);
  assert.equal(stats.onTimeCount, 2);
  assert.equal(stats.onTimePercent, 50);
  assert.equal(stats.longestInTuneStreak, 2);
  assert.equal(stats.longestOutOfTuneStreak, 2);
  assert.equal(stats.perNote.length, 4);
  assert.equal(stats.perNote[3].sung, false);
});

test('computeReportStats returns 0% for both percentages when there are no notes', () => {
  const stats = computeReportStats([], [], []);
  assert.equal(stats.totalNotes, 0);
  assert.equal(stats.inTunePercent, 0);
  assert.equal(stats.onTimePercent, 0);
  assert.equal(stats.longestInTuneStreak, 0);
  assert.equal(stats.longestOutOfTuneStreak, 0);
});

test('formatReportText includes the 4 summary metrics and a row per note', () => {
  const stats = {
    totalNotes: 2,
    inTuneCount: 1,
    inTunePercent: 50,
    onTimeCount: 2,
    onTimePercent: 100,
    longestInTuneStreak: 1,
    longestOutOfTuneStreak: 1,
    perNote: [
      { index: 0, start: 0, pitch: 60, sung: true, inTune: true, onTime: true },
      { index: 1, start: 1, pitch: 62, sung: true, inTune: false, onTime: true }
    ]
  };
  const text = formatReportText(stats, 2.5, midiToNoteName);
  assert.match(text, /50\.0%/);
  assert.match(text, /100\.0%/);
  assert.match(text, /Racha máxima de notas afinadas seguidas: 1/);
  assert.match(text, /Racha máxima de notas desafinadas seguidas: 1/);
  assert.match(text, /C4/);
  assert.match(text, /D4/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "App voz" && node --test tests/report-utils.test.js`
Expected: FAIL — `Cannot find module '../report-utils.js'` (the file doesn't exist yet).

- [ ] **Step 3: Implement `report-utils.js`**

Create `App voz/report-utils.js`:

```js
function isNoteInTune(progress, threshold = 0.5) {
  if (progress.timeTotal <= 0) return false;
  return (progress.timeInTune / progress.timeTotal) >= threshold;
}

function beatDurationAt(beats, time) {
  if (beats.length < 2) return 0.5;
  for (let i = 0; i < beats.length - 1; i++) {
    if (time >= beats[i] && time < beats[i + 1]) {
      return beats[i + 1] - beats[i];
    }
  }
  if (time < beats[0]) return beats[1] - beats[0];
  return beats[beats.length - 1] - beats[beats.length - 2];
}

function startedOnTime(progress, note, beats) {
  if (progress.firstSignalTime === null || progress.firstSignalTime === undefined) return false;
  const tolerance = beatDurationAt(beats, note.start) / 2;
  return Math.abs(progress.firstSignalTime - note.start) <= tolerance;
}

function longestStreak(values, target) {
  let longest = 0;
  let current = 0;
  values.forEach((value) => {
    if (value === target) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  });
  return longest;
}

function computeReportStats(notes, noteProgress, beats) {
  const perNote = notes.map((note, i) => {
    const progress = noteProgress[i];
    return {
      index: i,
      start: note.start,
      pitch: note.pitch,
      sung: progress.hadSignal === true,
      inTune: isNoteInTune(progress),
      onTime: startedOnTime(progress, note, beats)
    };
  });

  const totalNotes = perNote.length;
  const inTuneCount = perNote.filter((n) => n.inTune).length;
  const onTimeCount = perNote.filter((n) => n.onTime).length;

  return {
    totalNotes,
    inTuneCount,
    inTunePercent: totalNotes > 0 ? (inTuneCount / totalNotes) * 100 : 0,
    onTimeCount,
    onTimePercent: totalNotes > 0 ? (onTimeCount / totalNotes) * 100 : 0,
    longestInTuneStreak: longestStreak(perNote.map((n) => n.inTune), true),
    longestOutOfTuneStreak: longestStreak(perNote.map((n) => n.inTune), false),
    perNote
  };
}

function formatReportText(stats, durationSec, midiToNoteName) {
  const lines = [];
  lines.push('Informe de desempeño — App voz');
  lines.push(`Duración: ${durationSec.toFixed(2)}s — ${stats.totalNotes} notas`);
  lines.push('');
  lines.push(`% de notas afinadas: ${stats.inTunePercent.toFixed(1)}% (${stats.inTuneCount}/${stats.totalNotes})`);
  lines.push(`% de notas que empezaron a tiempo: ${stats.onTimePercent.toFixed(1)}% (${stats.onTimeCount}/${stats.totalNotes})`);
  lines.push(`Racha máxima de notas afinadas seguidas: ${stats.longestInTuneStreak}`);
  lines.push(`Racha máxima de notas desafinadas seguidas: ${stats.longestOutOfTuneStreak}`);
  lines.push('');
  lines.push('Detalle por nota:');
  lines.push('Hora\tNota\tA tiempo\tAfinada');
  stats.perNote.forEach((n) => {
    lines.push(`${n.start.toFixed(2)}s\t${midiToNoteName(n.pitch)}\t${n.onTime ? 'sí' : 'no'}\t${n.inTune ? 'sí' : 'no'}`);
  });
  return lines.join('\n');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { isNoteInTune, beatDurationAt, startedOnTime, longestStreak, computeReportStats, formatReportText };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "App voz" && node --test tests/report-utils.test.js`
Expected: PASS, all 13 tests.

- [ ] **Step 5: Commit**

```bash
git add "App voz/report-utils.js" "App voz/tests/report-utils.test.js"
git commit -m "feat(app-voz): add report-utils.js for performance report metrics"
```

---

### Task 2: `report-svg.js` — static full-song visual report

**Files:**
- Create: `App voz/report-svg.js`
- Test: `App voz/tests/report-svg.test.js`

**Interfaces:**
- Produces: `buildReportSvg(notes, noteProgress, fullPitchHistory, options, geometryFns) -> string` (a complete `<svg>...</svg>` string).
  - `options`: `{ pixelsPerSecond, rowHeight, height, gapThresholdSec, colors: { inTune, outOfTune, noSignal, pitchLine } }` — all required, all colors as CSS hex strings.
  - `geometryFns`: `{ pitchRange, computeNoteRect, pitchToY, pitchPointX, shouldBreakLine }` — the caller supplies these (see Global Constraints on why).
  - `noteProgress[i]` objects need `{timeInTune, timeTotal, hadSignal}` (does NOT need `firstSignalTime` — this file only draws tuning, not timing).
  - `fullPitchHistory`: `{time, pitch}[]`, same shape as the existing `state.pitchHistory`.
- Consumes: nothing directly — this task's tests `require('../piano-roll-geometry.js')` and pass its exports as `geometryFns`.

- [ ] **Step 1: Write the failing tests**

Create `App voz/tests/report-svg.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReportSvg } = require('../report-svg.js');
const geometryFns = require('../piano-roll-geometry.js');

const OPTIONS = {
  pixelsPerSecond: 100,
  rowHeight: 18,
  height: 240,
  gapThresholdSec: 0.15,
  colors: { inTune: '#3ecf6e', outOfTune: '#e05a4e', noSignal: '#6b7280', pitchLine: '#f5d90a' }
};

test('buildReportSvg returns an svg root element sized to the song duration', () => {
  const notes = [{ start: 0, duration: 1, pitch: 60 }, { start: 2, duration: 1, pitch: 64 }];
  const noteProgress = [
    { timeInTune: 1, timeTotal: 1, hadSignal: true },
    { timeInTune: 0, timeTotal: 0, hadSignal: false }
  ];
  const svg = buildReportSvg(notes, noteProgress, [], OPTIONS, geometryFns);
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="300" height="240"/);
});

test('buildReportSvg draws a solid no-signal rect for a note that was never sung', () => {
  const notes = [{ start: 0, duration: 1, pitch: 60 }];
  const noteProgress = [{ timeInTune: 0, timeTotal: 0, hadSignal: false }];
  const svg = buildReportSvg(notes, noteProgress, [], OPTIONS, geometryFns);
  assert.match(svg, /fill="#6b7280"/);
  assert.doesNotMatch(svg, /fill="#3ecf6e"/);
});

test('buildReportSvg draws a bicolor bar (in-tune + out-of-tune) for a sung note', () => {
  const notes = [{ start: 0, duration: 1, pitch: 60 }];
  const noteProgress = [{ timeInTune: 0.5, timeTotal: 1, hadSignal: true }];
  const svg = buildReportSvg(notes, noteProgress, [], OPTIONS, geometryFns);
  assert.match(svg, /fill="#3ecf6e"/);
  assert.match(svg, /fill="#e05a4e"/);
});

test('buildReportSvg draws a pitch path that breaks across a gap larger than the threshold', () => {
  const notes = [{ start: 0, duration: 5, pitch: 60 }];
  const noteProgress = [{ timeInTune: 0, timeTotal: 0, hadSignal: false }];
  // first 3 points close together (0.05s gaps, under the 0.15s threshold -> connected);
  // then a jump to t=3 (2.9s gap, over the threshold -> a new M break)
  const history = [
    { time: 0, pitch: 60 }, { time: 0.05, pitch: 60 }, { time: 0.1, pitch: 60 }, { time: 3, pitch: 60 }
  ];
  const svg = buildReportSvg(notes, noteProgress, history, OPTIONS, geometryFns);
  const moveCommands = (svg.match(/M /g) || []).length;
  assert.equal(moveCommands, 2);
});

test('buildReportSvg omits the pitch path element entirely when there is no pitch history', () => {
  const notes = [{ start: 0, duration: 1, pitch: 60 }];
  const noteProgress = [{ timeInTune: 0, timeTotal: 0, hadSignal: false }];
  const svg = buildReportSvg(notes, noteProgress, [], OPTIONS, geometryFns);
  assert.doesNotMatch(svg, /<path/);
});

test('buildReportSvg handles an empty notes array without throwing', () => {
  const svg = buildReportSvg([], [], [], OPTIONS, geometryFns);
  assert.match(svg, /^<svg/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "App voz" && node --test tests/report-svg.test.js`
Expected: FAIL — `Cannot find module '../report-svg.js'`.

- [ ] **Step 3: Implement `report-svg.js`**

Create `App voz/report-svg.js`:

```js
function buildReportSvg(notes, noteProgress, fullPitchHistory, options, geometryFns) {
  const { pitchRange, computeNoteRect, pitchToY, pitchPointX, shouldBreakLine } = geometryFns;
  const { pixelsPerSecond, rowHeight, height, gapThresholdSec, colors } = options;
  const { minPitch, maxPitch } = pitchRange(notes);
  const durationSec = notes.reduce((max, n) => Math.max(max, n.start + n.duration), 0);
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
      return `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" fill="${colors.noSignal}" />`;
    }
    const ratio = progress.timeTotal > 0 ? progress.timeInTune / progress.timeTotal : 0;
    const greenWidth = rect.width * ratio;
    return (
      `<rect x="${rect.x}" y="${rect.y}" width="${greenWidth}" height="${rect.height}" fill="${colors.inTune}" />` +
      `<rect x="${rect.x + greenWidth}" y="${rect.y}" width="${rect.width - greenWidth}" height="${rect.height}" fill="${colors.outOfTune}" />`
    );
  }).join('\n');

  let pathData = '';
  fullPitchHistory.forEach((point, i) => {
    const x = pitchPointX(point.time, 0, pixelsPerSecond, 0);
    const y = pitchToY(point.pitch, minPitch, maxPitch, height);
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "App voz" && node --test tests/report-svg.test.js`
Expected: PASS, all 6 tests.

- [ ] **Step 5: Commit**

```bash
git add "App voz/report-svg.js" "App voz/tests/report-svg.test.js"
git commit -m "feat(app-voz): add report-svg.js for the full-song visual report"
```

---

### Task 3: Wire the report into the app

**Files:**
- Modify: `App voz/index.html`

**Interfaces:**
- Consumes: `computeReportStats(notes, noteProgress, beats)`, `formatReportText(stats, durationSec, midiToNoteName)` from Task 1; `buildReportSvg(notes, noteProgress, fullPitchHistory, options, geometryFns)` from Task 2. All three loaded as browser globals via new `<script>` tags.

- [ ] **Step 1: Load the two new scripts**

In `App voz/index.html`, after the line `<script src="./latency-calibration.js"></script>` (around line 63), add:

```html
    <script src="./latency-calibration.js"></script>
    <script src="./report-utils.js"></script>
    <script src="./report-svg.js"></script>
```

- [ ] **Step 2: Add state fields**

In the `state` object literal (around lines 65-90), add `fullPitchHistory` right next to `pitchHistory`:

```js
      pitchHistory: [],
      fullPitchHistory: [],
      latencyOffsetSec: 0,
```

And add `lastReport` as the final property (change the last line from `instrumentNodes: []` to add a new property after it):

```js
      instrumentNodes: [],
      lastReport: null
    };
```

- [ ] **Step 3: Add report-related constants**

After the line `const INSTRUMENT_FADE_SEC = 0.02;` (around line 126), add:

```js
    const CANVAS_HEIGHT = document.getElementById('pianoRoll').height;
    const REPORT_SCROLL_STEP = 300;
```

- [ ] **Step 4: Update `resetNoteProgress()` to initialize `firstSignalTime` and reset `fullPitchHistory`**

Replace the current function body (around lines 156-164):

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

with:

```js
    function resetNoteProgress() {
      state.noteProgress = state.notes.map(() => ({ timeInTune: 0, timeTotal: 0, hadSignal: false, firstSignalTime: null }));
      state.activeNoteIndex = null;
      state.activeNoteColor = null;
      state.lastActiveNoteIndex = null;
      state.lastActiveNoteColor = null;
      state.frozenTime = null;
      state.pitchHistory = [];
      state.fullPitchHistory = [];
    }
```

- [ ] **Step 5: Record `firstSignalTime` in `updateNoteProgress`**

This is the trickiest edit in this task — read it carefully before changing it. `accumulateTuning(progress, isInTuneNow, deltaSeconds)` (from `note-tuning.js`, unchanged) returns a **brand-new** `{timeInTune, timeTotal}` object — it does NOT preserve any other fields. That's why the existing code re-sets `.hadSignal` on a separate line *after* the `state.noteProgress[i] = accumulateTuning(...)` reassignment, instead of setting it once. `firstSignalTime` needs the exact same treatment: read the OLD value before the possible reassignment, compute what the new value should be, and re-apply it after.

Replace the current function body (around lines 545-576):

```js
    function updateNoteProgress(currentTime, detectedFrequency, deltaSeconds) {
      let activeIndex = null;
      let activeColor = null;

      if (state.sourceNode) {
        state.notes.forEach((note, i) => {
          if (noteStatus(note, currentTime) !== 'active') return;
          activeIndex = i;
          activeColor = liveNoteColor(detectedFrequency, note.pitch);
          const hadSignal = state.noteProgress[i].hadSignal || detectedFrequency !== null;
          if (deltaSeconds > 0) {
            const isInTuneNow = activeColor === 'in-tune';
            state.noteProgress[i] = accumulateTuning(state.noteProgress[i], isInTuneNow, deltaSeconds);
          }
          state.noteProgress[i].hadSignal = hadSignal;
        });
      }
```

with:

```js
    function updateNoteProgress(currentTime, detectedFrequency, deltaSeconds) {
      let activeIndex = null;
      let activeColor = null;

      if (state.sourceNode) {
        state.notes.forEach((note, i) => {
          if (noteStatus(note, currentTime) !== 'active') return;
          activeIndex = i;
          activeColor = liveNoteColor(detectedFrequency, note.pitch);
          const hadSignal = state.noteProgress[i].hadSignal || detectedFrequency !== null;
          const firstSignalTime = state.noteProgress[i].firstSignalTime !== null
            ? state.noteProgress[i].firstSignalTime
            : (detectedFrequency !== null ? currentTime : null);
          if (deltaSeconds > 0) {
            const isInTuneNow = activeColor === 'in-tune';
            state.noteProgress[i] = accumulateTuning(state.noteProgress[i], isInTuneNow, deltaSeconds);
          }
          state.noteProgress[i].hadSignal = hadSignal;
          state.noteProgress[i].firstSignalTime = firstSignalTime;
        });
      }
```

(The rest of `updateNoteProgress`, below this block, is unchanged.)

- [ ] **Step 6: Record `fullPitchHistory` in `mainLoop`**

In `mainLoop` (around lines 617-620), replace:

```js
      if (hasMic() && state.sourceNode && detectedFrequency !== null) {
        state.pitchHistory.push({ time: judgmentTime, pitch: frequencyToMidi(detectedFrequency) });
      }
      state.pitchHistory = state.pitchHistory.filter((p) => p.time > currentTime - MAX_PITCH_HISTORY_SEC);
```

with:

```js
      if (hasMic() && state.sourceNode && detectedFrequency !== null) {
        state.pitchHistory.push({ time: judgmentTime, pitch: frequencyToMidi(detectedFrequency) });
        state.fullPitchHistory.push({ time: judgmentTime, pitch: frequencyToMidi(detectedFrequency) });
      }
      state.pitchHistory = state.pitchHistory.filter((p) => p.time > currentTime - MAX_PITCH_HISTORY_SEC);
```

- [ ] **Step 7: Add the report panel and "Ver informe" button to the HTML**

In the `.controls` div, right after `<button id="stopBtn">Detener</button>` (around line 34), add:

```html
    <button id="stopBtn">Detener</button>
    <button id="viewReportBtn" disabled>Ver informe</button>
```

After the `<canvas id="pianoRoll" ...></canvas>` line (around line 54), add:

```html
  <canvas id="pianoRoll" width="900" height="240"></canvas>

  <div id="reportPanel" hidden>
    <div class="report-controls">
      <h2>Informe de desempeño</h2>
      <button id="reportScrollLeftBtn">◀</button>
      <button id="reportScrollRightBtn">▶</button>
      <button id="downloadTxtBtn">Descargar informe (.txt)</button>
      <button id="downloadSvgBtn">Descargar informe (.svg)</button>
      <button id="closeReportBtn">Cerrar</button>
    </div>
    <div id="reportSvgContainer"></div>
    <pre id="reportTextView"></pre>
  </div>
```

- [ ] **Step 8: Add CSS for the report panel**

In the `<style>` block, after the line `input[type="range"] { width:160px; }` (around line 16), add:

```css
  .report-controls { display:flex; align-items:center; gap:12px; margin-bottom:8px; }
  .report-controls h2 { margin:0; font-size:16px; }
  #reportSvgContainer { overflow-x:auto; background:#1a1d29; border-radius:8px; max-width:900px; }
  #reportTextView { background:#1a1d29; padding:12px; border-radius:8px; max-width:900px; overflow-x:auto; white-space:pre-wrap; margin-top:12px; font-size:13px; }
```

- [ ] **Step 9: Add `generateReport`, `showReport`, and `downloadTextFile`**

Right after the `stopPlayback(reason)` function's closing brace (around line 485, before the `document.getElementById('playBtn')...` line), add:

```js
    function generateReport() {
      if (!state.notes.length) return;
      const stats = computeReportStats(state.notes, state.noteProgress, state.beats);
      const text = formatReportText(stats, state.durationSec, midiToNoteName);
      const svg = buildReportSvg(
        state.notes,
        state.noteProgress,
        state.fullPitchHistory,
        {
          pixelsPerSecond: PIXELS_PER_SECOND,
          rowHeight: ROW_HEIGHT,
          height: CANVAS_HEIGHT,
          gapThresholdSec: PITCH_LINE_GAP_SEC,
          colors: {
            inTune: COLOR_IN_TUNE,
            outOfTune: COLOR_OUT_OF_TUNE,
            noSignal: COLOR_NO_SIGNAL,
            pitchLine: COLOR_PITCH_LINE
          }
        },
        { pitchRange, computeNoteRect, pitchToY, pitchPointX, shouldBreakLine }
      );
      state.lastReport = { stats, text, svg };
      document.getElementById('viewReportBtn').disabled = false;
      showReport();
    }

    function showReport() {
      if (!state.lastReport) return;
      document.getElementById('reportSvgContainer').innerHTML = state.lastReport.svg;
      document.getElementById('reportTextView').textContent = state.lastReport.text;
      document.getElementById('reportPanel').hidden = false;
    }

    function downloadTextFile(filename, content, mimeType) {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }
```

- [ ] **Step 10: Hook `generateReport()` into the 3 stop paths, and hide the panel on a new `play()`**

In `play()` (around line 432), right after `document.getElementById('playbackStatus').textContent = '';`, add:

```js
      document.getElementById('reportPanel').hidden = true;
```

In `play()`'s `node.onended` callback (around lines 440-446), add `generateReport();` after re-enabling the voice-type selector:

```js
      node.onended = () => {
        if (state.sourceNode === node) {
          state.frozenTime = state.audioContext.currentTime - state.playStartTime;
          state.sourceNode = null;
          document.getElementById('voiceTypeSelect').disabled = false;
          generateReport();
        }
      };
```

In `stopPlayback(reason)` (around lines 468-485), add `generateReport();` after re-enabling the voice-type selector:

```js
    function stopPlayback(reason) {
      if (state.sourceNode) {
        state.sourceNode.onended = null;
        state.sourceNode.stop();
        state.frozenTime = state.audioContext.currentTime - state.playStartTime;
        state.sourceNode = null;
      }
      state.metronomeNodes.forEach((osc) => {
        try { osc.stop(); } catch (err) { /* already stopped, ignore */ }
      });
      state.metronomeNodes = [];
      state.instrumentNodes.forEach((node) => {
        try { node.stop(); } catch (err) { /* already stopped, ignore */ }
      });
      state.instrumentNodes = [];
      document.getElementById('playbackStatus').textContent = reason;
      document.getElementById('voiceTypeSelect').disabled = false;
      generateReport();
    }
```

(This one change covers both the manual "Detener" button and the silence-guard auto-stop, since both call `stopPlayback()`.)

- [ ] **Step 11: Wire the report panel's buttons**

Right after the existing `document.getElementById('stopBtn').addEventListener(...)` block (around line 492), add:

```js
    document.getElementById('viewReportBtn').addEventListener('click', showReport);

    document.getElementById('closeReportBtn').addEventListener('click', () => {
      document.getElementById('reportPanel').hidden = true;
    });

    document.getElementById('reportScrollLeftBtn').addEventListener('click', () => {
      document.getElementById('reportSvgContainer').scrollBy({ left: -REPORT_SCROLL_STEP, behavior: 'smooth' });
    });

    document.getElementById('reportScrollRightBtn').addEventListener('click', () => {
      document.getElementById('reportSvgContainer').scrollBy({ left: REPORT_SCROLL_STEP, behavior: 'smooth' });
    });

    document.getElementById('downloadTxtBtn').addEventListener('click', () => {
      if (!state.lastReport) return;
      downloadTextFile('informe-app-voz.txt', state.lastReport.text, 'text/plain');
    });

    document.getElementById('downloadSvgBtn').addEventListener('click', () => {
      if (!state.lastReport) return;
      downloadTextFile('informe-app-voz.svg', state.lastReport.svg, 'image/svg+xml');
    });
```

- [ ] **Step 12: Run the full automated test suite**

Run: `cd "App voz" && node --test tests/*.test.js`
Expected: all tests pass (70 total: 51 from before + 13 from Task 1 + 6 from Task 2).

- [ ] **Step 13: Manual browser verification**

A real microphone can't be simulated in this environment, so this step verifies the wiring and rendering by injecting a hand-crafted fixture directly into `state`, rather than trying to fake `getUserMedia` audio.

Start a local server and open the app:

```bash
cd "App voz" && python3 -m http.server 8791
```

Using the `mcp__Claude_Browser__*` tools:

1. Navigate to `http://localhost:8791/index.html`.
2. Use `read_console_messages` with `onlyErrors: true` — expect no errors on load.
3. Via `javascript_tool`, inject a fixture directly into `state` and call `generateReport()`:
   ```js
   state.notes = [
     { start: 0, duration: 1, pitch: 60 },
     { start: 1, duration: 1, pitch: 62 },
     { start: 2, duration: 1, pitch: 64 }
   ];
   state.originalNotes = state.notes;
   state.beats = [0, 1, 2, 3];
   state.durationSec = 3;
   state.noteProgress = [
     { timeInTune: 0.9, timeTotal: 1, hadSignal: true, firstSignalTime: 0.05 },
     { timeInTune: 0.2, timeTotal: 1, hadSignal: true, firstSignalTime: 1.4 },
     { timeInTune: 0, timeTotal: 0, hadSignal: false, firstSignalTime: null }
   ];
   state.fullPitchHistory = [
     { time: 0.1, pitch: 60 }, { time: 0.5, pitch: 60.2 }, { time: 1.4, pitch: 62.5 }
   ];
   generateReport();
   'done';
   ```
4. Confirm the report panel is now visible: `read_page` or `javascript_tool` checking `document.getElementById('reportPanel').hidden === false`.
5. Confirm `#reportTextView`'s text contains the expected metrics (e.g. via `javascript_tool`: `document.getElementById('reportTextView').textContent` — check it mentions `66.7%` for in-tune (2/3 notes: note 0 ratio 0.9>=0.5 true, note 1 ratio 0.2<0.5 false, note 2 never sung false → actually recompute: only note 0 is in tune → 1/3 = 33.3%, adjust your expectation to match the actual fixture rather than assuming — compute it by hand from the injected fixture before asserting).
6. Confirm `#reportSvgContainer`'s `innerHTML` contains an `<svg` element with at least one `<rect` and one `<path` (since `fullPitchHistory` is non-empty in the fixture).
7. Click `#reportScrollRightBtn` and `#reportScrollLeftBtn` (via `computer` click at their coordinates, or dispatch a click via `javascript_tool`) — confirm no console errors.
8. Click `#downloadTxtBtn` and `#downloadSvgBtn` — confirm no console errors (the actual file save is handled by the browser and isn't independently verifiable in this environment; absence of a thrown error is the right signal here).
9. Click `#closeReportBtn` — confirm `document.getElementById('reportPanel').hidden === true`.
10. Click `#viewReportBtn` — confirm the panel reopens (`hidden === false`) showing the same report.
11. Call `play()` via `javascript_tool` (requires a loaded `audioBuffer` — load `tests/fixtures/sample.wav` into `#wavInput` first via the file-input-simulation technique used in prior tasks) — confirm `document.getElementById('reportPanel').hidden === true` immediately after (the panel hides when a new attempt starts).

Expected: all checks pass, no console errors at any step. Note: step 5's exact percentage must be computed by hand from the fixture in step 3, not assumed — verify your arithmetic before asserting.

- [ ] **Step 14: Commit**

```bash
git add "App voz/index.html"
git commit -m "feat(app-voz): generate and show a performance report after playback ends"
```

---

## Self-Review Notes

- **Spec coverage:** `firstSignalTime`/`fullPitchHistory` recording (Task 3 Steps 4-6) ✓; 4 summary metrics + per-note table in `.txt` (Task 1) ✓; static full-song SVG matching the live piano roll's visual language, reusing `piano-roll-geometry.js` via dependency injection (Task 2) ✓; in-app scrollable viewer with left/right buttons using smooth `scrollBy` (Task 3 Steps 7, 11) ✓; download buttons for both `.txt` and `.svg` (Task 3 Steps 9, 11) ✓; auto-generation on all 3 stop paths + manual "Ver informe" reopen (Task 3 Step 10-11) ✓; no report generated when no MIDI is loaded (Task 3 Step 9, `generateReport`'s early return) ✓; report panel hides (but `state.lastReport` persists) when a new `play()` starts (Task 3 Step 10) ✓.
- **Placeholder scan:** none found — every step has literal code or an exact command. Step 13.5's expected percentage is deliberately left as "compute by hand" rather than a wrong pre-computed number, since it depends on the exact fixture values in Step 13.3 and getting it wrong in the plan would be worse than asking the implementer to verify arithmetic.
- **Type consistency:** `computeReportStats(notes, noteProgress, beats)` and `formatReportText(stats, durationSec, midiToNoteName)` signatures match between Task 1's implementation and Task 3's call sites. `buildReportSvg(notes, noteProgress, fullPitchHistory, options, geometryFns)` matches between Task 2's implementation and Task 3's call site (`options` object has the same 5 keys; `geometryFns` object has the same 5 keys). `noteProgress[i].firstSignalTime` is produced by Task 3 Step 5 and consumed by Task 1's `startedOnTime` — both use `null` (not `undefined`) as the "never sung" sentinel, and `startedOnTime` explicitly checks both for defensiveness.
