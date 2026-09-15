# App voz — Etapa 3: Detección de pitch en tiempo real — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect the pitch (fundamental frequency) of whatever the microphone is capturing, in real time, and show it as a readable note name ("A4 (440.2 Hz, +3 cents)"). No comparison against the loaded MIDI's target notes and no piano-roll coloring yet — that's Etapa 4. This stage only proves detection works end to end.

**Architecture:** Two new pure, DOM-free files — `pitch-detection.js` (a hand-implemented YIN pitch detector: raw audio samples in, a frequency in Hz or `null` out) and `note-utils.js` (frequency → nearest note name + cents deviation, pure music-theory math) — unit-tested with Node, same dual-export pattern as the app's other pure modules. `index.html`'s `Voz` object gains a `getPitch()` method alongside its existing `getLevel()`. This stage also folds Etapa 1's `renderLoop` and Etapa 2's `micLevelLoop` — which have been running as two independent, un-synchronized `requestAnimationFrame` loops — into one `mainLoop()`, per the recommendation from Etapa 2's final review: pitch detection, the level meter, and the piano roll now all update from the same tick, which Etapa 4's per-note tuning logic will need.

**Tech Stack:** Vanilla JS, Web Audio API (`AnalyserNode.getFloatTimeDomainData`). No npm, no build, no external libraries — same as Etapas 1-2. The YIN algorithm below was hand-verified with Node during planning: sub-0.02% frequency error on synthetic sine waves from 110Hz to 880Hz, and correctly returns `null` for silence and white noise.

## Global Constraints

- No external libraries, no npm packages, no build step. The app remains `index.html` + `midi-parser.js` + `piano-roll-geometry.js` + `audio-level.js` + `pitch-detection.js` + `note-utils.js` (two new files this stage) — still zero-build, still opens with a double-click.
- Automated tests exist only for pure, DOM-free logic (`pitch-detection.js`, `note-utils.js`), run with Node's built-in `node --test` / `node:assert/strict` (no npm install). Run tests as `node --test tests/*.test.js` from `App voz/` — `node --test tests/` (bare directory) fails on Node 24 due to how it resolves the argument.
- `Voz` objects (from `createVoz()` in `index.html`) gain a `getPitch()` method with the same call shape as the existing `getLevel()` — no analyser access happens anywhere outside the `Voz` object's own methods.
- Only one `requestAnimationFrame` loop drives the whole app (`mainLoop`) after this stage — do not add a second independent loop. It starts once, unconditionally, at page load, and keeps running for the page's lifetime (matches the existing pattern of "no removal/deactivation logic yet" already accepted for Etapa 2's `state.voces`).
- Continue on the existing branch/worktree from Etapas 1-2 (`worktree-app-voz-etapa1`) — don't create a new worktree for this plan.

---

### Task 1: Pitch detection (`pitch-detection.js`)

**Files:**
- Create: `App voz/pitch-detection.js`
- Create: `App voz/tests/pitch-detection.test.js`

**Interfaces:**
- Produces: `detectPitch(buffer: Float32Array, sampleRate: number, threshold?: number) -> number | null`. `buffer` is raw time-domain audio samples in the `[-1, 1]` range, as `AnalyserNode.getFloatTimeDomainData()` produces. Returns the detected fundamental frequency in Hz, or `null` if no clear periodicity is found (silence, noise, or too quiet/ambiguous a signal). `threshold` defaults to `0.15` (the standard YIN absolute-threshold parameter — lower is stricter). Available as `module.exports.detectPitch` in Node and as a global `detectPitch` function when loaded via `<script src>` in the browser (same dual-export pattern as the app's other pure modules).

- [ ] **Step 1: Write the failing test**

Create `App voz/tests/pitch-detection.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { detectPitch } = require('../pitch-detection.js');

function makeSine(freq, sampleRate, n) {
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    buf[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate);
  }
  return buf;
}

const SAMPLE_RATE = 44100;
const BUFFER_LENGTH = 2048;

test('detectPitch finds the correct frequency for pure sine waves across the vocal range', () => {
  for (const freq of [110, 220, 261.63, 440, 880]) {
    const buffer = makeSine(freq, SAMPLE_RATE, BUFFER_LENGTH);
    const detected = detectPitch(buffer, SAMPLE_RATE);
    assert.ok(detected !== null, `should detect a pitch for ${freq}Hz`);
    const errorPct = (Math.abs(detected - freq) / freq) * 100;
    assert.ok(errorPct < 1, `error for ${freq}Hz should be under 1%, got ${errorPct}% (detected ${detected})`);
  }
});

test('detectPitch returns null for silence', () => {
  const silence = new Float32Array(BUFFER_LENGTH).fill(0);
  assert.equal(detectPitch(silence, SAMPLE_RATE), null);
});

test('detectPitch returns null for white noise', () => {
  const noise = new Float32Array(BUFFER_LENGTH);
  // Fixed values (not Math.random()) so this test is deterministic — a hand-picked
  // pseudo-random-looking sequence with no periodic structure.
  let seed = 42;
  for (let i = 0; i < noise.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    noise[i] = ((seed % 2000) / 1000 - 1) * 0.5;
  }
  assert.equal(detectPitch(noise, SAMPLE_RATE), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "App voz" && node --test tests/pitch-detection.test.js`
Expected: FAIL — `Cannot find module '../pitch-detection.js'` (the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `App voz/pitch-detection.js`:

```js
function detectPitch(buffer, sampleRate, threshold = 0.15) {
  const n = buffer.length;
  const maxTau = Math.floor(n / 2);

  // Step 1: difference function d(tau) = sum of (x[j] - x[j+tau])^2
  const diff = new Float32Array(maxTau);
  diff[0] = 0;
  for (let tau = 1; tau < maxTau; tau++) {
    let sum = 0;
    for (let j = 0; j < maxTau; j++) {
      const delta = buffer[j] - buffer[j + tau];
      sum += delta * delta;
    }
    diff[tau] = sum;
  }

  // Step 2: cumulative mean normalized difference function (CMNDF)
  const cmndf = new Float32Array(maxTau);
  cmndf[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau < maxTau; tau++) {
    runningSum += diff[tau];
    cmndf[tau] = diff[tau] / (runningSum / tau);
  }

  // Step 3: absolute threshold — find the first dip below `threshold`, then
  // walk forward to its local minimum.
  let tauEstimate = -1;
  for (let tau = 2; tau < maxTau; tau++) {
    if (cmndf[tau] < threshold) {
      while (tau + 1 < maxTau && cmndf[tau + 1] < cmndf[tau]) {
        tau++;
      }
      tauEstimate = tau;
      break;
    }
  }

  if (tauEstimate === -1) return null;

  // Step 4: parabolic interpolation around tauEstimate for sub-sample precision.
  let betterTau = tauEstimate;
  if (tauEstimate > 0 && tauEstimate < maxTau - 1) {
    const s0 = cmndf[tauEstimate - 1];
    const s1 = cmndf[tauEstimate];
    const s2 = cmndf[tauEstimate + 1];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (denom !== 0) {
      const adjustment = (s2 - s0) / denom;
      if (isFinite(adjustment) && Math.abs(adjustment) < 1) {
        betterTau = tauEstimate + adjustment;
      }
    }
  }

  return sampleRate / betterTau;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { detectPitch };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "App voz" && node --test tests/pitch-detection.test.js`
Expected: PASS — 3 tests, 0 failures. (Hand-verified during planning: 110/220/261.63/440/880Hz sines all detected within 0.02% error; silence and the same fixed pseudo-random noise sequence both return `null`.)

- [ ] **Step 5: Commit**

```bash
git add "App voz/pitch-detection.js" "App voz/tests/pitch-detection.test.js"
git commit -m "feat(app-voz): add YIN pitch detection with unit tests"
```

---

### Task 2: Frequency-to-note conversion (`note-utils.js`)

**Files:**
- Create: `App voz/note-utils.js`
- Create: `App voz/tests/note-utils.test.js`

**Interfaces:**
- Produces:
  - `frequencyToMidi(frequency: number) -> number` — converts Hz to a (possibly fractional) MIDI note number, using A4=440Hz=MIDI 69 as the reference.
  - `midiToNoteName(midiNumber: number) -> string` — rounds to the nearest integer MIDI number and returns a name like `"A4"`, `"C#4"` (using sharps, not flats — matches the `#` naming already used elsewhere, e.g. `midi-parser.js`'s pitch numbers being plain MIDI integers).
  - `describePitch(frequency: number) -> {midi: number, noteName: string, cents: number}` — the function Etapa 4 will actually use: `midi` is the nearest integer MIDI note, `noteName` its name, `cents` the signed deviation (-50 to +50 range in practice) between the input frequency and that nearest note's exact frequency.
  - All three available as `module.exports.*` in Node and as globals when loaded via `<script src>` in the browser (dual-export pattern, no `require`/`import` inside the file).

- [ ] **Step 1: Write the failing test**

Create `App voz/tests/note-utils.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { frequencyToMidi, midiToNoteName, describePitch } = require('../note-utils.js');

test('frequencyToMidi maps 440Hz to MIDI 69 (A4)', () => {
  assert.ok(Math.abs(frequencyToMidi(440) - 69) < 1e-9);
});

test('midiToNoteName names natural and sharp notes correctly', () => {
  assert.equal(midiToNoteName(69), 'A4');
  assert.equal(midiToNoteName(60), 'C4');
  assert.equal(midiToNoteName(61), 'C#4');
  assert.equal(midiToNoteName(59), 'B3');
});

test('describePitch returns exact match (0 cents) for a perfectly-tuned A4', () => {
  const result = describePitch(440);
  assert.equal(result.midi, 69);
  assert.equal(result.noteName, 'A4');
  assert.ok(Math.abs(result.cents) < 1e-6);
});

test('describePitch handles a note other than A4 exactly', () => {
  const result = describePitch(466.164); // A#4, the equal-tempered exact frequency
  assert.equal(result.midi, 70);
  assert.equal(result.noteName, 'A#4');
  assert.ok(Math.abs(result.cents) < 0.1);
});

test('describePitch reports positive cents for a sharp note and stays within +/-50', () => {
  const result = describePitch(450); // slightly sharp of A4 (440Hz), still closer to A4 than A#4
  assert.equal(result.midi, 69);
  assert.equal(result.noteName, 'A4');
  assert.ok(result.cents > 0 && result.cents < 50);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "App voz" && node --test tests/note-utils.test.js`
Expected: FAIL — `Cannot find module '../note-utils.js'`.

- [ ] **Step 3: Write the implementation**

Create `App voz/note-utils.js`:

```js
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function frequencyToMidi(frequency) {
  return 69 + 12 * Math.log2(frequency / 440);
}

function midiToNoteName(midiNumber) {
  const rounded = Math.round(midiNumber);
  const name = NOTE_NAMES[((rounded % 12) + 12) % 12];
  const octave = Math.floor(rounded / 12) - 1;
  return `${name}${octave}`;
}

function describePitch(frequency) {
  const exactMidi = frequencyToMidi(frequency);
  const roundedMidi = Math.round(exactMidi);
  const cents = (exactMidi - roundedMidi) * 100;
  return {
    midi: roundedMidi,
    noteName: midiToNoteName(roundedMidi),
    cents
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { frequencyToMidi, midiToNoteName, describePitch };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "App voz" && node --test tests/note-utils.test.js`
Expected: PASS — 5 tests, 0 failures. (Hand-verified during planning: `describePitch(440)` → `{midi:69, noteName:'A4', cents:0}`; `describePitch(466.16)` → `{midi:70, noteName:'A#4', cents:-0.014}`; `describePitch(450)` → `{midi:69, noteName:'A4', cents:38.9}`.)

- [ ] **Step 5: Commit**

```bash
git add "App voz/note-utils.js" "App voz/tests/note-utils.test.js"
git commit -m "feat(app-voz): add frequency-to-note-name conversion with unit tests"
```

---

### Task 3: Wire up live pitch detection and unify the render loops (`index.html`)

**Files:**
- Modify: `App voz/index.html`

**Interfaces:**
- Consumes: `detectPitch` (global, from Task 1's `pitch-detection.js`) and `describePitch` (global, from Task 2's `note-utils.js`), both loaded via `<script src>`.
- Produces: `Voz.getPitch()` — same object shape as before, plus this new method: `getPitch(): number | null` (delegates to `detectPitch` on the Voz's own analyser data). No new `state` fields. The two prior loop functions (`renderLoop`, `micLevelLoop`) are removed and replaced by a single `mainLoop()` that later stages should extend rather than add a sibling loop to.

- [ ] **Step 1: Load the two new pure-logic files**

In `App voz/index.html`, change this line:

```html
  <script src="./audio-level.js"></script>
```

to:

```html
  <script src="./audio-level.js"></script>
  <script src="./pitch-detection.js"></script>
  <script src="./note-utils.js"></script>
```

- [ ] **Step 2: Add the pitch display element**

In `App voz/index.html`, right after the existing `<div id="micStatus">Micrófono no activado.</div>` line and before `<canvas id="pianoRoll" ...>`, insert:

```html
  <div id="pitchDisplay">Nota detectada: —</div>
```

- [ ] **Step 3: Add `getPitch()` to `createVoz()`**

In the inline `<script>`, `createVoz()` currently reads:

```js
    function createVoz(stream, audioContext) {
      const source = audioContext.createMediaStreamSource(stream);
      const gainNode = audioContext.createGain();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(gainNode);
      gainNode.connect(analyser);
      const buffer = new Uint8Array(analyser.fftSize);
      return {
        stream,
        source,
        gainNode,
        analyser,
        setGain(value) {
          gainNode.gain.value = value;
        },
        getLevel() {
          analyser.getByteTimeDomainData(buffer);
          return computeLevel(buffer);
        }
      };
    }
```

Replace it with:

```js
    function createVoz(stream, audioContext) {
      const source = audioContext.createMediaStreamSource(stream);
      const gainNode = audioContext.createGain();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(gainNode);
      gainNode.connect(analyser);
      const byteBuffer = new Uint8Array(analyser.fftSize);
      const floatBuffer = new Float32Array(analyser.fftSize);
      return {
        stream,
        source,
        gainNode,
        analyser,
        setGain(value) {
          gainNode.gain.value = value;
        },
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
```

(Note the byte buffer used by `getLevel()` was renamed from `buffer` to `byteBuffer` — this is purely a local-variable rename to make room for the new `floatBuffer`, `getLevel()`'s own behavior is unchanged.)

- [ ] **Step 4: Add the pitch display update function**

In the inline `<script>`, right after the existing `updateLevelMeter(peak)` function definition, add:

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
```

- [ ] **Step 5: Replace the two separate loops with one unified `mainLoop()`**

In the inline `<script>`, find these two function definitions:

```js
    function renderLoop() {
      renderPianoRoll();
      if (state.sourceNode) {
        requestAnimationFrame(renderLoop);
      }
    }
```

and (further down, after `updateLevelMeter`):

```js
    function micLevelLoop() {
      if (state.voces[0]) {
        const { peak } = state.voces[0].getLevel();
        updateLevelMeter(peak);
      }
      if (state.voces.length > 0) {
        requestAnimationFrame(micLevelLoop);
      }
    }
```

Delete both. In their place (position doesn't matter as long as it's after `renderPianoRoll`, `updateLevelMeter`, and `updatePitchDisplay` are all defined — e.g. where `renderLoop` used to be), add:

```js
    function mainLoop() {
      renderPianoRoll();
      if (state.voces[0]) {
        const { peak } = state.voces[0].getLevel();
        updateLevelMeter(peak);
        updatePitchDisplay(state.voces[0].getPitch());
      }
      requestAnimationFrame(mainLoop);
    }
```

Then, right after the existing `renderPianoRoll();` call near the top of the script (the one that paints the initial empty piano roll before any file is loaded), add a call to start the loop:

```js
    renderPianoRoll();
    requestAnimationFrame(mainLoop);
```

- [ ] **Step 6: Remove the now-redundant loop-starting calls**

In `play()`, remove this line (the loop is already running continuously, it doesn't need to be told to start):

```js
      requestAnimationFrame(renderLoop);
```

In the `micBtn` click handler's success path, remove this line for the same reason:

```js
        requestAnimationFrame(micLevelLoop);
```

Everything else in `play()` and the `micBtn` handler stays exactly as it is.

- [ ] **Step 7: Manual verification — pitch detection end to end, via a synthetic mic substitute**

Same constraint as Etapas 1-2: `getUserMedia`'s permission dialog can't be scripted by any tooling, so verify with a synthetic oscillator substituted for the real mic — this exercises `createVoz`, `getPitch()`, `detectPitch`, `describePitch`, and the unified `mainLoop` with real, unmodified app code.

1. Start a local static file server in `App voz/` (`python3 -m http.server <port>`) and open `index.html` in a real browser (or via browser automation tooling — try `ToolSearch` for "browser navigate").
2. Run in the page's JS console (or via scripted execution):
   ```js
   const osc = state.audioContext.createOscillator();
   osc.frequency.value = 440; // A4
   const dest = state.audioContext.createMediaStreamDestination();
   osc.connect(dest);
   osc.start();
   const voz = createVoz(dest.stream, state.audioContext);
   state.voces.push(voz);
   ```
3. Wait roughly 200-300ms (a couple of animation frames), then read `document.getElementById('pitchDisplay').textContent`. Confirm it reads something like `"Nota detectada: A4 (440.0 Hz, +0 cents)"` — the exact decimals may vary slightly, but the note name must be `A4` and the Hz value must be close to 440.
4. Change `osc.frequency.value = 293.66;` (D4) and, after another short wait, confirm the display updates to show `D4` and roughly `293.7 Hz`.
5. Stop the oscillator (`osc.stop()`) or set `osc.frequency.value = 0`; after another short wait, confirm the display returns to `"Nota detectada: —"` once the signal is no longer a clear enough tone (silence/DC should make `detectPitch` return `null`).
6. Reload the page fresh (no mic activated) and confirm the piano roll still renders/updates correctly on its own (load `tests/fixtures/sample.mid` + `sample.wav`, press Reproducir) — this proves `mainLoop` replaced `renderLoop`'s job without regressing Etapa 1's playback sync. Confirm no console errors throughout.
7. Stop the server and close any tabs you opened.

- [ ] **Step 8: Commit**

```bash
git add "App voz/index.html"
git commit -m "feat(app-voz): wire up live pitch detection, unify render loops"
```
