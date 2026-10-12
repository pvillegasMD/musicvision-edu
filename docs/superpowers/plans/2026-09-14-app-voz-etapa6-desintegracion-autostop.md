# App voz — Etapa 6: Desintegración de notas no cantadas + parada automática — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** With a microphone active, a note where the user never sang anything (total silence for its whole duration, not just out-of-tune) visually desintegrates instead of showing as a solid red bar, and playback stops automatically after 8 consecutive MIDI beats pass with no clear voice signal at all. Without a microphone active, the piano roll stops misleadingly painting notes gray (today's bug — `liveNoteColor(null, ...)` always resolves to `'no-signal'` when nothing can ever be detected) and instead shows a plain blue roll plus a new pitch guide line tracing the target melody.

**Architecture:** Three small pure functions get added to the existing pure-logic files (`note-tuning.js`, `piano-roll-geometry.js`) and one new pure file (`silence-guard.js`, same dual-export pattern as the rest) — all covered by Node tests before any DOM code touches them. `index.html` then wires them in: `state.noteProgress[i]` gains a `hadSignal` flag (set the first time a note is active with a non-null detected pitch), a new `hasMic()` helper gates the entire judged-color/desintegration/auto-stop system behind "is there actually a Voz to listen to", and `state.beats` (already computed every MIDI load since Etapa 5, independent of the audible metronome checkbox) becomes the timeline auto-stop counts against — not notes, so a long note doesn't count the same as several short ones.

**Tech Stack:** Vanilla JS, Web Audio API, Canvas 2D (`ctx.globalAlpha` for the fade, scaled `fillRect` for the shrink). No npm, no build, no external libraries — same as prior etapas.

## Global Constraints

- No external libraries, no npm packages, no build step. The app remains `index.html` + `midi-parser.js` + `piano-roll-geometry.js` + `audio-level.js` + `pitch-detection.js` + `note-utils.js` + `note-tuning.js` + a new `silence-guard.js` — still zero-build, still opens with a double-click (or via a local static server for browser-tool verification, same as every prior etapa).
- Automated tests exist only for pure, DOM-free logic (`node --test tests/*.test.js` from `App voz/`). Everything that touches `state`, the canvas, or Web Audio is verified manually in a real browser, same established pattern as Etapas 1-5 (local static server + browser automation tools, `state` and top-level functions/consts are reachable directly since `index.html`'s `<script>` block is a classic, non-module script).
- **"Nota no cantada" = silencio total.** A note counts as "not sung" only if `hadSignal` is `false` — meaning a clear voice signal (same level-gate + YIN pitch as the existing live coloring, `peak > 0.02` then a non-null `detectPitch` result) was **never** present while that note was `'active'`. Singing something out of tune the whole time is a different, already-handled case (100% red bicolor bar) — it must **not** trigger desintegration.
- **`hasMic()` gates two independent things in opposite directions:** when `state.voces.length > 0`, the Etapa 4 judged-color system runs, plus this etapa's desintegration and auto-stop. When `state.voces.length === 0`, none of that runs — notes stay blue regardless of `noteStatus`, and a new pitch guide line is drawn instead. This also fixes a real pre-existing bug: today, playing a song with no mic ever activated paints every note gray (`liveNoteColor(null, ...)` → `'no-signal'`) as if the user were failing, because `renderPianoRoll` only ever gated on `isLive` (`state.sourceNode !== null`), never on whether a mic exists at all.
- **Auto-stop counts MIDI beats (`state.beats`), not notes.** If 8 consecutive beats pass with no clear signal at any point since the last one was heard, playback stops itself — same mechanism as the WAV finishing naturally (`state.frozenTime` freezes the piano roll), plus a status message near "Reproducir". Only runs when `hasMic()` is true; a silent solo-listening playthrough with no mic must never auto-stop.
- **Desintegration timing is tied to scroll, not an independent timer.** The piano roll scrolls at a fixed `PIXELS_PER_SECOND` past a playhead at a fixed `PLAYHEAD_X`, so the time it takes anything to scroll from the playhead to the left edge of the canvas is always the same constant (`PLAYHEAD_X / PIXELS_PER_SECOND`). The animation starts only once a note has fully finished crossing the playhead (`noteStatus === 'past'`), fading opacity from 1.0 to 0.15 and scaling from 1.0 to 0.6 (centered, not from a corner) over that fixed window.
- Continue on the existing branch/worktree from prior etapas (`worktree-app-voz-etapa1`) — don't create a new worktree for this plan.
- This stage does not change `centsOffTarget`, `isInTune`, `accumulateTuning`, `tuningRatio`, `liveNoteColor`, or any existing test for them — only additive changes to `note-tuning.js` and `piano-roll-geometry.js`.

---

### Task 1: `noteWasSung` predicate (`note-tuning.js`)

**Files:**
- Modify: `App voz/note-tuning.js`
- Modify: `App voz/tests/note-tuning.test.js`

**Interfaces:**
- Produces: `noteWasSung(progress) -> boolean` — `true` only if `progress.hadSignal === true`. `progress` is the same per-note object shape already in `state.noteProgress` (`{timeInTune, timeTotal}`), which Task 4 will extend with a `hadSignal` field; this function doesn't care about the other fields.

- [ ] **Step 1: Write the failing test**

In `App voz/tests/note-tuning.test.js`, change the require line from:

```js
const { centsOffTarget, isInTune, noteStatus, accumulateTuning, tuningRatio, liveNoteColor } = require('../note-tuning.js');
```

to:

```js
const { centsOffTarget, isInTune, noteStatus, accumulateTuning, tuningRatio, liveNoteColor, noteWasSung } = require('../note-tuning.js');
```

Then add this test at the end of the file, after the existing `liveNoteColor` test:

```js

test('noteWasSung reflects the hadSignal flag on a note progress entry', () => {
  assert.equal(noteWasSung({ timeInTune: 0, timeTotal: 0, hadSignal: false }), false);
  assert.equal(noteWasSung({ timeInTune: 0, timeTotal: 0, hadSignal: true }), true);
  assert.equal(noteWasSung({ timeInTune: 0, timeTotal: 0 }), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "App voz" && node --test tests/note-tuning.test.js`
Expected: FAIL — `noteWasSung` is `undefined`, calling it throws a `TypeError`.

- [ ] **Step 3: Write the implementation**

In `App voz/note-tuning.js`, change:

```js
function liveNoteColor(detectedFrequency, targetMidi, tolerance = 50) {
  if (detectedFrequency === null) return 'no-signal';
  return isInTune(centsOffTarget(detectedFrequency, targetMidi), tolerance) ? 'in-tune' : 'out-of-tune';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { centsOffTarget, isInTune, noteStatus, accumulateTuning, tuningRatio, liveNoteColor };
}
```

to:

```js
function liveNoteColor(detectedFrequency, targetMidi, tolerance = 50) {
  if (detectedFrequency === null) return 'no-signal';
  return isInTune(centsOffTarget(detectedFrequency, targetMidi), tolerance) ? 'in-tune' : 'out-of-tune';
}

function noteWasSung(progress) {
  return progress.hadSignal === true;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { centsOffTarget, isInTune, noteStatus, accumulateTuning, tuningRatio, liveNoteColor, noteWasSung };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "App voz" && node --test tests/note-tuning.test.js`
Expected: PASS — 7 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add "App voz/note-tuning.js" "App voz/tests/note-tuning.test.js"
git commit -m "feat(app-voz): add noteWasSung predicate for total-silence notes"
```

---

### Task 2: `countSilentBeats` pure function (new file `silence-guard.js`)

**Files:**
- Create: `App voz/silence-guard.js`
- Create: `App voz/tests/silence-guard.test.js`
- Modify: `App voz/index.html`

**Interfaces:**
- Produces: `countSilentBeats(beats, sinceTime, uptoTime) -> number` — how many entries of `beats` (seconds) fall strictly after `sinceTime` and up to and including `uptoTime`. Same dual-export pattern (`module.exports` + implicit browser global via non-module `<script>`) as every other pure file in this app.

- [ ] **Step 1: Write the failing test**

Create `App voz/tests/silence-guard.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { countSilentBeats } = require('../silence-guard.js');

test('countSilentBeats counts beats strictly after sinceTime and up to and including uptoTime', () => {
  const beats = [0, 0.5, 1, 1.5, 2];
  assert.equal(countSilentBeats(beats, 0.5, 2), 3);
});

test('countSilentBeats excludes a beat exactly at sinceTime and includes one exactly at uptoTime', () => {
  const beats = [0, 1, 2];
  assert.equal(countSilentBeats(beats, 1, 2), 1);
});

test('countSilentBeats returns 0 when no beats fall in the range', () => {
  assert.equal(countSilentBeats([0, 0.5], 1, 2), 0);
});

test('countSilentBeats returns 0 for an empty beats array', () => {
  assert.equal(countSilentBeats([], 0, 10), 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "App voz" && node --test tests/silence-guard.test.js`
Expected: FAIL — cannot find module `../silence-guard.js`.

- [ ] **Step 3: Write the implementation**

Create `App voz/silence-guard.js`:

```js
function countSilentBeats(beats, sinceTime, uptoTime) {
  return beats.filter(t => t > sinceTime && t <= uptoTime).length;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { countSilentBeats };
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
  <script>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd "App voz" && node --test tests/silence-guard.test.js`
Expected: PASS — 4 tests, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add "App voz/silence-guard.js" "App voz/tests/silence-guard.test.js" "App voz/index.html"
git commit -m "feat(app-voz): add countSilentBeats pure function for the auto-stop guard"
```

---

### Task 3: `desintegrationProgress` pure function (`piano-roll-geometry.js`)

**Files:**
- Modify: `App voz/piano-roll-geometry.js`
- Modify: `App voz/tests/piano-roll-geometry.test.js`

**Interfaces:**
- Produces: `desintegrationProgress(currentTime, noteEndTime, scrollOutDurationSec) -> number` (0 to 1, clamped). `0` at/before `noteEndTime`, `1` once `scrollOutDurationSec` seconds have passed since `noteEndTime`, linear in between. Returns `1` immediately if `scrollOutDurationSec` is not positive (degenerate config, treat as "already gone" rather than dividing by zero or going negative).

- [ ] **Step 1: Write the failing test**

In `App voz/tests/piano-roll-geometry.test.js`, change the require line from:

```js
const { pitchRange, pitchToY, computeNoteRect } = require('../piano-roll-geometry.js');
```

to:

```js
const { pitchRange, pitchToY, computeNoteRect, desintegrationProgress } = require('../piano-roll-geometry.js');
```

Then add these tests at the end of the file:

```js

test('desintegrationProgress is 0 before and at the moment the note ends', () => {
  assert.equal(desintegrationProgress(1.5, 2, 0.8), 0);
  assert.equal(desintegrationProgress(2, 2, 0.8), 0);
});

test('desintegrationProgress increases linearly across the scroll-out window and clamps at 1 after it ends', () => {
  assert.ok(Math.abs(desintegrationProgress(2.4, 2, 0.8) - 0.5) < 1e-9);
  assert.equal(desintegrationProgress(3, 2, 0.8), 1);
});

test('desintegrationProgress returns 1 immediately when scrollOutDurationSec is not positive', () => {
  assert.equal(desintegrationProgress(2.1, 2, 0), 1);
  assert.equal(desintegrationProgress(2.1, 2, -1), 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "App voz" && node --test tests/piano-roll-geometry.test.js`
Expected: FAIL — `desintegrationProgress` is `undefined`.

- [ ] **Step 3: Write the implementation**

In `App voz/piano-roll-geometry.js`, change:

```js
function computeNoteRect(note, view) {
  const { currentTime, pixelsPerSecond, playheadX, minPitch, maxPitch, canvasHeight, rowHeight } = view;
  const x = playheadX + (note.start - currentTime) * pixelsPerSecond;
  const width = note.duration * pixelsPerSecond;
  const y = pitchToY(note.pitch, minPitch, maxPitch, canvasHeight) - rowHeight / 2;
  return { x, y, width, height: rowHeight };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { pitchRange, pitchToY, computeNoteRect };
}
```

to:

```js
function computeNoteRect(note, view) {
  const { currentTime, pixelsPerSecond, playheadX, minPitch, maxPitch, canvasHeight, rowHeight } = view;
  const x = playheadX + (note.start - currentTime) * pixelsPerSecond;
  const width = note.duration * pixelsPerSecond;
  const y = pitchToY(note.pitch, minPitch, maxPitch, canvasHeight) - rowHeight / 2;
  return { x, y, width, height: rowHeight };
}

function desintegrationProgress(currentTime, noteEndTime, scrollOutDurationSec) {
  if (scrollOutDurationSec <= 0) return 1;
  const elapsed = currentTime - noteEndTime;
  return Math.max(0, Math.min(1, elapsed / scrollOutDurationSec));
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { pitchRange, pitchToY, computeNoteRect, desintegrationProgress };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "App voz" && node --test tests/piano-roll-geometry.test.js`
Expected: PASS — 8 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add "App voz/piano-roll-geometry.js" "App voz/tests/piano-roll-geometry.test.js"
git commit -m "feat(app-voz): add desintegrationProgress pure function for the scroll-out fade"
```

---

### Task 4: Track `hadSignal` per note (`index.html`)

**Files:**
- Modify: `App voz/index.html`

**Interfaces:**
- Consumes: nothing new — reuses the existing `noteStatus`/`detectedFrequency` values already flowing through `updateNoteProgress`.
- Produces: every entry of `state.noteProgress` gains a third field, `hadSignal: boolean`, alongside the existing `timeInTune`/`timeTotal`. Set to `true` the first time that note is `'active'` in a frame with a non-null `detectedFrequency`; never reset back to `false` except by `resetNoteProgress()`.

- [ ] **Step 1: Include `hadSignal` when progress is reset**

In `App voz/index.html`, change:

```js
    function resetNoteProgress() {
      state.noteProgress = state.notes.map(() => ({ timeInTune: 0, timeTotal: 0 }));
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
    }
```

- [ ] **Step 2: Set `hadSignal` in `updateNoteProgress`**

Change:

```js
      if (state.sourceNode) {
        state.notes.forEach((note, i) => {
          if (noteStatus(note, currentTime) !== 'active') return;
          activeIndex = i;
          activeColor = liveNoteColor(detectedFrequency, note.pitch);
          if (deltaSeconds > 0) {
            const isInTuneNow = activeColor === 'in-tune';
            state.noteProgress[i] = accumulateTuning(state.noteProgress[i], isInTuneNow, deltaSeconds);
          }
        });
      }
```

to:

```js
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

(`hadSignal` is read and OR'd in *before* `accumulateTuning` replaces the object, then written back onto the new object — otherwise the freshly-returned `{timeInTune, timeTotal}` from `accumulateTuning` would silently drop it. It's set unconditionally, not gated behind `deltaSeconds > 0`, so even a zero-delta frame still records that a signal was present.)

- [ ] **Step 3: Manual verification**

No automated test — this is `state` bookkeeping driven by real playback timing, verified in a real browser per this app's established pattern.

1. Start a local static server in `App voz/` (`python3 -m http.server <port>`) and open `index.html` in the browser tool.
2. Run this in the page via `javascript_exec` (it loads the existing two-note fixture, `tests/fixtures/sample.mid`/`sample.wav` — note 0 spans 0–0.5s, note 1 spans 0.5–1.0s — and fakes a `Voz` whose detected pitch is controlled by a local `simulatedFrequency` variable instead of real audio, so signal timing is exact and repeatable):

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

simulatedFrequency = 300;
mainLoop();
await new Promise(r => setTimeout(r, 600));
simulatedFrequency = null;
mainLoop();
await new Promise(r => setTimeout(r, 600));
mainLoop();

JSON.stringify(state.noteProgress.map(p => p.hadSignal));
```

3. Confirm the result is `[true,false]` — note 0 was "sung" (there was signal during its 0–0.5s window), note 1 was not (silence during its 0.5–1.0s window).
4. Confirm no console errors throughout. Stop the server and close any tabs you opened.

- [ ] **Step 4: Commit**

```bash
git add "App voz/index.html"
git commit -m "feat(app-voz): track whether each note ever had a clear voice signal"
```

---

### Task 5: `hasMic()` gate + pitch guide line (`index.html`)

**Files:**
- Modify: `App voz/index.html`

**Interfaces:**
- Produces: `hasMic() -> boolean` (`state.voces.length > 0`). `renderPianoRoll` now draws every note plain blue with a horizontal guide line through its pitch center when `!hasMic()`, regardless of `noteStatus` — the entire judged-color branch (live colors, upcoming, bicolor past) only runs when `hasMic()` is true, unchanged from Etapa 4's behavior in that case.

- [ ] **Step 1: Add the `hasMic()` helper**

Change:

```js
    function currentPlaybackTime() {
      if (state.sourceNode) {
        return state.audioContext.currentTime - state.playStartTime;
      }
      return state.frozenTime !== null ? state.frozenTime : 0;
    }
```

to:

```js
    function currentPlaybackTime() {
      if (state.sourceNode) {
        return state.audioContext.currentTime - state.playStartTime;
      }
      return state.frozenTime !== null ? state.frozenTime : 0;
    }

    function hasMic() {
      return state.voces.length > 0;
    }
```

- [ ] **Step 2: Gate `renderPianoRoll` on `hasMic()` and add the guide line**

Change:

```js
      const isLive = state.sourceNode !== null;

      state.notes.forEach((note, i) => {
        const rect = computeNoteRect(note, view);
        const status = noteStatus(note, currentTime);

        if (status === 'active' && isLive) {
```

to:

```js
      const isLive = state.sourceNode !== null;

      state.notes.forEach((note, i) => {
        const rect = computeNoteRect(note, view);

        if (!hasMic()) {
          ctx.fillStyle = COLOR_UPCOMING;
          ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
          ctx.strokeStyle = '#ffffff';
          ctx.beginPath();
          ctx.moveTo(rect.x, rect.y + rect.height / 2);
          ctx.lineTo(rect.x + rect.width, rect.y + rect.height / 2);
          ctx.stroke();
          return;
        }

        const status = noteStatus(note, currentTime);

        if (status === 'active' && isLive) {
```

(The rest of the `forEach` body — the `active`/`upcoming`/`past` branches — is unchanged; it's simply unreachable now when there's no mic, because of the early `return` above.)

- [ ] **Step 3: Manual verification**

No automated test — Canvas rendering, verified in a real browser.

1. Start a local static server in `App voz/`, open `index.html`.
2. Run this in the page via `javascript_exec` (loads the fixture, plays it, **without** pushing any `Voz` into `state.voces` — this is the "just listening" scenario):

```js
const midiBuf = await fetch('./tests/fixtures/sample.mid').then(r => r.arrayBuffer());
const wavBuf = await fetch('./tests/fixtures/sample.wav').then(r => r.arrayBuffer());
const { notes, durationSec, beats } = parseMidi(midiBuf);
state.notes = notes;
state.durationSec = durationSec;
state.beats = beats;
resetNoteProgress();
state.audioBuffer = await state.audioContext.decodeAudioData(wavBuf);

await play();
await new Promise(r => setTimeout(r, 300));
mainLoop();

const canvas = document.getElementById('pianoRoll');
const ctx = canvas.getContext('2d');
const { minPitch, maxPitch } = pitchRange(state.notes);
const view = { currentTime: currentPlaybackTime(), pixelsPerSecond: PIXELS_PER_SECOND, playheadX: PLAYHEAD_X, minPitch, maxPitch, canvasHeight: canvas.height, rowHeight: ROW_HEIGHT };
const rect = computeNoteRect(state.notes[0], view);
const fillPixel = ctx.getImageData(Math.round(rect.x + rect.width / 2), Math.round(rect.y + 3), 1, 1).data;
const linePixel = ctx.getImageData(Math.round(rect.x + rect.width / 2), Math.round(rect.y + rect.height / 2), 1, 1).data;

JSON.stringify({ hasMicNow: hasMic(), fillPixel: [fillPixel[0], fillPixel[1], fillPixel[2]], linePixel: [linePixel[0], linePixel[1], linePixel[2]] });
```

3. Confirm `hasMicNow` is `false`.
4. Confirm `fillPixel` is close to `COLOR_UPCOMING` (`#4a90d9` → roughly `[74, 144, 217]`) — **not** gray (`#6b7280` → roughly `[107, 114, 128]`), even though 300ms into playback the playhead is inside note 0's active window and, before this task, that would have painted it gray. This is the bug-fix part of this task.
5. Confirm `linePixel` is visibly brighter/whiter than `fillPixel` in all three channels (the guide line is a 1px white stroke through the vertical center of the note — some anti-aliasing blending with the blue fill is expected and fine, it just needs to read clearly lighter than the surrounding blue).
6. Now push a real synthetic `Voz` (`state.voces.push({...})` with any dummy `getLevel`/`getPitch`) and call `renderPianoRoll()` again — confirm `hasMic()` is now `true` and the note goes back to being colored by the Etapa 4 logic (i.e. this task didn't change anything about the `hasMic()`-true path).
7. Confirm no console errors throughout. Stop the server and close any tabs you opened.

- [ ] **Step 4: Commit**

```bash
git add "App voz/index.html"
git commit -m "fix(app-voz): keep notes blue and add a pitch guide line when no mic is active"
```

---

### Task 6: Desintegration rendering for unsung notes (`index.html`)

**Files:**
- Modify: `App voz/index.html`

**Interfaces:**
- Consumes: `noteWasSung` (Task 1, `note-tuning.js`), `desintegrationProgress` (Task 3, `piano-roll-geometry.js`), `state.noteProgress[i].hadSignal` (Task 4).
- Produces: three new constants (`SCROLL_OUT_DURATION_SEC`, `DESINTEGRATION_MIN_OPACITY`, `DESINTEGRATION_MIN_SCALE`) and a new branch in `renderPianoRoll`'s past-note handling.

- [ ] **Step 1: Add the desintegration constants**

Change:

```js
    const PIXELS_PER_SECOND = 150;
    const PLAYHEAD_X = 120;
    const ROW_HEIGHT = 18;
    const COLOR_UPCOMING = '#4a90d9';
    const COLOR_IN_TUNE = '#3ecf6e';
    const COLOR_OUT_OF_TUNE = '#e05a4e';
    const COLOR_NO_SIGNAL = '#6b7280';
```

to:

```js
    const PIXELS_PER_SECOND = 150;
    const PLAYHEAD_X = 120;
    const ROW_HEIGHT = 18;
    const COLOR_UPCOMING = '#4a90d9';
    const COLOR_IN_TUNE = '#3ecf6e';
    const COLOR_OUT_OF_TUNE = '#e05a4e';
    const COLOR_NO_SIGNAL = '#6b7280';
    const SCROLL_OUT_DURATION_SEC = PLAYHEAD_X / PIXELS_PER_SECOND;
    const DESINTEGRATION_MIN_OPACITY = 0.15;
    const DESINTEGRATION_MIN_SCALE = 0.6;
```

- [ ] **Step 2: Branch the past-note rendering on `noteWasSung`**

Change:

```js
        } else {
          const ratio = tuningRatio(state.noteProgress[i]);
          const greenWidth = rect.width * ratio;
          ctx.fillStyle = COLOR_IN_TUNE;
          ctx.fillRect(rect.x, rect.y, greenWidth, rect.height);
          ctx.fillStyle = COLOR_OUT_OF_TUNE;
          ctx.fillRect(rect.x + greenWidth, rect.y, rect.width - greenWidth, rect.height);
        }
```

to:

```js
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
          ctx.restore();
        } else {
          const ratio = tuningRatio(state.noteProgress[i]);
          const greenWidth = rect.width * ratio;
          ctx.fillStyle = COLOR_IN_TUNE;
          ctx.fillRect(rect.x, rect.y, greenWidth, rect.height);
          ctx.fillStyle = COLOR_OUT_OF_TUNE;
          ctx.fillRect(rect.x + greenWidth, rect.y, rect.width - greenWidth, rect.height);
        }
```

(This branch is only reachable when `hasMic()` is true — Task 5's early `return` for `!hasMic()` already skips the whole rest of the loop body, including this.)

- [ ] **Step 3: Manual verification**

No automated test — Canvas rendering over real elapsed time, verified in a real browser.

1. Start a local static server in `App voz/`, open `index.html`.
2. Run this in the page via `javascript_exec` (loads the fixture, pushes a `Voz` that is always silent — so `hasMic()` is true but nothing is ever "sung" — and samples the desintegration progress twice, ~400ms apart, well after both notes have ended at 1.0s):

```js
const midiBuf = await fetch('./tests/fixtures/sample.mid').then(r => r.arrayBuffer());
const wavBuf = await fetch('./tests/fixtures/sample.wav').then(r => r.arrayBuffer());
const { notes, durationSec, beats } = parseMidi(midiBuf);
state.notes = notes;
state.durationSec = durationSec;
state.beats = beats;
resetNoteProgress();
state.audioBuffer = await state.audioContext.decodeAudioData(wavBuf);

state.voces.push({ getLevel: () => ({ rms: 0, peak: 0 }), getPitch: () => null });

await play();
await new Promise(r => setTimeout(r, 1050));
mainLoop();

const noteEndTime = state.notes[1].start + state.notes[1].duration;
const p1 = desintegrationProgress(currentPlaybackTime(), noteEndTime, SCROLL_OUT_DURATION_SEC);

await new Promise(r => setTimeout(r, 400));
mainLoop();
const p2 = desintegrationProgress(currentPlaybackTime(), noteEndTime, SCROLL_OUT_DURATION_SEC);

const canvas = document.getElementById('pianoRoll');
const ctx = canvas.getContext('2d');
const { minPitch, maxPitch } = pitchRange(state.notes);
const view = { currentTime: currentPlaybackTime(), pixelsPerSecond: PIXELS_PER_SECOND, playheadX: PLAYHEAD_X, minPitch, maxPitch, canvasHeight: canvas.height, rowHeight: ROW_HEIGHT };
const rect = computeNoteRect(state.notes[1], view);
const cornerPixel = ctx.getImageData(Math.round(rect.x + 1), Math.round(rect.y + 1), 1, 1).data;

JSON.stringify({ hadSignal: state.noteProgress.map(p => p.hadSignal), p1, p2, cornerPixel: [cornerPixel[0], cornerPixel[1], cornerPixel[2]] });
```

3. Confirm `hadSignal` is `[false, false]` (mic active, never any signal — both notes qualify as "not sung").
4. Confirm `p1` is strictly between 0 and 1, and `p2 > p1` (progress increases with elapsed time — around `0.06` and `0.56` respectively, given the timing above; exact values aren't critical, the trend is what matters).
5. Confirm `cornerPixel` is close to the canvas background color (`#1a1d29` → roughly `[26, 29, 41]`), not the note's fill color (`#e05a4e` → roughly `[224, 90, 78]`) — by `p2`'s progress (~0.56) the shrunk-and-centered rectangle no longer reaches a corner that close to its original edge, confirming the shrink is actually happening (not just the opacity fade).
6. Confirm no console errors throughout. Stop the server and close any tabs you opened.

- [ ] **Step 4: Commit**

```bash
git add "App voz/index.html"
git commit -m "feat(app-voz): desintegrate notes that were never sung as they scroll past"
```

---

### Task 7: Auto-stop after 8 silent beats (`index.html`)

**Files:**
- Modify: `App voz/index.html`

**Interfaces:**
- Consumes: `countSilentBeats` (Task 2, `silence-guard.js`), `hasMic()` (Task 5).
- Produces: `state.lastSignalTime` (seconds of playback time at the last frame with a clear signal, reset to `0` on every `play()`), `stopPlayback(reason)` (stops the WAV and any scheduled metronome clicks, freezes `state.frozenTime`, and writes `reason` into a new `#playbackStatus` status line), and the `SILENCE_STOP_BEATS = 8` constant.

- [ ] **Step 1: Add `lastSignalTime` to `state` and the `SILENCE_STOP_BEATS` constant**

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
      metronomeNodes: []
    };
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
      lastSignalTime: 0
    };
```

Then change:

```js
    const SCROLL_OUT_DURATION_SEC = PLAYHEAD_X / PIXELS_PER_SECOND;
    const DESINTEGRATION_MIN_OPACITY = 0.15;
    const DESINTEGRATION_MIN_SCALE = 0.6;
```

to:

```js
    const SCROLL_OUT_DURATION_SEC = PLAYHEAD_X / PIXELS_PER_SECOND;
    const DESINTEGRATION_MIN_OPACITY = 0.15;
    const DESINTEGRATION_MIN_SCALE = 0.6;
    const SILENCE_STOP_BEATS = 8;
```

- [ ] **Step 2: Add the `#playbackStatus` status line**

In the HTML, change:

```html
  <div id="status">
    <div id="midiStatus">Sin MIDI cargado.</div>
    <div id="wavStatus">Sin WAV cargado.</div>
  </div>
```

to:

```html
  <div id="status">
    <div id="midiStatus">Sin MIDI cargado.</div>
    <div id="wavStatus">Sin WAV cargado.</div>
    <div id="playbackStatus"></div>
  </div>
```

- [ ] **Step 3: Reset `lastSignalTime` and clear the status line on every `play()`**

Change:

```js
      state.metronomeNodes = [];
      state.frozenTime = null;
      resetNoteProgress();
      const node = state.audioContext.createBufferSource();
```

to:

```js
      state.metronomeNodes = [];
      state.frozenTime = null;
      resetNoteProgress();
      state.lastSignalTime = 0;
      document.getElementById('playbackStatus').textContent = '';
      const node = state.audioContext.createBufferSource();
```

- [ ] **Step 4: Add `stopPlayback(reason)`**

Change:

```js
    document.getElementById('playBtn').addEventListener('click', play);
```

to:

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
      document.getElementById('playbackStatus').textContent = reason;
    }

    document.getElementById('playBtn').addEventListener('click', play);
```

- [ ] **Step 5: Track `lastSignalTime` and check the silence guard in `mainLoop`**

Change:

```js
      if (state.voces[0]) {
        const { peak } = state.voces[0].getLevel();
        updateLevelMeter(peak);
        detectedFrequency = peak > 0.02 ? state.voces[0].getPitch() : null;
        updatePitchDisplay(detectedFrequency);
      }

      updateNoteProgress(currentTime, detectedFrequency, deltaSeconds);
```

to:

```js
      if (state.voces[0]) {
        const { peak } = state.voces[0].getLevel();
        updateLevelMeter(peak);
        detectedFrequency = peak > 0.02 ? state.voces[0].getPitch() : null;
        updatePitchDisplay(detectedFrequency);
      }

      if (detectedFrequency !== null) {
        state.lastSignalTime = currentTime;
      }

      if (hasMic() && state.sourceNode && countSilentBeats(state.beats, state.lastSignalTime, currentTime) >= SILENCE_STOP_BEATS) {
        stopPlayback('Reproducción detenida: no se detectó canto durante varios pulsos.');
      }

      updateNoteProgress(currentTime, detectedFrequency, deltaSeconds);
```

- [ ] **Step 6: Manual verification**

No automated test — Web Audio scheduling and real elapsed time, verified in a real browser.

1. Start a local static server in `App voz/`, open `index.html`.
2. Run this in the page via `javascript_exec` (loads the fixture, but overwrites `state.beats` with 8 synthetic timestamps close together — independent of the real MIDI's own 3 beats — so the threshold is exercised quickly and deterministically; pushes an always-silent `Voz`):

```js
const midiBuf = await fetch('./tests/fixtures/sample.mid').then(r => r.arrayBuffer());
const wavBuf = await fetch('./tests/fixtures/sample.wav').then(r => r.arrayBuffer());
const { notes, durationSec } = parseMidi(midiBuf);
state.notes = notes;
state.durationSec = durationSec;
state.beats = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
resetNoteProgress();
state.audioBuffer = await state.audioContext.decodeAudioData(wavBuf);

state.voces.push({ getLevel: () => ({ rms: 0, peak: 0 }), getPitch: () => null });

await play();
await new Promise(r => setTimeout(r, 900));
mainLoop();

JSON.stringify({
  sourceNodeIsNull: state.sourceNode === null,
  message: document.getElementById('playbackStatus').textContent
});
```

3. Confirm `sourceNodeIsNull` is `true` and `message` is `"Reproducción detenida: no se detectó canto durante varios pulsos."` — all 8 synthetic beats fell within `(state.lastSignalTime=0, currentTime≈0.9]`, meeting `SILENCE_STOP_BEATS`.
4. Now run this to confirm a mic that *does* produce signal never triggers the stop (same 8 close-together synthetic beats, but the `Voz` reports a non-null pitch, so `state.lastSignalTime` keeps tracking `currentTime` every time `mainLoop` runs and no beat ever ends up older than it):

```js
state.voces = [{ getLevel: () => ({ rms: 0, peak: 0.5 }), getPitch: () => 300 }];
await play();
mainLoop();
await new Promise(r => setTimeout(r, 900));
mainLoop();
JSON.stringify({ sourceNodeIsNull: state.sourceNode === null });
```

5. Confirm `sourceNodeIsNull` is `false`.
6. Finally, confirm the "no mic at all" case is unaffected — run:

```js
state.voces = [];
await play();
await new Promise(r => setTimeout(r, 900));
mainLoop();
JSON.stringify({ sourceNodeIsNull: state.sourceNode === null, message: document.getElementById('playbackStatus').textContent });
```

Confirm `sourceNodeIsNull` is `false` and `message` is `''` — with no `Voz` at all, `hasMic()` is `false`, so the silence guard never runs and playback isn't cut short at ~0.9s the way it was in step 3 (it will eventually stop on its own once the ~1s WAV finishes naturally, well after this check).
7. Confirm no console errors throughout. Stop the server and close any tabs you opened.

- [ ] **Step 7: Commit**

```bash
git add "App voz/index.html"
git commit -m "feat(app-voz): auto-stop playback after 8 consecutive silent MIDI beats"
```
