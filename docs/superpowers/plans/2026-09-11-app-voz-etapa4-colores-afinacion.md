# App voz — Etapa 4: Colores por nota según afinación — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** While a MIDI note is playing, color it live according to how in-tune the singer is (green/red/gray), and once it finishes, freeze it as a bicolor bar showing what fraction of its duration was sung in tune. Play a short success sound the moment the singer locks onto pitch. No "disintegration" of missed notes, no auto-stop-on-repeated-misses, no mute/metronome — those are later stages (Etapa 5: mute WAV + metronome; Etapa 6: disintegration + auto-stop), explicitly out of scope here.

**Architecture:** One new pure, DOM-free file (`note-tuning.js`) holds the tuning state-machine math — how far off-pitch a sung frequency is from a target MIDI note, whether that counts as "in tune", what lifecycle stage a note is in relative to playback time, and how to accumulate/summarize in-tune time — unit-tested with Node, same dual-export pattern as the app's other pure modules. Everything else (calling this math each frame, drawing the four note colors, playing the success sound) is added to `index.html`'s existing `mainLoop`/`renderPianoRoll`/`updateNoteProgress`. `note-tuning.js` deliberately duplicates the one-line `69 + 12*log2(f/440)` formula that `note-utils.js` also has, rather than requiring one pure module from another — every pure module in this app is self-contained and loadable independently via its own `<script src>`, and this keeps that property rather than introducing the first inter-module dependency for one line of math (same precedent as Etapa 1's deliberately duplicated `SAMPLE_MIDI_BYTES`).

**Tech Stack:** Vanilla JS, Web Audio API, Canvas 2D. No npm, no build, no external libraries — same as prior etapas.

## Global Constraints

- No external libraries, no npm packages, no build step. The app remains `index.html` + `midi-parser.js` + `piano-roll-geometry.js` + `audio-level.js` + `pitch-detection.js` + `note-utils.js` + `note-tuning.js` (new this stage) — still zero-build, still opens with a double-click.
- Automated tests exist only for pure, DOM-free logic (`note-tuning.js`), run with Node's built-in `node --test` / `node:assert/strict` (no npm install). Run as `node --test tests/*.test.js` from `App voz/`.
- Tolerance for "in tune" is **±50 cents** (a quarter-tone) from the target note's exact frequency — this exact value, not a different one, per the design spec.
- Live note color while a note is `active` has **three** states: `'in-tune'` (green), `'out-of-tune'` (red, a pitch was detected but it's outside tolerance), `'no-signal'` (gray, nothing clear was detected — silence, too quiet, or below the mic's level gate). This is a deliberate 3-way split, not the 2-way red/green originally sketched in the design spec — confirmed with the user during design.
- The **final bicolor bar** (once a note's status becomes `past`) only has **two** categories: green = fraction of the note's duration that was in-tune, red = everything else (both `out-of-tune` and `no-signal` time count toward the red portion). This matches the original two-category design for the frozen summary — the 3-way live distinction is only for the *active* state, not the final one.
- The success sound fires on the transition **into** `'in-tune'` from either `'out-of-tune'` or `'no-signal'` for the currently active note (not just from red specifically) — and can fire more than once within the same note if the singer drifts out and back in (dynamic, matches the original design spec's requirement).
- At most one note is ever treated as "the active note" at a time (this app's MIDI files are monophonic vocal melodies; if `state.notes` ever had overlapping notes, the last one found each frame wins — a pre-existing, accepted limitation of this codebase, not something this task needs to solve).
- Tuning progress (`state.noteProgress`) resets to fresh zeros both when a new MIDI file is loaded AND every time "Reproducir" is clicked (so replaying a song is always a clean attempt).
- Continue on the existing branch/worktree from prior etapas (`worktree-app-voz-etapa1`) — don't create a new worktree for this plan.

---

### Task 1: Tuning state-machine math (`note-tuning.js`)

**Files:**
- Create: `App voz/note-tuning.js`
- Create: `App voz/tests/note-tuning.test.js`

**Interfaces:**
- Produces:
  - `centsOffTarget(frequency: number, targetMidi: number) -> number` — how many cents sharp (positive) or flat (negative) `frequency` is from `targetMidi`'s exact equal-tempered frequency.
  - `isInTune(cents: number, tolerance = 50) -> boolean` — `Math.abs(cents) <= tolerance`.
  - `noteStatus(note: {start, duration}, currentTime: number) -> 'upcoming' | 'active' | 'past'` — `currentTime < note.start` → `'upcoming'`; `currentTime <= note.start + note.duration` → `'active'` (inclusive of both endpoints); otherwise `'past'`.
  - `accumulateTuning(progress: {timeInTune, timeTotal}, isInTuneNow: boolean, deltaSeconds: number) -> {timeInTune, timeTotal}` — a pure reducer: returns a new object with `deltaSeconds` added to `timeTotal`, and also to `timeInTune` if `isInTuneNow` is true.
  - `tuningRatio(progress: {timeInTune, timeTotal}) -> number` — `timeInTune / timeTotal`, or `0` if `timeTotal` is `0` (no division by zero).
  - `liveNoteColor(detectedFrequency: number | null, targetMidi: number, tolerance = 50) -> 'in-tune' | 'out-of-tune' | 'no-signal'` — `'no-signal'` if `detectedFrequency` is `null`, otherwise `'in-tune'` or `'out-of-tune'` per `isInTune(centsOffTarget(detectedFrequency, targetMidi), tolerance)`.
  - All six available as `module.exports.*` in Node and as globals when loaded via `<script src>` in the browser (dual-export pattern, no `require`/`import` inside the file — matches every other pure module in this codebase).

- [ ] **Step 1: Write the failing test**

Create `App voz/tests/note-tuning.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { centsOffTarget, isInTune, noteStatus, accumulateTuning, tuningRatio, liveNoteColor } = require('../note-tuning.js');

test('centsOffTarget is 0 for an exact match, positive when sharp, negative when flat', () => {
  assert.ok(Math.abs(centsOffTarget(440, 69)) < 1e-6);
  assert.ok(centsOffTarget(450, 69) > 0);
  assert.ok(centsOffTarget(430, 69) < 0);
});

test('isInTune respects the +/-50 cent boundary inclusively', () => {
  assert.equal(isInTune(0), true);
  assert.equal(isInTune(50), true);
  assert.equal(isInTune(50.1), false);
  assert.equal(isInTune(-50), true);
  assert.equal(isInTune(-50.1), false);
});

test('noteStatus classifies before/during/after a note, inclusive of both endpoints', () => {
  const note = { start: 1, duration: 0.5 };
  assert.equal(noteStatus(note, 0.5), 'upcoming');
  assert.equal(noteStatus(note, 1), 'active');
  assert.equal(noteStatus(note, 1.25), 'active');
  assert.equal(noteStatus(note, 1.5), 'active');
  assert.equal(noteStatus(note, 1.500001), 'past');
});

test('accumulateTuning adds deltaSeconds to timeTotal always, and to timeInTune only when in tune', () => {
  let p = { timeInTune: 0, timeTotal: 0 };
  p = accumulateTuning(p, true, 0.1);
  assert.ok(Math.abs(p.timeInTune - 0.1) < 1e-9);
  assert.ok(Math.abs(p.timeTotal - 0.1) < 1e-9);
  p = accumulateTuning(p, false, 0.05);
  assert.ok(Math.abs(p.timeInTune - 0.1) < 1e-9);
  assert.ok(Math.abs(p.timeTotal - 0.15) < 1e-9);
});

test('tuningRatio divides safely, returning 0 for a note with no elapsed time', () => {
  assert.equal(tuningRatio({ timeInTune: 0, timeTotal: 0 }), 0);
  assert.ok(Math.abs(tuningRatio({ timeInTune: 0.8, timeTotal: 1.0 }) - 0.8) < 1e-9);
});

test('liveNoteColor returns no-signal for null, in-tune/out-of-tune otherwise', () => {
  assert.equal(liveNoteColor(null, 69), 'no-signal');
  assert.equal(liveNoteColor(440, 69), 'in-tune');
  assert.equal(liveNoteColor(400, 69), 'out-of-tune');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "App voz" && node --test tests/note-tuning.test.js`
Expected: FAIL — `Cannot find module '../note-tuning.js'` (the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `App voz/note-tuning.js`:

```js
function centsOffTarget(frequency, targetMidi) {
  const exactMidi = 69 + 12 * Math.log2(frequency / 440);
  return (exactMidi - targetMidi) * 100;
}

function isInTune(cents, tolerance = 50) {
  return Math.abs(cents) <= tolerance;
}

function noteStatus(note, currentTime) {
  if (currentTime < note.start) return 'upcoming';
  if (currentTime <= note.start + note.duration) return 'active';
  return 'past';
}

function accumulateTuning(progress, isInTuneNow, deltaSeconds) {
  return {
    timeInTune: progress.timeInTune + (isInTuneNow ? deltaSeconds : 0),
    timeTotal: progress.timeTotal + deltaSeconds
  };
}

function tuningRatio(progress) {
  if (progress.timeTotal <= 0) return 0;
  return progress.timeInTune / progress.timeTotal;
}

function liveNoteColor(detectedFrequency, targetMidi, tolerance = 50) {
  if (detectedFrequency === null) return 'no-signal';
  return isInTune(centsOffTarget(detectedFrequency, targetMidi), tolerance) ? 'in-tune' : 'out-of-tune';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { centsOffTarget, isInTune, noteStatus, accumulateTuning, tuningRatio, liveNoteColor };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "App voz" && node --test tests/note-tuning.test.js`
Expected: PASS — 6 tests, 0 failures. (Hand-verified during planning: `centsOffTarget(450,69) ≈ 38.9`, `centsOffTarget(430,69) ≈ -39.8`, all `noteStatus`/`accumulateTuning`/`tuningRatio`/`liveNoteColor` cases exactly as asserted above.)

- [ ] **Step 5: Commit**

```bash
git add "App voz/note-tuning.js" "App voz/tests/note-tuning.test.js"
git commit -m "feat(app-voz): add tuning state-machine math with unit tests"
```

---

### Task 2: Track per-note tuning progress (`index.html`)

**Files:**
- Modify: `App voz/index.html`

**Interfaces:**
- Consumes: `noteStatus`, `accumulateTuning`, `liveNoteColor` (globals, from Task 1's `note-tuning.js`, loaded via `<script src>`).
- Produces: extends the global `state` object with these new fields:
  ```js
  state.noteProgress = [];       // Array<{timeInTune: number, timeTotal: number}>, one per state.notes entry
  state.lastFrameTime = null;    // number | null — audioContext.currentTime as of the previous mainLoop tick
  state.activeNoteIndex = null;  // number | null — index into state.notes of the currently active note, this frame
  state.activeNoteColor = null;  // 'in-tune' | 'out-of-tune' | 'no-signal' | null — this frame's color for that note
  state.lastActiveNoteIndex = null; // same shape as activeNoteIndex, but the PREVIOUS frame's value
  state.lastActiveNoteColor = null; // same shape as activeNoteColor, but the PREVIOUS frame's value
  state.frozenTime = null;       // number | null — see below
  ```
  Also produces `updateNoteProgress(currentTime: number, detectedFrequency: number | null, deltaSeconds: number): void`, called once per `mainLoop` tick, and `resetNoteProgress(): void`, which Task 3 will not need to touch. Task 3 will further modify `updateNoteProgress` to add a sound-effect trigger — do not treat this task's version as final/locked, just correct for what it needs to do right now (accumulate progress, track which note is active and its color).

- [ ] **Step 1: Add the new `state` fields**

In `App voz/index.html`, change the `state` object literal from:

```js
    const state = {
      audioContext: new (window.AudioContext || window.webkitAudioContext)(),
      audioBuffer: null,
      notes: [],
      durationSec: 0,
      sourceNode: null,
      playStartTime: 0,
      voces: []
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
      frozenTime: null
    };
```

- [ ] **Step 2: Load `note-tuning.js`**

Change:

```html
  <script src="./note-utils.js"></script>
```

to:

```html
  <script src="./note-utils.js"></script>
  <script src="./note-tuning.js"></script>
```

- [ ] **Step 3: Add `resetNoteProgress()`**

Right after `createVoz()`'s closing brace and before `function currentPlaybackTime() {`, add:

```js
    function resetNoteProgress() {
      state.noteProgress = state.notes.map(() => ({ timeInTune: 0, timeTotal: 0 }));
      state.activeNoteIndex = null;
      state.activeNoteColor = null;
      state.lastActiveNoteIndex = null;
      state.lastActiveNoteColor = null;
    }
```

- [ ] **Step 4: Fix `currentPlaybackTime()` so the last note(s) don't visually snap back to "upcoming" the instant playback ends**

Without this fix, `currentPlaybackTime()` returns exactly `0` the moment `state.sourceNode` becomes `null` (natural end of the WAV) — which means every note whose `start > 0` instantly re-classifies as `'upcoming'` (blue) for one or more frames right as the song finishes, even though it was correctly showing its tuned/untuned bicolor result a moment before. `state.frozenTime` fixes this: it's captured once, synchronously, at the exact moment playback naturally ends, and `currentPlaybackTime()` reports that instead of snapping to `0`.

Change:

```js
    function currentPlaybackTime() {
      if (!state.sourceNode) return 0;
      return state.audioContext.currentTime - state.playStartTime;
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
```

- [ ] **Step 5: Reset tuning progress whenever a MIDI file loads (success and error paths)**

In the `midiInput` `change` handler, change:

```js
      try {
        const buffer = await file.arrayBuffer();
        const { notes, durationSec } = parseMidi(buffer);
        state.notes = notes;
        state.durationSec = durationSec;
        document.getElementById('midiStatus').textContent =
          `MIDI cargado: ${notes.length} notas, duración ${durationSec.toFixed(2)}s`;
        renderPianoRoll();
      } catch (err) {
        state.notes = [];
        state.durationSec = 0;
        document.getElementById('midiStatus').textContent =
          `Error al cargar el MIDI: ${err.message || 'Archivo MIDI inválido'}`;
        renderPianoRoll();
      }
```

to:

```js
      try {
        const buffer = await file.arrayBuffer();
        const { notes, durationSec } = parseMidi(buffer);
        state.notes = notes;
        state.durationSec = durationSec;
        resetNoteProgress();
        document.getElementById('midiStatus').textContent =
          `MIDI cargado: ${notes.length} notas, duración ${durationSec.toFixed(2)}s`;
        renderPianoRoll();
      } catch (err) {
        state.notes = [];
        state.durationSec = 0;
        resetNoteProgress();
        document.getElementById('midiStatus').textContent =
          `Error al cargar el MIDI: ${err.message || 'Archivo MIDI inválido'}`;
        renderPianoRoll();
      }
```

- [ ] **Step 6: Reset tuning progress on every "Reproducir" click, and capture `frozenTime` on natural end**

Change `play()` from:

```js
    async function play() {
      if (!state.audioBuffer) return;
      if (state.audioContext.state === 'suspended') {
        await state.audioContext.resume();
      }
      if (state.sourceNode) {
        state.sourceNode.onended = null;
        state.sourceNode.stop();
      }
      const node = state.audioContext.createBufferSource();
      node.buffer = state.audioBuffer;
      node.connect(state.audioContext.destination);
      state.sourceNode = node;
      state.playStartTime = state.audioContext.currentTime;
      node.start();
      node.onended = () => {
        if (state.sourceNode === node) state.sourceNode = null;
      };
    }
```

to:

```js
    async function play() {
      if (!state.audioBuffer) return;
      if (state.audioContext.state === 'suspended') {
        await state.audioContext.resume();
      }
      if (state.sourceNode) {
        state.sourceNode.onended = null;
        state.sourceNode.stop();
      }
      state.frozenTime = null;
      resetNoteProgress();
      const node = state.audioContext.createBufferSource();
      node.buffer = state.audioBuffer;
      node.connect(state.audioContext.destination);
      state.sourceNode = node;
      state.playStartTime = state.audioContext.currentTime;
      node.start();
      node.onended = () => {
        if (state.sourceNode === node) {
          state.frozenTime = state.audioContext.currentTime - state.playStartTime;
          state.sourceNode = null;
        }
      };
    }
```

- [ ] **Step 7: Add `updateNoteProgress()` and call it from `mainLoop`**

Right after `updatePitchDisplay()`'s closing brace and before `function mainLoop() {`, add:

```js
    function updateNoteProgress(currentTime, detectedFrequency, deltaSeconds) {
      let activeIndex = null;
      let activeColor = null;

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

      state.lastActiveNoteIndex = state.activeNoteIndex;
      state.lastActiveNoteColor = state.activeNoteColor;
      state.activeNoteIndex = activeIndex;
      state.activeNoteColor = activeColor;
    }
```

Note the `if (state.sourceNode)` guard: tuning progress only accumulates while the WAV is actually playing. Without it, a note starting at exactly `note.start === 0` would appear permanently `'active'` (because `currentPlaybackTime()` also reports `0` whenever nothing is playing) and would accumulate progress forever, even while paused.

Then change `mainLoop()` from:

```js
    function mainLoop() {
      renderPianoRoll();
      if (state.voces[0]) {
        const { peak } = state.voces[0].getLevel();
        updateLevelMeter(peak);
        updatePitchDisplay(peak > 0.02 ? state.voces[0].getPitch() : null);
      }
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
      let detectedFrequency = null;
      if (state.voces[0]) {
        const { peak } = state.voces[0].getLevel();
        updateLevelMeter(peak);
        detectedFrequency = peak > 0.02 ? state.voces[0].getPitch() : null;
        updatePitchDisplay(detectedFrequency);
      }

      updateNoteProgress(currentTime, detectedFrequency, deltaSeconds);
      renderPianoRoll();

      requestAnimationFrame(mainLoop);
    }
```

(`renderPianoRoll()` still takes no arguments and still computes its own `currentTime` internally via `currentPlaybackTime()` — Task 3 will make it also read `state.activeNoteIndex`/`state.activeNoteColor`/`state.noteProgress`, all of which are now kept current by `updateNoteProgress()` before every render.)

- [ ] **Step 8: Manual verification — accumulation, not rendering (Task 3 covers the visuals)**

There is no automated test for this step — it's state bookkeeping driven by real playback timing, verified by inspecting `state` directly in a real browser, the same synthetic-mic-substitution technique used in prior etapas (`getUserMedia`'s permission dialog can't be scripted by any tooling).

1. Start a local static server in `App voz/` (`python3 -m http.server <port>`), open `index.html` (or via browser automation — try `ToolSearch` for "browser navigate").
2. Load `tests/fixtures/sample.mid` (two notes: MIDI 60/C4 at 0–0.5s, MIDI 62/D4 at 0.5–1.0s) and `tests/fixtures/sample.wav`.
3. Create a synthetic oscillator-fed `MediaStream` (same technique as prior etapas) and push it into `state.voces` — start it at a frequency clearly OFF pitch, e.g. 300Hz.
4. Click "Reproducir". Around t≈0.1s into playback (during note 0, C4), set `osc.frequency.value = 261.63` (exactly C4 — in tune). Confirm shortly after that `state.noteProgress[0].timeInTune` is greater than `0` and less than `state.noteProgress[0].timeTotal`, and that `state.activeNoteIndex === 0` with `state.activeNoteColor === 'in-tune'`.
5. Let playback continue past 1.0s (both notes finish). Confirm `state.noteProgress[0].timeTotal` is close to `0.5` (the note's duration) and no longer changes (the note is `past`, `updateNoteProgress` no longer touches it).
6. Click "Reproducir" again. Confirm `state.noteProgress` was reset back to `[{timeInTune:0,timeTotal:0}, {timeInTune:0,timeTotal:0}]` immediately (before the new playback even advances).
7. Let this second playthrough run to completion (`onended` fires). Confirm `state.sourceNode === null` afterward AND `currentPlaybackTime()` now returns a value close to `1.0` (the song's duration) rather than `0` — this is the `frozenTime` fix from Step 4; confirm it stays at that frozen value on a second call a moment later (not still counting up, not reset to 0).
8. Confirm no console errors throughout. Stop the server and close any tabs you opened.

- [ ] **Step 9: Commit**

```bash
git add "App voz/index.html"
git commit -m "feat(app-voz): track per-note tuning progress during playback"
```

---

### Task 3: Draw the four note colors and play the success sound

**Files:**
- Modify: `App voz/index.html`

**Interfaces:**
- Consumes: `tuningRatio` (global, from Task 1's `note-tuning.js`); `state.activeNoteIndex`, `state.activeNoteColor`, `state.lastActiveNoteIndex`, `state.lastActiveNoteColor`, `state.noteProgress` (all kept current by Task 2's `updateNoteProgress`, called every frame before `renderPianoRoll` runs).
- Produces: nothing consumed by a later task in this plan — this is the Etapa 4 deliverable. (Etapa 6, not part of this plan, will read `state.noteProgress` again to decide when a note counts as "missed".)

- [ ] **Step 1: Replace the single note color with the four-color palette**

Change:

```js
    const NOTE_COLOR = '#4a90d9'; // blue — Etapa 1 has no pitch detection yet, every note is blue
```

to:

```js
    const COLOR_UPCOMING = '#4a90d9';
    const COLOR_IN_TUNE = '#3ecf6e';
    const COLOR_OUT_OF_TUNE = '#e05a4e';
    const COLOR_NO_SIGNAL = '#6b7280';
```

- [ ] **Step 2: Rewrite `renderPianoRoll()` to draw notes by status**

Change:

```js
    function renderPianoRoll() {
      const canvas = document.getElementById('pianoRoll');
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const { minPitch, maxPitch } = pitchRange(state.notes);
      const view = {
        currentTime: currentPlaybackTime(),
        pixelsPerSecond: PIXELS_PER_SECOND,
        playheadX: PLAYHEAD_X,
        minPitch, maxPitch,
        canvasHeight: canvas.height,
        rowHeight: ROW_HEIGHT
      };

      ctx.fillStyle = NOTE_COLOR;
      for (const note of state.notes) {
        const rect = computeNoteRect(note, view);
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      }

      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(PLAYHEAD_X, 0);
      ctx.lineTo(PLAYHEAD_X, canvas.height);
      ctx.stroke();
    }
```

to:

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

      state.notes.forEach((note, i) => {
        const rect = computeNoteRect(note, view);
        const status = noteStatus(note, currentTime);

        if (status === 'upcoming') {
          ctx.fillStyle = COLOR_UPCOMING;
          ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
        } else if (status === 'active') {
          const color = i === state.activeNoteIndex ? state.activeNoteColor : 'no-signal';
          ctx.fillStyle =
            color === 'in-tune' ? COLOR_IN_TUNE :
            color === 'out-of-tune' ? COLOR_OUT_OF_TUNE :
            COLOR_NO_SIGNAL;
          ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
        } else {
          const ratio = tuningRatio(state.noteProgress[i]);
          const greenWidth = rect.width * ratio;
          ctx.fillStyle = COLOR_IN_TUNE;
          ctx.fillRect(rect.x, rect.y, greenWidth, rect.height);
          ctx.fillStyle = COLOR_OUT_OF_TUNE;
          ctx.fillRect(rect.x + greenWidth, rect.y, rect.width - greenWidth, rect.height);
        }
      });

      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(PLAYHEAD_X, 0);
      ctx.lineTo(PLAYHEAD_X, canvas.height);
      ctx.stroke();
    }
```

- [ ] **Step 3: Add `playSuccessBlip()`**

Right after `renderPianoRoll()`'s closing brace and before `renderPianoRoll();`, add:

```js
    function playSuccessBlip(audioContext) {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.3, audioContext.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(audioContext.destination);
      osc.start();
      osc.stop(audioContext.currentTime + 0.16);
    }
```

- [ ] **Step 4: Trigger the blip from `updateNoteProgress()` on the transition into `'in-tune'`**

In `updateNoteProgress()` (from Task 2), add a check at the very end, right before the function's closing brace:

```js
    function updateNoteProgress(currentTime, detectedFrequency, deltaSeconds) {
      let activeIndex = null;
      let activeColor = null;

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

      state.lastActiveNoteIndex = state.activeNoteIndex;
      state.lastActiveNoteColor = state.activeNoteColor;
      state.activeNoteIndex = activeIndex;
      state.activeNoteColor = activeColor;

      if (
        activeIndex !== null &&
        activeIndex === state.lastActiveNoteIndex &&
        state.lastActiveNoteColor !== 'in-tune' &&
        activeColor === 'in-tune'
      ) {
        playSuccessBlip(state.audioContext);
      }
    }
```

(Only the final `if` block is new — the rest of the function is unchanged from Task 2. The check fires exactly when: there IS an active note this frame, it's the SAME note index as last frame, last frame it was NOT `'in-tune'`, and this frame it IS — i.e. a genuine transition into tune, whether it came from red or from gray, and it can fire again later in the same note if the singer drifts out and back in.)

- [ ] **Step 5: Manual verification — colors and the success sound**

Same constraint as before: no automated test for Canvas/audio behavior; verify with a real browser and the synthetic-mic-substitution technique.

1. Start a local static server in `App voz/`, open `index.html`, load `tests/fixtures/sample.mid` + `tests/fixtures/sample.wav`.
2. Set up a synthetic oscillator-fed mic (as in Task 2's verification) and, before pressing play, spy on the success sound so you can count calls without needing to actually hear it:
   ```js
   let blipCount = 0;
   const originalBlip = window.playSuccessBlip;
   window.playSuccessBlip = (...args) => { blipCount++; return originalBlip(...args); };
   ```
3. Click "Reproducir". During note 0 (C4, MIDI 60, exact frequency 261.6255653Hz, active 0–0.5s): start the oscillator off-pitch (e.g. 300Hz — confirm the note renders `COLOR_OUT_OF_TUNE` by sampling a pixel in its rectangle via `ctx.getImageData`), then partway through switch `osc.frequency.value = 261.6255653` (confirm it renders `COLOR_IN_TUNE`, and `blipCount` increased by exactly 1). Then switch back off-pitch and back in-tune again before the note ends — confirm `blipCount` increased by 1 again (the dynamic re-trigger).
4. Let note 0 finish (cross into `past` status, around t>0.5s). Sample pixels across its rectangle's width: confirm the left portion (roughly matching the fraction of time it was in tune during step 3) is `COLOR_IN_TUNE` and the right portion is `COLOR_OUT_OF_TUNE` — a genuine bicolor split, not a solid color.
5. Stop the oscillator entirely (or disconnect it) partway through note 1 (D4, 0.5–1.0s) so no pitch is detected. Confirm the note renders `COLOR_NO_SIGNAL` (gray) while active with nothing detected, not red.
6. Confirm the piano roll still shows `COLOR_UPCOMING` (blue) for a note whose `noteStatus` is `'upcoming'` at the moment you check (e.g. reload fresh and inspect before pressing play).
7. Confirm no console errors throughout. Stop the server and close any tabs you opened.

- [ ] **Step 6: Commit**

```bash
git add "App voz/index.html"
git commit -m "feat(app-voz): draw live tuning colors, bicolor summary, and success sound"
```
