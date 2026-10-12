# App voz — Forma de onda + salto de posición Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Draw the loaded WAV's waveform across the whole song above the piano roll, and let the user click/drag on it to jump playback to any point — whether the song is currently playing or stopped.

**Architecture:** A new pure file (`waveform-utils.js`) downsamples raw PCM samples into per-pixel min/max peaks for drawing. `index.html` computes those peaks once when a WAV loads, draws them (plus a moving position marker) every frame on a new `#waveformCanvas`, and adds a `seekTo(time)` function that either restarts the currently-playing `AudioBufferSourceNode` at a new offset (rescheduling the metronome/instrument nodes to match) or just updates the stored paused position — and changes `play()` to start from that stored position instead of always from 0.

**Tech Stack:** Vanilla JS, no build step. Tests run with `node --test` against pure functions exported via `module.exports`. Manual browser verification via a local `python3 -m http.server` and the `mcp__Claude_Browser__*` tools.

## Global Constraints

- No build step, no npm, no external libraries — hand-written JS only, consistent with the rest of the repo (`CLAUDE.md`).
- Every new file exports pure functions via `module.exports` guarded by `typeof module !== 'undefined' && module.exports`.
- **The seek range is bounded by the WAV's own length (`state.audioBuffer.duration`), not `state.durationSec`.** `state.durationSec` is the loaded MIDI's duration (set by `parseMidi`), which is a separate, already-known-to-sometimes-differ value from the WAV's actual length (documented as a pending issue in `musicvision_contexto.md`: "WAV/MIDI-length-mismatch pendiente"). The waveform is a picture of the WAV file itself, so its width and the seek math both key off `state.audioBuffer.duration`. `state.durationSec` is untouched by this plan and keeps meaning exactly what it already means (the MIDI's duration, used by `formatMidiStatusText` and the performance report).
- **Critical ordering gotcha in `seekTo(time)`:** the existing `resetNoteProgress()` function (unchanged) unconditionally sets `state.frozenTime = null` as one of its side effects. `seekTo`'s "song is stopped" branch needs to set `state.frozenTime` to the new seek position — so `resetNoteProgress()` MUST be called BEFORE that assignment, never after, or the assignment gets silently wiped back to `null`. See Task 2 Step 6 for the exact code and ordering.
- Design spec: `docs/superpowers/specs/2026-09-16-app-voz-forma-onda-seek-design.md`.

---

### Task 1: `waveform-utils.js` — downsample PCM samples into drawable peaks

**Files:**
- Create: `App voz/waveform-utils.js`
- Test: `App voz/tests/waveform-utils.test.js`

**Interfaces:**
- Produces: `computeWaveformPeaks(samples, width) -> Array<{min: number, max: number}>` — exactly `width` entries, one per pixel column, each the min/max of the samples that fall in that column. `samples` is a plain array-like of numbers (a `Float32Array` or a plain `Array`) — the function has no knowledge of `AudioBuffer`, channels, or Web Audio; the caller (Task 2) is responsible for reducing a possibly-stereo `AudioBuffer` down to one flat array before calling this.

- [ ] **Step 1: Write the failing tests**

Create `App voz/tests/waveform-utils.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { computeWaveformPeaks } = require('../waveform-utils.js');

test('computeWaveformPeaks returns exactly `width` peaks for a simple alternating signal', () => {
  const samples = [0, 1, -1, 0, 1, -1, 0, 1, -1, 0]; // 10 samples
  const peaks = computeWaveformPeaks(samples, 5);
  assert.equal(peaks.length, 5);
});

test('computeWaveformPeaks computes the correct min/max per column on an exact 2-samples-per-pixel split', () => {
  const samples = [0, 1, -1, 0, 1, -1, 0, 1, -1, 0]; // 10 samples, width 5 -> 2 samples/column
  const peaks = computeWaveformPeaks(samples, 5);
  assert.deepEqual(peaks[0], { min: 0, max: 1 });   // samples[0..1] = [0, 1]
  assert.deepEqual(peaks[1], { min: -1, max: 0 });  // samples[2..3] = [-1, 0]
  assert.deepEqual(peaks[2], { min: -1, max: 1 });  // samples[4..5] = [1, -1]
});

test('computeWaveformPeaks returns an empty array when width is 0', () => {
  assert.deepEqual(computeWaveformPeaks([1, 2, 3], 0), []);
});

test('computeWaveformPeaks returns width entries of {min: 0, max: 0} for an empty samples array', () => {
  const peaks = computeWaveformPeaks([], 4);
  assert.equal(peaks.length, 4);
  peaks.forEach((p) => assert.deepEqual(p, { min: 0, max: 0 }));
});

test('computeWaveformPeaks handles more pixel columns than samples without throwing or going out of bounds', () => {
  const samples = [0.5, -0.5];
  const peaks = computeWaveformPeaks(samples, 10);
  assert.equal(peaks.length, 10);
  peaks.forEach((p) => {
    assert.ok(p.min <= p.max);
    assert.ok(Number.isFinite(p.min) && Number.isFinite(p.max));
  });
});

test('computeWaveformPeaks always has min <= max in every column, for a larger pseudo-random signal', () => {
  const samples = [];
  for (let i = 0; i < 997; i++) {
    samples.push(Math.sin(i * 0.37) * 0.8 + Math.sin(i * 1.9) * 0.2);
  }
  const peaks = computeWaveformPeaks(samples, 200);
  assert.equal(peaks.length, 200);
  peaks.forEach((p) => assert.ok(p.min <= p.max));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "App voz" && node --test tests/waveform-utils.test.js`
Expected: FAIL — `Cannot find module '../waveform-utils.js'`.

- [ ] **Step 3: Implement `waveform-utils.js`**

Create `App voz/waveform-utils.js`:

```js
function computeWaveformPeaks(samples, width) {
  if (width <= 0) return [];
  const n = samples.length;
  if (n === 0) {
    return Array.from({ length: width }, () => ({ min: 0, max: 0 }));
  }
  const samplesPerPixel = n / width;
  const peaks = [];
  for (let col = 0; col < width; col++) {
    const start = Math.floor(col * samplesPerPixel);
    const end = Math.max(start + 1, Math.floor((col + 1) * samplesPerPixel));
    let min = samples[start];
    let max = samples[start];
    for (let i = start; i < end && i < n; i++) {
      const value = samples[i];
      if (value < min) min = value;
      if (value > max) max = value;
    }
    peaks.push({ min, max });
  }
  return peaks;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { computeWaveformPeaks };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "App voz" && node --test tests/waveform-utils.test.js`
Expected: PASS, all 6 tests.

- [ ] **Step 5: Commit**

```bash
git add "App voz/waveform-utils.js" "App voz/tests/waveform-utils.test.js"
git commit -m "feat(app-voz): add computeWaveformPeaks for downsampling a WAV's samples"
```

---

### Task 2: Waveform canvas + click/drag seek

**Files:**
- Modify: `App voz/index.html`

**Interfaces:**
- Consumes: `computeWaveformPeaks(samples, width)` from Task 1, loaded as a browser global via a new `<script>` tag.

- [ ] **Step 1: Load the new script**

In `App voz/index.html`, after the line `<script src="./report-svg.js"></script>` (around line 83), add:

```html
    <script src="./report-svg.js"></script>
    <script src="./waveform-utils.js"></script>
```

- [ ] **Step 2: Add the waveform canvas to the HTML, above the piano roll**

Replace this line (around line 59):

```html
  <canvas id="pianoRoll" width="900" height="240"></canvas>
```

with:

```html
  <canvas id="waveformCanvas" width="900" height="60"></canvas>
  <canvas id="pianoRoll" width="900" height="240"></canvas>
```

- [ ] **Step 3: Add CSS for the waveform canvas**

In the `<style>` block, after the line `#pianoRoll { width:100%; max-width:900px; height:240px; background:#1a1d29; border-radius:8px; display:block; }` (around line 10), add:

```css
  #waveformCanvas { width:100%; max-width:900px; height:60px; background:#1a1d29; border-radius:8px; display:block; margin-bottom:12px; cursor:pointer; }
```

- [ ] **Step 4: Add state and constants**

In the `state` object literal, add `waveformPeaks` and `waveformPreviewTime` right after `lastReport: null` (change the last line, around line 111):

```js
      instrumentNodes: [],
      lastReport: null,
      waveformPeaks: [],
      waveformPreviewTime: null
    };
```

After the line `const REPORT_SCROLL_STEP = 300;` (around line 150), add:

```js
    const WAVEFORM_WIDTH = document.getElementById('waveformCanvas').width;
    const WAVEFORM_HEIGHT = document.getElementById('waveformCanvas').height;
    const COLOR_WAVEFORM = '#4a90d9';
```

- [ ] **Step 5: Add `renderWaveform()` and call it everywhere `renderPianoRoll()` is called**

Right after the `renderPianoRoll()` function's closing brace (around line 311, before `function playSuccessBlip`), add:

```js
    function renderWaveform() {
      const canvas = document.getElementById('waveformCanvas');
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const midY = canvas.height / 2;
      ctx.strokeStyle = COLOR_WAVEFORM;
      ctx.beginPath();
      state.waveformPeaks.forEach((peak, x) => {
        const yTop = midY - peak.max * midY;
        const yBottom = midY - peak.min * midY;
        ctx.moveTo(x + 0.5, yTop);
        ctx.lineTo(x + 0.5, yBottom);
      });
      ctx.stroke();

      const duration = state.audioBuffer ? state.audioBuffer.duration : 0;
      if (duration > 0) {
        const displayTime = state.waveformPreviewTime !== null ? state.waveformPreviewTime : currentPlaybackTime();
        const x = (displayTime / duration) * canvas.width;
        ctx.strokeStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
    }
```

Now call it alongside every existing call to `renderPianoRoll()`:

1. Around line 358, replace:
   ```js
   renderPianoRoll();
   requestAnimationFrame(mainLoop);
   ```
   with:
   ```js
   renderPianoRoll();
   renderWaveform();
   requestAnimationFrame(mainLoop);
   ```

2. In `mainLoop` (around line 729), replace:
   ```js
       updateNoteProgress(judgmentTime, detectedFrequency, deltaSeconds);
       renderPianoRoll();

       requestAnimationFrame(mainLoop);
   ```
   with:
   ```js
       updateNoteProgress(judgmentTime, detectedFrequency, deltaSeconds);
       renderPianoRoll();
       renderWaveform();

       requestAnimationFrame(mainLoop);
   ```

(These are the only two places `renderPianoRoll()` is called outside `mainLoop`'s per-frame call and the initial call — the `midiInput`/`voiceTypeSelect` handlers also call `renderPianoRoll()`, but those don't need a `renderWaveform()` companion call since loading a MIDI or changing voice type doesn't affect the WAV's waveform.)

- [ ] **Step 6: Compute peaks when a WAV loads, and add `seekTo(time)`**

Replace the `wavInput` change handler (around lines 399-412):

```js
    document.getElementById('wavInput').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const arrayBuffer = await file.arrayBuffer();
        state.audioBuffer = await state.audioContext.decodeAudioData(arrayBuffer);
        document.getElementById('wavStatus').textContent =
          `WAV cargado: ${state.audioBuffer.duration.toFixed(2)}s`;
      } catch (err) {
        state.audioBuffer = null;
        document.getElementById('wavStatus').textContent =
          `Error al cargar el WAV: ${err.message || 'Archivo WAV inválido'}`;
      }
    });
```

with:

```js
    document.getElementById('wavInput').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const arrayBuffer = await file.arrayBuffer();
        state.audioBuffer = await state.audioContext.decodeAudioData(arrayBuffer);
        document.getElementById('wavStatus').textContent =
          `WAV cargado: ${state.audioBuffer.duration.toFixed(2)}s`;
        const channelCount = state.audioBuffer.numberOfChannels;
        const channelData = [];
        for (let ch = 0; ch < channelCount; ch++) {
          channelData.push(state.audioBuffer.getChannelData(ch));
        }
        const monoSamples = new Float32Array(channelData[0].length);
        for (let i = 0; i < monoSamples.length; i++) {
          let sum = 0;
          for (let ch = 0; ch < channelCount; ch++) sum += channelData[ch][i];
          monoSamples[i] = sum / channelCount;
        }
        state.waveformPeaks = computeWaveformPeaks(monoSamples, WAVEFORM_WIDTH);
      } catch (err) {
        state.audioBuffer = null;
        state.waveformPeaks = [];
        document.getElementById('wavStatus').textContent =
          `Error al cargar el WAV: ${err.message || 'Archivo WAV inválido'}`;
      }
      renderWaveform();
    });
```

Now add `seekTo(time)`. Place it right after the `stopPlayback(reason)` function's closing brace (around line 517, before `function generateReport()`):

```js
    function seekTo(time) {
      if (!state.audioBuffer) return;
      const clamped = Math.min(Math.max(time, 0), state.audioBuffer.duration);

      // resetNoteProgress() sets state.frozenTime = null as a side effect — it MUST run
      // before the "stopped" branch below sets frozenTime to the real seek position,
      // or that assignment gets silently wiped back to null.
      resetNoteProgress();
      state.lastSignalTime = clamped;

      if (state.sourceNode) {
        state.sourceNode.onended = null;
        state.sourceNode.stop();
        state.metronomeNodes.forEach((osc) => {
          try { osc.stop(); } catch (err) { /* already stopped, ignore */ }
        });
        state.metronomeNodes = [];
        state.instrumentNodes.forEach((node) => {
          try { node.stop(); } catch (err) { /* already stopped, ignore */ }
        });
        state.instrumentNodes = [];

        const node = state.audioContext.createBufferSource();
        node.buffer = state.audioBuffer;
        node.connect(state.wavGainNode);
        state.sourceNode = node;
        state.playStartTime = state.audioContext.currentTime - clamped;
        node.start(state.audioContext.currentTime, clamped);
        node.onended = () => {
          if (state.sourceNode === node) {
            state.frozenTime = state.audioContext.currentTime - state.playStartTime;
            state.sourceNode = null;
            document.getElementById('voiceTypeSelect').disabled = false;
            generateReport();
          }
        };

        if (document.getElementById('metronomeCheckbox').checked) {
          state.beats.forEach((beatTime) => {
            if (beatTime < clamped) return;
            const osc = playMetronomeClick(state.audioContext, state.playStartTime + beatTime);
            state.metronomeNodes.push(osc);
          });
        }
        if (document.getElementById('playMidiCheckbox').checked && state.instrumentSample) {
          state.notes.forEach((note) => {
            if (note.start < clamped) return;
            const rate = playbackRateForNote(note.pitch, state.instrumentReferenceMidi);
            const instrumentNode = playInstrumentNote(
              state.audioContext,
              state.instrumentSample,
              rate,
              state.playStartTime + note.start,
              note.duration
            );
            state.instrumentNodes.push(instrumentNode);
          });
        }
      } else {
        state.frozenTime = clamped;
      }
    }
```

- [ ] **Step 7: Change `play()` to start from the stored position instead of always 0**

In `play()`, replace the whole function body from its opening line through `node.start();` (around lines 436-469):

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
      if (state.calibration) {
        state.calibration = null;
        document.getElementById('calibrateBtn').disabled = false;
        document.getElementById('latencyStatus').textContent = 'Calibración cancelada.';
      }
      state.metronomeNodes.forEach((osc) => {
        try { osc.stop(); } catch (err) { /* already stopped, ignore */ }
      });
      state.metronomeNodes = [];
      state.instrumentNodes.forEach((node) => {
        try { node.stop(); } catch (err) { /* already stopped, ignore */ }
      });
      state.instrumentNodes = [];
      state.frozenTime = null;
      resetNoteProgress();
      state.lastSignalTime = 0;
      document.getElementById('playbackStatus').textContent = '';
      document.getElementById('reportPanel').hidden = true;
      document.getElementById('voiceTypeSelect').disabled = true;
      const node = state.audioContext.createBufferSource();
      node.buffer = state.audioBuffer;
      node.connect(state.wavGainNode);
      state.sourceNode = node;
      state.playStartTime = state.audioContext.currentTime;
      node.start();
```

with:

```js
    async function play() {
      if (!state.audioBuffer) return;
      const startFrom = state.frozenTime !== null ? state.frozenTime : 0;
      if (state.audioContext.state === 'suspended') {
        await state.audioContext.resume();
      }
      if (state.sourceNode) {
        state.sourceNode.onended = null;
        state.sourceNode.stop();
      }
      if (state.calibration) {
        state.calibration = null;
        document.getElementById('calibrateBtn').disabled = false;
        document.getElementById('latencyStatus').textContent = 'Calibración cancelada.';
      }
      state.metronomeNodes.forEach((osc) => {
        try { osc.stop(); } catch (err) { /* already stopped, ignore */ }
      });
      state.metronomeNodes = [];
      state.instrumentNodes.forEach((node) => {
        try { node.stop(); } catch (err) { /* already stopped, ignore */ }
      });
      state.instrumentNodes = [];
      state.frozenTime = null;
      resetNoteProgress();
      state.lastSignalTime = 0;
      document.getElementById('playbackStatus').textContent = '';
      document.getElementById('reportPanel').hidden = true;
      document.getElementById('voiceTypeSelect').disabled = true;
      const node = state.audioContext.createBufferSource();
      node.buffer = state.audioBuffer;
      node.connect(state.wavGainNode);
      state.sourceNode = node;
      state.playStartTime = state.audioContext.currentTime - startFrom;
      node.start(state.audioContext.currentTime, startFrom);
```

The only 3 changes: (1) `const startFrom = ...` is captured as the very first thing in the function, right after the `if (!state.audioBuffer) return;` guard — this is BEFORE the existing `state.frozenTime = null;` and `resetNoteProgress()` lines further down, which is essential: both of those already set `state.frozenTime` back to `null`, so `startFrom` must be read from the OLD value before either of them runs. (2) `state.playStartTime` now subtracts `startFrom`, so `currentPlaybackTime()` (`audioContext.currentTime - playStartTime`) correctly reports `startFrom` immediately after starting. (3) `node.start()` now passes `(audioContext.currentTime, startFrom)` — the second argument is the offset in seconds into the buffer to start playing from.

Everything else in the function (the rest of the body, not shown above) is unchanged — just continue with the remaining edits below on the code that follows.

Also, `play()` already schedules the metronome and instrument notes unconditionally from the beginning (around lines 478-496) — this must now skip anything before `startFrom`, the same way `seekTo` does. Replace:

```js
      if (document.getElementById('metronomeCheckbox').checked) {
        state.beats.forEach((beatTime) => {
          const osc = playMetronomeClick(state.audioContext, state.playStartTime + beatTime);
          state.metronomeNodes.push(osc);
        });
      }
      if (document.getElementById('playMidiCheckbox').checked && state.instrumentSample) {
        state.notes.forEach((note) => {
          const rate = playbackRateForNote(note.pitch, state.instrumentReferenceMidi);
          const instrumentNode = playInstrumentNote(
            state.audioContext,
            state.instrumentSample,
            rate,
            state.playStartTime + note.start,
            note.duration
          );
          state.instrumentNodes.push(instrumentNode);
        });
      }
```

with:

```js
      if (document.getElementById('metronomeCheckbox').checked) {
        state.beats.forEach((beatTime) => {
          if (beatTime < startFrom) return;
          const osc = playMetronomeClick(state.audioContext, state.playStartTime + beatTime);
          state.metronomeNodes.push(osc);
        });
      }
      if (document.getElementById('playMidiCheckbox').checked && state.instrumentSample) {
        state.notes.forEach((note) => {
          if (note.start < startFrom) return;
          const rate = playbackRateForNote(note.pitch, state.instrumentReferenceMidi);
          const instrumentNode = playInstrumentNote(
            state.audioContext,
            state.instrumentSample,
            rate,
            state.playStartTime + note.start,
            note.duration
          );
          state.instrumentNodes.push(instrumentNode);
        });
      }
```

Note: `play()` already calls `resetNoteProgress()` before any of this (existing line, around line 459) — that call already sets `state.frozenTime = null` as a side effect, which is why `startFrom` must be read from `state.frozenTime` BEFORE that `resetNoteProgress()` call runs, not after. Double check the final order in `play()` reads, top to bottom: capture `startFrom` from `state.frozenTime` FIRST (add this as the very first line inside `play()`, right after the `if (!state.audioBuffer) return;` guard), THEN let the existing `resetNoteProgress()` call run further down as before. Concretely, add this near the top of `play()`, right after the `if (!state.audioBuffer) return;` line (around line 437):

```js
    async function play() {
      if (!state.audioBuffer) return;
      const startFrom = state.frozenTime !== null ? state.frozenTime : 0;
```

and then remove the `const startFrom = ...` line you added earlier (Step 7, right before `node.start(...)`) since it's now declared here instead — `startFrom` is used further down in the same function, no re-declaration needed.

- [ ] **Step 8: Wire the mousedown/mousemove/mouseup interaction**

Add this near the other top-level event listener registrations — right after the `document.getElementById('instrumentReferenceNote').addEventListener(...)` block (around line 434, before `async function play()`):

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

Note: `seekTo` is defined later in the file (Step 6, placed after `stopPlayback`), but since this is all plain top-level function declarations inside one `<script>` block, hoisting makes it available regardless of source order — this matches how `mainLoop` is already called via `requestAnimationFrame(mainLoop)` near the top of the file (line 359) despite being defined much further down (line 683).

- [ ] **Step 9: Run the full automated test suite**

Run: `cd "App voz" && node --test tests/*.test.js`
Expected: all tests pass (77 total: 71 from before + 6 new `computeWaveformPeaks` tests).

- [ ] **Step 10: Manual browser verification**

Start a local server and open the app:

```bash
cd "App voz" && python3 -m http.server 8793
```

Using the `mcp__Claude_Browser__*` tools:

1. Navigate to `http://localhost:8793/index.html`.
2. Use `read_console_messages` with `onlyErrors: true` — expect no errors on load.
3. Load `tests/fixtures/sample.wav` into `#wavInput` via the file-input-simulation technique used in prior tasks (constructing a `DataTransfer`/`File` via `javascript_tool` and dispatching a `change` event).
4. Via `javascript_tool`, confirm `state.waveformPeaks.length === 900` (matches `WAVEFORM_WIDTH`) and that at least one peak has a non-zero `max` or non-zero `min` (confirms the WAV wasn't silent and peaks were actually computed, not just defaulted).
5. Take a screenshot or use `read_page` to confirm `#waveformCanvas` is visible above `#pianoRoll` in the DOM order.
6. Load `tests/fixtures/sample.mid` into `#midiInput` too (so playback has something to schedule), then click `#playBtn`.
7. While playing, use `javascript_tool` to simulate a click-seek: dispatch `mousedown`, then `mouseup`, on `#waveformCanvas` at a specific `clientX` corresponding to roughly the midpoint of the canvas (e.g., compute `rect.left + rect.width / 2` from `getBoundingClientRect()` first). After dispatching, check via `javascript_tool`:
   - `state.sourceNode !== null` (still playing, a new node replaced the old one)
   - `currentPlaybackTime()` is close to half of `state.audioBuffer.duration` (within ~0.5s, accounting for the time the JS took to run)
   - `state.noteProgress` was reset (e.g., every entry's `timeTotal` is a small number close to 0, not accumulated from before the seek)
8. Click `#stopBtn`, then simulate the same mousedown/mouseup seek sequence while stopped. Confirm via `javascript_tool`:
   - `state.frozenTime` is close to the target seek time
   - `state.sourceNode === null` still (seeking while stopped doesn't start playback)
9. Click `#playBtn` again and confirm (via `javascript_tool`) that `currentPlaybackTime()` starts near the seeked position rather than 0 — this verifies `play()` now honors `state.frozenTime` instead of always restarting from the beginning.
10. Use `javascript_tool` to simulate a drag: dispatch `mousedown` at one `clientX`, then `mousemove` at a different `clientX` (without a `mouseup` yet), and confirm `state.waveformPreviewTime` updated to the new position while `state.sourceNode`'s actual playback position (`currentPlaybackTime()`) has NOT changed yet — proving the drag only previews, and the real seek doesn't fire until `mouseup`. Then dispatch `mouseup` and confirm the real seek happens.

Expected: all checks pass, no console errors at any step.

- [ ] **Step 11: Commit**

```bash
git add "App voz/index.html"
git commit -m "feat(app-voz): add a waveform view with click/drag seeking"
```

---

## Self-Review Notes

- **Spec coverage:** waveform peak extraction as a pure, testable function (Task 1) ✓; static waveform drawn once per WAV load, re-rendered every frame with a moving position marker (Task 2 Steps 4-5) ✓; click/drag interaction with preview-while-dragging and seek-on-release (Task 2 Step 8) ✓; `seekTo(time)` handling both the playing and stopped cases, rescheduling metronome/instrument nodes only for beats/notes at or after the seek point (Task 2 Step 6) ✓; `play()` now starts from the stored position instead of always 0 (Task 2 Step 7) ✓; progress always resets on seek via the existing `resetNoteProgress()` (Task 2 Step 6) ✓; `lastSignalTime` reset on seek to prevent a false auto-stop-by-silence right after jumping forward (Task 2 Step 6) ✓; waveform placed above the piano roll (Task 2 Step 2) ✓; seek range bounded by the WAV's own duration, not the MIDI's (Global Constraints, Task 2 Steps 6-8) ✓.
- **Placeholder scan:** none found — every step has literal code or an exact command.
- **Type consistency:** `computeWaveformPeaks(samples, width)` signature matches between Task 1's implementation and Task 2's call site (`computeWaveformPeaks(monoSamples, WAVEFORM_WIDTH)`). `seekTo(time)` is defined once (Task 2 Step 6) and called from the `mouseup` handler (Task 2 Step 8) with a single `time` argument, matching. `state.waveformPreviewTime` is initialized in the state literal (Step 4), read in `renderWaveform()` (Step 5), and written in the mousedown/mousemove/mouseup handlers (Step 8) — same field, consistent null-when-not-dragging convention throughout.
