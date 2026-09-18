# App voz — Loop de práctica Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user mark a passage on the waveform and have it repeat automatically — draggable start/end markers, reusing the existing `seekTo()` mechanism for the actual wrap-around jump.

**Architecture:** A new pure file (`loop-utils.js`) holds the small stateless calculations (is the loop currently "engaged", clamping a dragged marker, hit-testing a click against the two markers). `index.html` wires this in: two new draggable markers drawn on `#waveformCanvas` alongside the existing position marker, a toggle button, and a per-frame check in `mainLoop` that calls the existing `seekTo(loopStart)` once playback reaches the marked end — inheriting note-progress reset and silence-guard safety for free, the same way a manual seek already does.

**Tech Stack:** Vanilla JS, no build step. Tests run with `node --test` against pure functions exported via `module.exports`. Manual browser verification via a local `python3 -m http.server` and the `mcp__Claude_Browser__*` tools.

## Global Constraints

- No build step, no npm, no external libraries — hand-written JS only, consistent with the rest of the repo (`CLAUDE.md`).
- Every new file exports pure functions via `module.exports` guarded by `typeof module !== 'undefined' && module.exports`.
- **Coordinate-space gotcha, read before touching any mouse-handling code:** `#waveformCanvas` has an internal resolution of 900×60 (`width`/`height` attributes) but is displayed at `width:100%; max-width:900px` via CSS — on a narrow viewport its on-screen size can be smaller than 900px. There are two DIFFERENT coordinate spaces in play, and mixing them up is the classic bug in click-to-seek canvases (already handled correctly once, for the position marker, by the existing `waveformXToTime` function): **drawing** inside the canvas (`renderWaveform`'s `ctx.moveTo`/`ctx.lineTo` calls) always uses the canvas's internal pixel space (`canvas.width` = 900, fixed); **hit-testing mouse events** (`e.clientX`) must go through `getBoundingClientRect()` (the on-screen CSS size, which can differ from 900). This plan sidesteps the whole problem for the new loop-marker hit-testing by doing it entirely in **time (seconds)**, never in pixels: a click's x-coordinate gets converted to a time via the existing `waveformXToTime` (already correct), and is then compared directly against `state.loopStart`/`state.loopEnd` (also in seconds) with a tolerance that itself gets converted from a pixel count into seconds at the moment of comparison (`(pixelTolerance / rect.width) * duration`) — never compared in raw pixels. Follow this pattern; do not introduce a second, pixel-based hit-test path.
- **Loading a new WAV must reset the loop entirely** (`loopActive = false`, `loopStart = null`, `loopEnd = null`, `loopEngaged = false`, `#loopToggleBtn` disabled) — a loop region marked in seconds against one WAV file is meaningless once a different WAV (possibly shorter) loads. This isn't explicitly called out in the design doc but is a necessary consequence of it, the same way loading a new MIDI already clears `state.pendingStartTime`.
- Design spec: `docs/superpowers/specs/2026-09-18-app-voz-loop-practica-design.md`.

---

### Task 1: `loop-utils.js` — loop state calculations

**Files:**
- Create: `App voz/loop-utils.js`
- Test: `App voz/tests/loop-utils.test.js`

**Interfaces:**
- Produces:
  - `computeLoopEngaged(active, position, loopStart, loopEnd) -> boolean` — true only when `active` is true AND `position` falls in `[loopStart, loopEnd)` (inclusive start, exclusive end).
  - `clampLoopStart(candidate, loopEnd, minGap) -> number` — clamps to `[0, loopEnd - minGap]`.
  - `clampLoopEnd(candidate, loopStart, minGap, duration) -> number` — clamps to `[loopStart + minGap, duration]`.
  - `hitTestLoopMarker(time, loopStart, loopEnd, tolerance) -> 'start' | 'end' | null` — all four arguments are in the SAME unit (seconds); returns `'start'` if `time` is within `tolerance` of `loopStart`, `'end'` if within `tolerance` of `loopEnd` (checked in that order — if a degenerate case has both within tolerance, `'start'` wins), else `null`.

- [ ] **Step 1: Write the failing tests**

Create `App voz/tests/loop-utils.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { computeLoopEngaged, clampLoopStart, clampLoopEnd, hitTestLoopMarker } = require('../loop-utils.js');

test('computeLoopEngaged is false when the loop is not active, regardless of position', () => {
  assert.equal(computeLoopEngaged(false, 35, 30, 45), false);
});

test('computeLoopEngaged is true when position is inside [loopStart, loopEnd)', () => {
  assert.equal(computeLoopEngaged(true, 30, 30, 45), true);
  assert.equal(computeLoopEngaged(true, 37, 30, 45), true);
});

test('computeLoopEngaged is false at or past loopEnd (exclusive upper bound)', () => {
  assert.equal(computeLoopEngaged(true, 45, 30, 45), false);
  assert.equal(computeLoopEngaged(true, 50, 30, 45), false);
});

test('computeLoopEngaged is false before loopStart', () => {
  assert.equal(computeLoopEngaged(true, 10, 30, 45), false);
});

test('clampLoopStart passes a valid candidate through unchanged', () => {
  assert.equal(clampLoopStart(20, 45, 0.1), 20);
});

test('clampLoopStart clamps a negative candidate to 0', () => {
  assert.equal(clampLoopStart(-5, 45, 0.1), 0);
});

test('clampLoopStart clamps a candidate too close to or past loopEnd', () => {
  assert.ok(Math.abs(clampLoopStart(44.95, 45, 0.1) - 44.9) < 1e-9);
  assert.ok(Math.abs(clampLoopStart(100, 45, 0.1) - 44.9) < 1e-9);
});

test('clampLoopEnd passes a valid candidate through unchanged', () => {
  assert.equal(clampLoopEnd(40, 30, 0.1, 60), 40);
});

test('clampLoopEnd clamps a candidate beyond the duration', () => {
  assert.equal(clampLoopEnd(999, 30, 0.1, 60), 60);
});

test('clampLoopEnd clamps a candidate too close to or before loopStart', () => {
  assert.ok(Math.abs(clampLoopEnd(30.05, 30, 0.1, 60) - 30.1) < 1e-9);
  assert.ok(Math.abs(clampLoopEnd(-5, 30, 0.1, 60) - 30.1) < 1e-9);
});

test('hitTestLoopMarker detects a hit on the start marker within tolerance', () => {
  assert.equal(hitTestLoopMarker(30.05, 30, 45, 0.2), 'start');
});

test('hitTestLoopMarker detects a hit on the end marker within tolerance', () => {
  assert.equal(hitTestLoopMarker(44.9, 30, 45, 0.2), 'end');
});

test('hitTestLoopMarker returns null when the click is far from both markers', () => {
  assert.equal(hitTestLoopMarker(37, 30, 45, 0.2), null);
});

test('hitTestLoopMarker returns null just outside the tolerance', () => {
  assert.equal(hitTestLoopMarker(30.21, 30, 45, 0.2), null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "App voz" && node --test tests/loop-utils.test.js`
Expected: FAIL — `Cannot find module '../loop-utils.js'`.

- [ ] **Step 3: Implement `loop-utils.js`**

Create `App voz/loop-utils.js`:

```js
function computeLoopEngaged(active, position, loopStart, loopEnd) {
  if (!active) return false;
  return position >= loopStart && position < loopEnd;
}

function clampLoopStart(candidate, loopEnd, minGap) {
  return Math.min(Math.max(candidate, 0), loopEnd - minGap);
}

function clampLoopEnd(candidate, loopStart, minGap, duration) {
  return Math.max(Math.min(candidate, duration), loopStart + minGap);
}

function hitTestLoopMarker(time, loopStart, loopEnd, tolerance) {
  if (Math.abs(time - loopStart) <= tolerance) return 'start';
  if (Math.abs(time - loopEnd) <= tolerance) return 'end';
  return null;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { computeLoopEngaged, clampLoopStart, clampLoopEnd, hitTestLoopMarker };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "App voz" && node --test tests/loop-utils.test.js`
Expected: PASS, all 13 tests.

- [ ] **Step 5: Commit**

```bash
git add "App voz/loop-utils.js" "App voz/tests/loop-utils.test.js"
git commit -m "feat(app-voz): add loop-utils.js for practice-loop calculations"
```

---

### Task 2: Loop markers + toggle + wrap-around playback

**Files:**
- Modify: `App voz/index.html`

**Interfaces:**
- Consumes: `computeLoopEngaged(active, position, loopStart, loopEnd)`, `clampLoopStart(candidate, loopEnd, minGap)`, `clampLoopEnd(candidate, loopStart, minGap, duration)`, `hitTestLoopMarker(time, loopStart, loopEnd, tolerance)` from Task 1, loaded as browser globals via a new `<script>` tag.

- [ ] **Step 1: Load the new script**

In `App voz/index.html`, after the line `<script src="./waveform-utils.js"></script>`, add:

```html
    <script src="./waveform-utils.js"></script>
    <script src="./loop-utils.js"></script>
```

- [ ] **Step 2: Add the loop toggle button**

Right after `<button id="viewReportBtn" disabled>Ver informe</button>`, add:

```html
    <button id="viewReportBtn" disabled>Ver informe</button>
    <button id="loopToggleBtn" disabled>Loop</button>
```

- [ ] **Step 3: Add CSS for the active loop button state**

Right after `button:disabled { opacity:0.4; cursor:not-allowed; }`, add:

```css
  button:disabled { opacity:0.4; cursor:not-allowed; }
  button.active { background:#ff9800; }
```

- [ ] **Step 4: Add state fields**

In the `state` object literal, change the last property from `pendingStartTime: null` to add the four new loop fields:

```js
      lastReport: null,
      waveformPeaks: [],
      waveformPreviewTime: null,
      pendingStartTime: null,
      loopActive: false,
      loopStart: null,
      loopEnd: null,
      loopEngaged: false
    };
```

- [ ] **Step 5: Add loop-related constants**

Right after `const COLOR_WAVEFORM = '#4a90d9';`, add:

```js
    const COLOR_LOOP_MARKER = '#ff9800';
    const LOOP_MIN_GAP_SEC = 0.1;
    const LOOP_MARKER_HIT_TOLERANCE_PX = 8;
    const LOOP_MARKER_TRIANGLE_SIZE = 8;
```

- [ ] **Step 6: Draw the loop markers in `renderWaveform()`**

Add this block at the end of `renderWaveform()`, right before its closing `}` (after the existing position-marker drawing block):

```js
      if (state.loopActive && state.loopStart !== null && state.loopEnd !== null && duration > 0) {
        const startX = (state.loopStart / duration) * canvas.width;
        const endX = (state.loopEnd / duration) * canvas.width;

        ctx.strokeStyle = COLOR_LOOP_MARKER;
        ctx.beginPath();
        ctx.moveTo(startX, 0);
        ctx.lineTo(startX, canvas.height);
        ctx.moveTo(endX, 0);
        ctx.lineTo(endX, canvas.height);
        ctx.stroke();

        ctx.fillStyle = COLOR_LOOP_MARKER;
        ctx.beginPath();
        ctx.moveTo(startX, 0);
        ctx.lineTo(startX, LOOP_MARKER_TRIANGLE_SIZE);
        ctx.lineTo(startX + LOOP_MARKER_TRIANGLE_SIZE, LOOP_MARKER_TRIANGLE_SIZE / 2);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(endX, 0);
        ctx.lineTo(endX, LOOP_MARKER_TRIANGLE_SIZE);
        ctx.lineTo(endX - LOOP_MARKER_TRIANGLE_SIZE, LOOP_MARKER_TRIANGLE_SIZE / 2);
        ctx.closePath();
        ctx.fill();
      }
```

(`duration` is already computed earlier in the function as `const duration = state.audioBuffer ? state.audioBuffer.duration : 0;` — reuse it, don't redeclare it.)

- [ ] **Step 7: Reset the loop when a new WAV loads**

In the `wavInput` change handler, add loop-reset lines to BOTH the success and catch branches, and toggle `#loopToggleBtn`'s `disabled`/`active` state.

Replace:

```js
        state.waveformPeaks = computeWaveformPeaks(monoSamples, WAVEFORM_WIDTH);
      } catch (err) {
        state.audioBuffer = null;
        state.waveformPeaks = [];
        document.getElementById('wavStatus').textContent =
          `Error al cargar el WAV: ${err.message || 'Archivo WAV inválido'}`;
      }
      renderWaveform();
```

with:

```js
        state.waveformPeaks = computeWaveformPeaks(monoSamples, WAVEFORM_WIDTH);
        state.loopActive = false;
        state.loopStart = null;
        state.loopEnd = null;
        state.loopEngaged = false;
        document.getElementById('loopToggleBtn').disabled = false;
        document.getElementById('loopToggleBtn').classList.remove('active');
      } catch (err) {
        state.audioBuffer = null;
        state.waveformPeaks = [];
        state.loopActive = false;
        state.loopStart = null;
        state.loopEnd = null;
        state.loopEngaged = false;
        document.getElementById('loopToggleBtn').disabled = true;
        document.getElementById('loopToggleBtn').classList.remove('active');
        document.getElementById('wavStatus').textContent =
          `Error al cargar el WAV: ${err.message || 'Archivo WAV inválido'}`;
      }
      renderWaveform();
```

- [ ] **Step 8: Replace the waveform mouse handlers with the 3-target version, and add the loop toggle click handler**

Replace the entire existing block — from `let isDraggingWaveform = false;` through the closing of the `mouseup` listener:

```js
    let isDraggingWaveform = false;

    function waveformXToTime(clientX) {
      const canvas = document.getElementById('waveformCanvas');
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const fraction = Math.min(1, Math.max(0, x / rect.width));
      const duration = state.audioBuffer ? state.audioBuffer.duration : 0;
      return fraction * duration;
    }

    document.getElementById('waveformCanvas').addEventListener('mousedown', (e) => {
      if (!state.audioBuffer) return;
      isDraggingWaveform = true;
      state.waveformPreviewTime = waveformXToTime(e.clientX);
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDraggingWaveform) return;
      state.waveformPreviewTime = waveformXToTime(e.clientX);
    });

    document.addEventListener('mouseup', () => {
      if (!isDraggingWaveform) return;
      isDraggingWaveform = false;
      const time = state.waveformPreviewTime;
      state.waveformPreviewTime = null;
      seekTo(time);
    });
```

with:

```js
    let waveformDragTarget = null;

    function waveformXToTime(clientX) {
      const canvas = document.getElementById('waveformCanvas');
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const fraction = Math.min(1, Math.max(0, x / rect.width));
      const duration = state.audioBuffer ? state.audioBuffer.duration : 0;
      return fraction * duration;
    }

    document.getElementById('waveformCanvas').addEventListener('mousedown', (e) => {
      if (!state.audioBuffer) return;
      const clickTime = waveformXToTime(e.clientX);

      if (state.loopActive) {
        const canvas = document.getElementById('waveformCanvas');
        const rect = canvas.getBoundingClientRect();
        const toleranceSec = (LOOP_MARKER_HIT_TOLERANCE_PX / rect.width) * state.audioBuffer.duration;
        const hit = hitTestLoopMarker(clickTime, state.loopStart, state.loopEnd, toleranceSec);
        if (hit === 'start') {
          waveformDragTarget = 'loopStart';
          return;
        }
        if (hit === 'end') {
          waveformDragTarget = 'loopEnd';
          return;
        }
      }

      waveformDragTarget = 'position';
      state.waveformPreviewTime = clickTime;
    });

    document.addEventListener('mousemove', (e) => {
      if (!waveformDragTarget) return;
      if (waveformDragTarget === 'position') {
        state.waveformPreviewTime = waveformXToTime(e.clientX);
        return;
      }
      const time = waveformXToTime(e.clientX);
      if (waveformDragTarget === 'loopStart') {
        state.loopStart = clampLoopStart(time, state.loopEnd, LOOP_MIN_GAP_SEC);
      } else if (waveformDragTarget === 'loopEnd') {
        state.loopEnd = clampLoopEnd(time, state.loopStart, LOOP_MIN_GAP_SEC, state.audioBuffer.duration);
      }
    });

    document.addEventListener('mouseup', () => {
      if (!waveformDragTarget) return;
      if (waveformDragTarget === 'position') {
        const time = state.waveformPreviewTime;
        state.waveformPreviewTime = null;
        waveformDragTarget = null;
        seekTo(time);
        return;
      }
      waveformDragTarget = null;
    });

    document.getElementById('loopToggleBtn').addEventListener('click', () => {
      if (!state.audioBuffer) return;
      state.loopActive = !state.loopActive;
      const btn = document.getElementById('loopToggleBtn');
      if (state.loopActive) {
        if (state.loopStart === null) {
          state.loopStart = 0;
          state.loopEnd = state.audioBuffer.duration;
        }
        state.loopEngaged = false;
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
```

- [ ] **Step 9: Set `loopEngaged` when `play()` starts, and jump to `loopStart` when the loop is active**

In `play()`, replace:

```js
      const startFrom = state.pendingStartTime !== null
        ? Math.min(state.pendingStartTime, state.audioBuffer.duration)
        : 0;
      state.pendingStartTime = null;
```

with:

```js
      const startFrom = state.loopActive
        ? state.loopStart
        : (state.pendingStartTime !== null ? Math.min(state.pendingStartTime, state.audioBuffer.duration) : 0);
      state.pendingStartTime = null;
      state.loopEngaged = computeLoopEngaged(state.loopActive, startFrom, state.loopStart, state.loopEnd);
```

(When `state.loopActive` is true, `state.loopStart`/`state.loopEnd` are guaranteed non-null — the loop toggle handler in Step 8 always initializes them before setting `loopActive = true`.)

- [ ] **Step 10: Set `loopEngaged` in `seekTo()`**

In `seekTo(time)`, replace:

```js
      const clamped = Math.min(Math.max(time, 0), state.audioBuffer.duration);

      // resetNoteProgress() sets state.frozenTime = null as a side effect — it MUST run
```

with:

```js
      const clamped = Math.min(Math.max(time, 0), state.audioBuffer.duration);
      state.loopEngaged = computeLoopEngaged(state.loopActive, clamped, state.loopStart, state.loopEnd);

      // resetNoteProgress() sets state.frozenTime = null as a side effect — it MUST run
```

- [ ] **Step 11: Add the wrap-around check to `mainLoop`**

This is the core of the feature — read it carefully. `mainLoop` currently declares `currentTime` and `judgmentTime` with `const`. They need to become `let`, because when a loop wrap happens mid-frame (via a call to `seekTo`), the rest of that same frame's logic (the silence-guard check, pitch-history recording, note-progress judging) must use the FRESH post-wrap position — not the stale pre-wrap one computed at the top of the function.

Replace:

```js
      const currentTime = currentPlaybackTime();
      const judgmentTime = currentTime - state.latencyOffsetSec;
      let detectedFrequency = null;
```

with:

```js
      let currentTime = currentPlaybackTime();
      let judgmentTime = currentTime - state.latencyOffsetSec;
      let detectedFrequency = null;
```

Then, right after the `if (state.calibration) { ... }` block and BEFORE the `if (detectedFrequency !== null) { state.lastSignalTime = judgmentTime; }` line, insert:

```js
      if (state.loopActive && state.sourceNode) {
        if (!state.loopEngaged && currentTime >= state.loopStart && currentTime < state.loopEnd) {
          state.loopEngaged = true;
        }
        if (state.loopEngaged && currentTime >= state.loopEnd) {
          seekTo(state.loopStart);
          currentTime = currentPlaybackTime();
          judgmentTime = currentTime - state.latencyOffsetSec;
        }
      }
```

The full `mainLoop` function, after this step, should read (shown in full so you can verify against your edit — the only changes from before are the two `let`s and the new block right after the calibration handling):

```js
    function mainLoop() {
      const now = state.audioContext.currentTime;
      const deltaSeconds = state.lastFrameTime === null ? 0 : now - state.lastFrameTime;
      state.lastFrameTime = now;

      let currentTime = currentPlaybackTime();
      let judgmentTime = currentTime - state.latencyOffsetSec;
      let detectedFrequency = null;
      let peak = 0;
      if (state.voces[0]) {
        ({ peak } = state.voces[0].getLevel());
        updateLevelMeter(peak);
        detectedFrequency = peak > 0.02 ? state.voces[0].getPitch() : null;
        updatePitchDisplay(detectedFrequency);
      }

      if (state.calibration) {
        const nowAudio = state.audioContext.currentTime;
        state.calibration.clickTimes.forEach((clickTime, i) => {
          if (state.calibration.deltas[i] !== null) return;
          const windowStart = clickTime + CALIBRATION_DEAD_ZONE_SEC;
          if (nowAudio < windowStart || nowAudio > clickTime + CALIBRATION_WINDOW_SEC) return;
          if (peak > 0.02) {
            state.calibration.deltas[i] = nowAudio - clickTime;
          }
        });
        if (nowAudio >= state.calibration.endTime) {
          finishCalibration();
        }
      }

      if (state.loopActive && state.sourceNode) {
        if (!state.loopEngaged && currentTime >= state.loopStart && currentTime < state.loopEnd) {
          state.loopEngaged = true;
        }
        if (state.loopEngaged && currentTime >= state.loopEnd) {
          seekTo(state.loopStart);
          currentTime = currentPlaybackTime();
          judgmentTime = currentTime - state.latencyOffsetSec;
        }
      }

      if (detectedFrequency !== null) {
        state.lastSignalTime = judgmentTime;
      }

      if (hasMic() && state.sourceNode && countUnsungBeats(state.beats, state.notes, state.lastSignalTime, judgmentTime) >= SILENCE_STOP_BEATS) {
        stopPlayback('Reproducción detenida: no se detectó canto durante varios pulsos.');
      }

      if (hasMic() && state.sourceNode && detectedFrequency !== null) {
        state.pitchHistory.push({ time: judgmentTime, pitch: frequencyToMidi(detectedFrequency) });
        state.fullPitchHistory.push({ time: judgmentTime, pitch: frequencyToMidi(detectedFrequency) });
      }
      state.pitchHistory = state.pitchHistory.filter((p) => p.time > currentTime - MAX_PITCH_HISTORY_SEC);

      updateNoteProgress(judgmentTime, detectedFrequency, deltaSeconds);
      renderPianoRoll();
      renderWaveform();

      requestAnimationFrame(mainLoop);
    }
```

- [ ] **Step 12: Run the full automated test suite**

Run: `cd "App voz" && node --test tests/*.test.js`
Expected: all tests pass (90 total: 77 from before + 13 new `loop-utils.js` tests).

- [ ] **Step 13: Manual browser verification**

Start a local server and open the app:

```bash
cd "App voz" && python3 -m http.server 8794
```

Using the `mcp__Claude_Browser__*` tools:

1. Navigate to `http://localhost:8794/index.html`.
2. Use `read_console_messages` with `onlyErrors: true` — expect no errors on load.
3. Confirm `#loopToggleBtn` starts `disabled` (via `read_page` or `javascript_tool`).
4. Load `tests/fixtures/sample.wav` into `#wavInput` via the file-input-simulation technique used in prior tasks. Confirm `#loopToggleBtn` becomes enabled.
5. Click `#loopToggleBtn` (via `computer` click or by dispatching a click through `javascript_tool`). Confirm via `javascript_tool`: `state.loopActive === true`, `state.loopStart === 0`, `state.loopEnd` equals `state.audioBuffer.duration`.
6. Click `#loopToggleBtn` again to turn it off, then a third time to turn it back on. Confirm `state.loopStart`/`state.loopEnd` are unchanged from step 5 (persistence across toggle, per the design).
7. Via `javascript_tool`, directly call `state.loopStart = clampLoopStart(1, state.loopEnd, LOOP_MIN_GAP_SEC); state.loopEnd = clampLoopEnd(3, state.loopStart, LOOP_MIN_GAP_SEC, state.audioBuffer.duration);` to set a small loop region within the fixture's duration (check `state.audioBuffer.duration` first and pick values inside it), then call `renderWaveform()` and confirm (via a screenshot or `read_page`) the orange markers are visible on `#waveformCanvas`.
8. Load `tests/fixtures/sample.mid` into `#midiInput` (so playback has content), click `#playBtn`, and confirm via `javascript_tool` that `state.sourceNode !== null` and `currentPlaybackTime()` is near `state.loopStart` (since the loop is active, per Step 9 `play()` should have jumped there) — and `state.loopEngaged === true`.
9. Advance past the loop's end: call `seekTo(state.loopEnd - 0.05)` via `javascript_tool` (a valid, real seek — simulates approaching the boundary), wait roughly 100-200ms (a couple of animation frames) using `computer` `wait`, then check via `javascript_tool` that `currentPlaybackTime()` is back near `state.loopStart` again — proving the automatic wrap happened once playback crossed `loopEnd`.
10. With the loop still active and looping, click `#loopToggleBtn` to turn it off. Wait a moment, then confirm via `javascript_tool` that `currentPlaybackTime()` has continued advancing PAST `state.loopEnd` without jumping back — proving the loop stopped repeating once deactivated.
11. Test "activating the loop after already passing the marked zone doesn't force a jump": with the loop currently off and the song playing well past the previously-marked `loopEnd`, click `#loopToggleBtn` to turn it back on. Confirm via `javascript_tool` that `currentPlaybackTime()` does NOT immediately jump anywhere (no seek happened) — it should keep increasing normally, since the design says the loop only "engages" once playback naturally re-enters `[loopStart, loopEnd)`, and forward-only playback that's already past the zone will never re-enter it on its own.
12. Confirm no console errors at any step (`read_console_messages` with `onlyErrors: true`).

Expected: all checks pass, no console errors at any step.

- [ ] **Step 14: Commit**

```bash
git add "App voz/index.html"
git commit -m "feat(app-voz): add a draggable practice loop on the waveform"
```

---

## Self-Review Notes

- **Spec coverage:** loop toggle button, default markers at extremes on first activation, persistence across toggle (Task 2 Steps 2, 8) ✓; draggable markers with a minimum gap, in any playback state (Task 2 Steps 4-5, 8) ✓; distinct orange color + directional triangles (Task 2 Steps 3, 5-6) ✓; reuses `seekTo()` for the wrap, inheriting note-progress reset and the silence-guard fix (Task 2 Step 11, no new reset logic needed) ✓; `loopEngaged` state machine — arms on activation, engages only on natural entry into the zone, wraps only once engaged, survives a manual deactivation by simply no longer being checked (Task 2 Steps 8-11) ✓; "Reproducir" with the loop active jumps straight to `loopStart` (Task 2 Step 9) ✓; deactivating mid-loop lets playback continue to the real end (Task 2 Step 11, gated on `state.loopActive`) ✓.
- **Placeholder scan:** none found — every step has literal code or an exact command.
- **Type consistency:** `computeLoopEngaged(active, position, loopStart, loopEnd)`, `clampLoopStart(candidate, loopEnd, minGap)`, `clampLoopEnd(candidate, loopStart, minGap, duration)`, and `hitTestLoopMarker(time, loopStart, loopEnd, tolerance)` signatures match between Task 1's implementation and every Task 2 call site. `waveformDragTarget` (replacing the old `isDraggingWaveform` boolean) is consistently `'position' | 'loopStart' | 'loopEnd' | null` across the mousedown/mousemove/mouseup handlers in Step 8.
