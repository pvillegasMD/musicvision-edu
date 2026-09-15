# App voz — Etapa 2: Captura de micrófono — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add microphone capture to "App voz": a button to request mic permission and start capturing, a gain fader so the user can tame a hot input from inside the app (no OS settings needed), and a live level meter so the user can see and react to it. No pitch detection yet — that's Etapa 3.

**Architecture:** One new pure, DOM-free file (`audio-level.js`) computes an RMS/peak level from raw `AnalyserNode` byte data — unit-tested with Node, same dual-export pattern as `midi-parser.js`/`piano-roll-geometry.js`. Everything else (requesting the mic, building the Web Audio graph, wiring the fader and meter) is added to `index.html`'s existing inline `<script>`. The mic input is modeled as a **Voz** object — `{stream, source, gainNode, analyser, setGain(), getLevel()}` — held in a new `state.voces` array, per the design spec's forward-looking plan for eventually supporting multiple simultaneous singers: Etapa 2 only ever creates one Voz, but it goes into an array of one rather than loose top-level variables, so a later stage can push more without restructuring this code. The audio graph is `MediaStreamAudioSourceNode → GainNode → AnalyserNode` — the gain sits *before* the analyser, so turning the fader down visibly (and audibly, if this were ever monitored) reduces what the meter reports, directly addressing the ask: control a hot input from inside the app instead of the OS's mic settings.

**Tech Stack:** Vanilla JS, Web Audio API (`getUserMedia`, `MediaStreamAudioSourceNode`, `GainNode`, `AnalyserNode`). No npm, no build, no external libraries — same as Etapa 1.

## Global Constraints

- No external libraries, no npm packages, no build step. The app remains `index.html` + `midi-parser.js` + `piano-roll-geometry.js` + `audio-level.js` (new) — still zero-build, still opens with a double-click.
- Automated tests exist only for pure, DOM-free logic (`audio-level.js`), run with Node's built-in `node --test` / `node:assert/strict` (no npm install).
- `state.voces` is an **array**, not a single top-level mic variable — this is a deliberate, spec-mandated structural choice for future multi-singer support (see [2026-09-09-app-voz-piano-roll-canto-design.md](../specs/2026-09-09-app-voz-piano-roll-canto-design.md), "Diseño para extensibilidad futura", point 1). Etapa 2 only ever populates index 0.
- `getUserMedia`'s browser permission dialog cannot be scripted or automated by any tooling (browser security, same category of limitation as Etapa 1's file-picker). Verify the audio-graph logic (gain control → level meter response) using a **synthetic oscillator-fed `MediaStream`** in place of the real microphone (via `audioContext.createMediaStreamDestination()`) — this exercises every line of `createVoz()`, the gain slider handler, and the meter update loop without needing a real mic or a permission grant. A human with a real microphone must separately confirm the actual `getUserMedia` permission flow; note this plainly in verification reports, don't claim it as tested.
- Testing during development remains desktop-only (Chrome/Firefox/Safari), per the design spec. Continue on the existing branch/worktree from Etapa 1 (`worktree-app-voz-etapa1`) — don't create a new worktree for this plan.

---

### Task 1: Audio level calculation (`audio-level.js`)

**Files:**
- Create: `App voz/audio-level.js`
- Create: `App voz/tests/audio-level.test.js`

**Interfaces:**
- Produces: `computeLevel(byteTimeDomainData: Uint8Array) -> {rms: number, peak: number}`. Input is raw unsigned-byte time-domain samples as returned by `AnalyserNode.getByteTimeDomainData()` (0–255, with 128 representing silence/zero-crossing, per the Web Audio API spec). Both `rms` and `peak` are normalized to the 0–1 range (0 = silence, 1 = full scale). Available as `module.exports.computeLevel` in Node and as a global `computeLevel` function when loaded via `<script src>` in the browser (same dual-export pattern as `midi-parser.js`).

- [ ] **Step 1: Write the failing test**

Create `App voz/tests/audio-level.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { computeLevel } = require('../audio-level.js');

test('computeLevel returns zero for silence (all samples at the 128 midpoint)', () => {
  const silence = new Uint8Array(64).fill(128);
  const { rms, peak } = computeLevel(silence);
  assert.equal(rms, 0);
  assert.equal(peak, 0);
});

test('computeLevel returns ~1.0 peak and rms for a full-scale square wave', () => {
  const square = new Uint8Array(64);
  for (let i = 0; i < square.length; i++) square[i] = i % 2 === 0 ? 0 : 255;
  const { rms, peak } = computeLevel(square);
  assert.ok(Math.abs(peak - 1.0) < 1e-9, `peak ${peak} should be exactly 1.0`);
  assert.ok(rms > 0.99 && rms <= 1.0, `rms ${rms} should be close to 1.0`);
});

test('computeLevel matches expected rms/peak for a known sine wave amplitude', () => {
  const N = 200;
  const amplitude = 0.5;
  const sine = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const t = (2 * Math.PI * i) / N;
    const sample = amplitude * Math.sin(t);
    sine[i] = Math.round(128 + 127 * sample);
  }
  const { rms, peak } = computeLevel(sine);
  const expectedRms = amplitude / Math.sqrt(2);
  assert.ok(Math.abs(rms - expectedRms) < 0.01, `rms ${rms} should be close to ${expectedRms}`);
  assert.ok(Math.abs(peak - amplitude) < 0.02, `peak ${peak} should be close to ${amplitude}`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "App voz" && node --test tests/audio-level.test.js`
Expected: FAIL — `Cannot find module '../audio-level.js'` (the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `App voz/audio-level.js`:

```js
function computeLevel(byteTimeDomainData) {
  let sumSquares = 0;
  let peak = 0;
  for (let i = 0; i < byteTimeDomainData.length; i++) {
    const normalized = (byteTimeDomainData[i] - 128) / 128;
    sumSquares += normalized * normalized;
    const abs = Math.abs(normalized);
    if (abs > peak) peak = abs;
  }
  const rms = Math.sqrt(sumSquares / byteTimeDomainData.length);
  return { rms, peak };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { computeLevel };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "App voz" && node --test tests/audio-level.test.js`
Expected: PASS — 3 tests, 0 failures. (These exact test vectors and tolerances were hand-verified with Node during planning: silence → `{rms:0, peak:0}`; square wave → `{rms:0.9961014092842781, peak:1}`; sine amplitude 0.5 → `{rms:0.35074253335891736, peak:0.5}`, both within the tolerances above of the theoretical `amplitude/√2` and `amplitude`.)

- [ ] **Step 5: Commit**

```bash
git add "App voz/audio-level.js" "App voz/tests/audio-level.test.js"
git commit -m "feat(app-voz): add audio level (RMS/peak) calculation with unit tests"
```

---

### Task 2: Microphone capture, gain fader, and level meter (`index.html`)

**Files:**
- Modify: `App voz/index.html`

**Interfaces:**
- Consumes: `computeLevel` (global, from Task 1's `audio-level.js`, loaded via `<script src="./audio-level.js">`).
- Produces: extends the existing global `state` object with one new field:
  ```js
  state.voces = []; // Array<Voz>, populated on successful mic activation; Etapa 2 only ever has index 0.
  ```
  A `Voz` object has the shape: `{stream: MediaStream, source: MediaStreamAudioSourceNode, gainNode: GainNode, analyser: AnalyserNode, setGain(value: number): void, getLevel(): {rms: number, peak: number}}`. A later stage (multi-singer support) will read `state.voces` as an array and may add more elements — don't special-case `state.voces[0]` anywhere except where Etapa 2's single-mic UI explicitly needs the one active Voz.

- [ ] **Step 1: Add the CSS for the mic controls and level meter**

In `App voz/index.html`, inside the existing `<style>` block, add after the `button:disabled { opacity:0.4; cursor:not-allowed; }` line:

```css
  .mic-controls { display:flex; align-items:center; gap:12px; margin: 16px 0; flex-wrap:wrap; }
  #levelMeterTrack { width:220px; height:16px; background:#1a1d29; border-radius:4px; overflow:hidden; }
  #levelMeterBar { height:100%; width:0%; background:#3ecf6e; transition: width 0.05s linear, background-color 0.1s linear; }
  input[type="range"] { width:160px; }
```

- [ ] **Step 2: Load `audio-level.js` and add the mic controls markup**

In `App voz/index.html`, change this line:

```html
  <script src="./piano-roll-geometry.js"></script>
```

to:

```html
  <script src="./piano-roll-geometry.js"></script>
  <script src="./audio-level.js"></script>
```

Then, right after the existing `#status` div's closing tag (the block containing `#midiStatus` and `#wavStatus`) and before the `<canvas id="pianoRoll">` line, insert:

```html
  <div class="mic-controls">
    <button id="micBtn">Activar micrófono</button>
    <label>Ganancia: <input type="range" id="micGain" min="0" max="2" step="0.01" value="1" disabled></label>
    <div id="levelMeterTrack"><div id="levelMeterBar"></div></div>
  </div>
  <div id="micStatus">Micrófono no activado.</div>
```

- [ ] **Step 3: Add `voces: []` to the state object**

In the inline `<script>`, change the existing `state` object literal from:

```js
    const state = {
      audioContext: new (window.AudioContext || window.webkitAudioContext)(),
      audioBuffer: null,
      notes: [],
      durationSec: 0,
      sourceNode: null,
      playStartTime: 0
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
      voces: []
    };
```

- [ ] **Step 4: Add `createVoz()`**

In the inline `<script>`, right after the `NOTE_COLOR` constant line (`const NOTE_COLOR = '#4a90d9'; // blue — Etapa 1 has no pitch detection yet, every note is blue`) and before `function currentPlaybackTime() {`, add:

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

- [ ] **Step 5: Add the level meter update + loop, the mic button handler, and the gain slider handler**

At the very end of the inline `<script>`, right after the existing line `document.getElementById('playBtn').addEventListener('click', play);` and before the closing `</script>` tag, add:

```js
    function updateLevelMeter(peak) {
      const bar = document.getElementById('levelMeterBar');
      const pct = Math.min(peak, 1) * 100;
      bar.style.width = pct + '%';
      if (peak > 0.9) {
        bar.style.backgroundColor = '#e05a4e';
      } else if (peak > 0.7) {
        bar.style.backgroundColor = '#e0b83e';
      } else {
        bar.style.backgroundColor = '#3ecf6e';
      }
    }

    function micLevelLoop() {
      if (state.voces[0]) {
        const { peak } = state.voces[0].getLevel();
        updateLevelMeter(peak);
      }
      if (state.voces.length > 0) {
        requestAnimationFrame(micLevelLoop);
      }
    }

    document.getElementById('micBtn').addEventListener('click', async () => {
      const micStatus = document.getElementById('micStatus');
      try {
        if (state.audioContext.state === 'suspended') {
          await state.audioContext.resume();
        }
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const voz = createVoz(stream, state.audioContext);
        state.voces.push(voz);
        micStatus.textContent = 'Micrófono activado.';
        document.getElementById('micBtn').disabled = true;
        document.getElementById('micGain').disabled = false;
        requestAnimationFrame(micLevelLoop);
      } catch (err) {
        micStatus.textContent = `Error al activar el micrófono: ${err.message || 'permiso denegado'}`;
      }
    });

    document.getElementById('micGain').addEventListener('input', (e) => {
      if (state.voces[0]) {
        state.voces[0].setGain(parseFloat(e.target.value));
      }
    });
```

- [ ] **Step 6: Manual verification — audio graph and meter, via a synthetic mic substitute**

There is no automated test for this step, and `getUserMedia`'s permission dialog cannot be scripted by any tooling. Instead, verify the graph logic end-to-end with a synthetic signal that bypasses only the `getUserMedia` call — everything downstream (`createVoz`, the gain node, the analyser, the meter loop) is real, unmodified app code:

1. Start a local static file server in `App voz/` (e.g. `python3 -m http.server <port>`) and open `index.html` in a real browser tab (or via browser automation tooling if available — try `ToolSearch` for "browser navigate").
2. In the page's JS console (or via a scripted `javascript_tool`-style execution if using browser automation), run:
   ```js
   const osc = state.audioContext.createOscillator();
   osc.frequency.value = 440;
   const dest = state.audioContext.createMediaStreamDestination();
   osc.connect(dest);
   osc.start();
   const voz = createVoz(dest.stream, state.audioContext);
   state.voces.push(voz);
   requestAnimationFrame(micLevelLoop);
   ```
3. Confirm `document.getElementById('levelMeterBar').style.width` is non-zero and roughly stable (a steady 440Hz tone should settle to a fairly constant peak/width, not stay at 0%).
4. Run `voz.setGain(2)` and confirm the bar's width increases (moves toward 100%) and its color transitions toward amber/red as `peak` crosses 0.7 and 0.9 — this proves the fader actually attenuates/boosts what the meter reports, which is the whole point of this stage.
5. Run `voz.setGain(0.05)` and confirm the bar shrinks back down and returns to green.
6. Confirm no console errors were produced by any of this.
7. Note plainly in your report that this verifies the audio graph and UI, but that the actual `#micBtn` click → `getUserMedia` → real browser permission-prompt → real microphone path was **not** exercised by this synthetic test, and needs a human with a real microphone to confirm separately.
8. Stop the server and close any tabs you opened.

- [ ] **Step 7: Commit**

```bash
git add "App voz/index.html"
git commit -m "feat(app-voz): add microphone capture with gain fader and level meter"
```
