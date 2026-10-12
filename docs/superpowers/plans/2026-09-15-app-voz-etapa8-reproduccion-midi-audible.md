# App voz — Etapa 8: Reproducción audible del MIDI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user hear the MIDI as a sung reference guide — not just see it in the piano roll — by playing a single sampled note (a WAV the user loads, exported from a real instrument recording) pitch-shifted to cover every note in the song, scheduled all at once at "Reproducir" time exactly like the existing metronome.

**Architecture:** One new pure function (`playbackRateForNote`, added to the existing `note-utils.js`, same file as the other pitch-conversion helpers) computes the `playbackRate` needed to retune a loaded sample to any MIDI note. `index.html` gains a new file input for the sample, a reference-note number input, and a "Reproducir MIDI" checkbox that follows the exact same pattern the metronome already established in Etapa 5: decided once at `play()` time, every note scheduled up front via `AudioBufferSourceNode.start(when)`/`.stop(when)` — no lookahead scheduler needed, Web Audio's own clock is sample-accurate regardless of JS timing. Like the metronome and the success blip, this connects straight to `audioContext.destination`, never through `state.wavGainNode` — muting the WAV reference track must never affect it.

**Tech Stack:** Vanilla JS, Web Audio API (`AudioBufferSourceNode.playbackRate`, `GainNode` for a short fade-out). No npm, no build, no external libraries — same as prior etapas.

## Global Constraints

- No external libraries, no npm packages, no build step. The app remains `index.html` + the existing eight pure `.js` files — still zero-build, still opens with a double-click (or via a local static server for browser-tool verification, same as every prior etapa).
- Automated tests exist only for pure, DOM-free logic (`node --test tests/*.test.js` from `App voz/`). Everything that touches `state`, Web Audio, or file loading is verified manually in a real browser, same established pattern as Etapas 1-7.
- **The instrument sample is loaded fresh every session via a normal `<input type="file">`, exactly like the existing MIDI/WAV inputs.** It is never embedded in the repository or committed — this sidesteps any licensing question about where the user's sample came from, and matches how every other user-supplied file already works in this app.
- **`playbackRateForNote(targetMidi, referenceMidi) -> number`** is `2 ** ((targetMidi - referenceMidi) / 12)` — the standard equal-tempered pitch-shift ratio. Pure, no DOM, no audio — just the formula.
- **The "Reproducir MIDI" checkbox is decided once, at the moment "Reproducir" is clicked** — toggling it mid-song has no effect until the next "Reproducir" click. Same deliberate simplification the metronome checkbox already uses (confirmed with the user during Etapa 5, reused here without re-litigating it).
- **The sampled notes connect directly to `audioContext.destination`**, bypassing `state.wavGainNode` entirely — muting the WAV reference track (Etapa 5) must never silence this guide, same structural independence the metronome and success blip already have.
- **The sample plays from its own start, untouched by any loop points** — for a MIDI note of duration `durationSec`, the source is started at the note's scheduled time and stopped `durationSec` later (plus a short linear fade-out over `INSTRUMENT_FADE_SEC = 0.02` seconds immediately before the stop, to avoid an audible click from cutting the waveform off mid-cycle).
- **Both `stopPlayback()` (the Etapa 6 auto-stop path) and `play()`'s own restart path must stop and clear `state.instrumentNodes`**, exactly mirroring how both already handle `state.metronomeNodes` — every path that ends a playthrough must leave the sampled-note nodes in the same consistent state as the metronome nodes.
- Continue on the existing branch/worktree from prior etapas (`worktree-app-voz-etapa1`) — don't create a new worktree for this plan.
- This stage does not change `midi-parser.js`, `piano-roll-geometry.js`, `note-tuning.js`, `silence-guard.js`, `latency-calibration.js`, or any of their tests — only additive changes to `note-utils.js` and `index.html`.

---

### Task 1: `playbackRateForNote` pure function (`note-utils.js`)

**Files:**
- Modify: `App voz/note-utils.js`
- Modify: `App voz/tests/note-utils.test.js`

**Interfaces:**
- Produces: `playbackRateForNote(targetMidi, referenceMidi) -> number` — the `AudioBufferSourceNode.playbackRate` value that retunes a sample recorded at `referenceMidi` to sound like `targetMidi`. Returns `1` when they're equal, `2` for an octave up, `0.5` for an octave down.

- [ ] **Step 1: Write the failing tests**

In `App voz/tests/note-utils.test.js`, change the require line from:

```js
const { frequencyToMidi, midiToNoteName, describePitch } = require('../note-utils.js');
```

to:

```js
const { frequencyToMidi, midiToNoteName, describePitch, playbackRateForNote } = require('../note-utils.js');
```

Then add these tests at the end of the file:

```js

test('playbackRateForNote returns 1 when the target note matches the reference', () => {
  assert.equal(playbackRateForNote(60, 60), 1);
});

test('playbackRateForNote doubles for an octave up and halves for an octave down', () => {
  assert.equal(playbackRateForNote(72, 60), 2);
  assert.equal(playbackRateForNote(48, 60), 0.5);
});

test('playbackRateForNote matches the equal-tempered ratio for a non-octave interval', () => {
  const result = playbackRateForNote(67, 60); // perfect fifth up
  assert.ok(Math.abs(result - 1.4983070768766815) < 1e-9);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "App voz" && node --test tests/note-utils.test.js`
Expected: FAIL — `playbackRateForNote` is `undefined`.

- [ ] **Step 3: Write the implementation**

In `App voz/note-utils.js`, change:

```js
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

to:

```js
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

function playbackRateForNote(targetMidi, referenceMidi) {
  return Math.pow(2, (targetMidi - referenceMidi) / 12);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { frequencyToMidi, midiToNoteName, describePitch, playbackRateForNote };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "App voz" && node --test tests/note-utils.test.js`
Expected: PASS — 8 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add "App voz/note-utils.js" "App voz/tests/note-utils.test.js"
git commit -m "feat(app-voz): add playbackRateForNote pure function"
```

---

### Task 2: Load the instrument sample (`index.html`)

**Files:**
- Modify: `App voz/index.html`

**Interfaces:**
- Produces: `state.instrumentSample` (`AudioBuffer | null`, decoded from the loaded file) and `state.instrumentReferenceMidi` (`number`, default `60`, updated live as the user edits the reference-note field).

- [ ] **Step 1: Add the instrument file input and reference-note field**

In the HTML, change:

```html
  <div class="controls">
    <label>MIDI: <input type="file" id="midiInput" accept=".mid,.midi"></label>
    <label>WAV: <input type="file" id="wavInput" accept=".wav"></label>
    <button id="playBtn">Reproducir</button>
    <label><input type="checkbox" id="muteWavCheckbox"> Silenciar pista</label>
    <label><input type="checkbox" id="metronomeCheckbox"> Metrónomo</label>
  </div>
```

to:

```html
  <div class="controls">
    <label>MIDI: <input type="file" id="midiInput" accept=".mid,.midi"></label>
    <label>WAV: <input type="file" id="wavInput" accept=".wav"></label>
    <label>Instrumento: <input type="file" id="instrumentInput" accept=".wav"></label>
    <label>Nota de referencia: <input type="number" id="instrumentReferenceNote" min="0" max="127" value="60"></label>
    <button id="playBtn">Reproducir</button>
    <label><input type="checkbox" id="muteWavCheckbox"> Silenciar pista</label>
    <label><input type="checkbox" id="metronomeCheckbox"> Metrónomo</label>
  </div>
```

Then change:

```html
  <div id="status">
    <div id="midiStatus">Sin MIDI cargado.</div>
    <div id="wavStatus">Sin WAV cargado.</div>
    <div id="playbackStatus"></div>
  </div>
```

to:

```html
  <div id="status">
    <div id="midiStatus">Sin MIDI cargado.</div>
    <div id="wavStatus">Sin WAV cargado.</div>
    <div id="instrumentStatus">Sin instrumento cargado.</div>
    <div id="playbackStatus"></div>
  </div>
```

- [ ] **Step 2: Add `instrumentSample` and `instrumentReferenceMidi` to `state`**

Change:

```js
      lastSignalTime: 0,
      pitchHistory: [],
      latencyOffsetSec: 0,
      calibration: null
    };
```

to:

```js
      lastSignalTime: 0,
      pitchHistory: [],
      latencyOffsetSec: 0,
      calibration: null,
      instrumentSample: null,
      instrumentReferenceMidi: 60
    };
```

- [ ] **Step 3: Wire up the file input and the reference-note field**

Change:

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

    async function play() {
```

to:

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

    document.getElementById('instrumentInput').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const arrayBuffer = await file.arrayBuffer();
        state.instrumentSample = await state.audioContext.decodeAudioData(arrayBuffer);
        document.getElementById('instrumentStatus').textContent =
          `Instrumento cargado: ${state.instrumentSample.duration.toFixed(2)}s`;
      } catch (err) {
        state.instrumentSample = null;
        document.getElementById('instrumentStatus').textContent =
          `Error al cargar el instrumento: ${err.message || 'Archivo de audio inválido'}`;
      }
    });

    document.getElementById('instrumentReferenceNote').addEventListener('input', (e) => {
      const value = parseInt(e.target.value, 10);
      if (Number.isFinite(value)) {
        state.instrumentReferenceMidi = value;
      }
    });

    async function play() {
```

- [ ] **Step 4: Manual verification**

No automated test — file loading and `state` bookkeeping, verified in a real browser per this app's established pattern.

1. Start a local static server in `App voz/` (`python3 -m http.server <puerto>`), open `index.html` in the browser tool.
2. Run this in the page via `javascript_exec` (loads the existing WAV test fixture as a stand-in "instrument" — its actual sound doesn't matter for this check, only that it decodes):

```js
const wavBuf = await fetch('./tests/fixtures/sample.wav').then(r => r.arrayBuffer());
const file = new File([wavBuf], 'sample.wav', { type: 'audio/wav' });
const dt = new DataTransfer();
dt.items.add(file);
document.getElementById('instrumentInput').files = dt.files;
document.getElementById('instrumentInput').dispatchEvent(new Event('change'));
await new Promise(r => setTimeout(r, 100));

document.getElementById('instrumentReferenceNote').value = '67';
document.getElementById('instrumentReferenceNote').dispatchEvent(new Event('input'));

JSON.stringify({
  hasSample: state.instrumentSample !== null,
  sampleDuration: state.instrumentSample ? Number(state.instrumentSample.duration.toFixed(2)) : null,
  referenceMidi: state.instrumentReferenceMidi,
  statusText: document.getElementById('instrumentStatus').textContent
});
```

3. Confirm `hasSample` is `true`, `sampleDuration` matches the fixture's real duration (>0), `referenceMidi` is `67`, and `statusText` reads `"Instrumento cargado: ...s"`.
4. Confirm no console errors. Stop the server and close any tabs you opened.

- [ ] **Step 5: Commit**

```bash
git add "App voz/index.html"
git commit -m "feat(app-voz): load an instrument sample and its reference MIDI note"
```

---

### Task 3: Schedule and play the sampled notes (`index.html`)

**Files:**
- Modify: `App voz/index.html`

**Interfaces:**
- Consumes: `playbackRateForNote` (Task 1, `note-utils.js`), `state.instrumentSample`/`state.instrumentReferenceMidi` (Task 2).
- Produces: `state.instrumentNodes` (`AudioBufferSourceNode[]`, the currently-scheduled sampled notes for the in-progress playthrough), `playInstrumentNote(audioContext, buffer, playbackRate, when, durationSec)`, and the `INSTRUMENT_FADE_SEC = 0.02` constant.

- [ ] **Step 1: Add `instrumentNodes` to `state` and the fade-out constant**

Change:

```js
      calibration: null,
      instrumentSample: null,
      instrumentReferenceMidi: 60
    };
```

to:

```js
      calibration: null,
      instrumentSample: null,
      instrumentReferenceMidi: 60,
      instrumentNodes: []
    };
```

Then change:

```js
    const CALIBRATION_DEAD_ZONE_SEC = 0.05;
```

to:

```js
    const CALIBRATION_DEAD_ZONE_SEC = 0.05;
    const INSTRUMENT_FADE_SEC = 0.02;
```

- [ ] **Step 2: Add the "Reproducir MIDI" checkbox**

In the HTML, change:

```html
    <label><input type="checkbox" id="metronomeCheckbox"> Metrónomo</label>
  </div>
```

to:

```html
    <label><input type="checkbox" id="metronomeCheckbox"> Metrónomo</label>
    <label><input type="checkbox" id="playMidiCheckbox"> Reproducir MIDI</label>
  </div>
```

- [ ] **Step 3: Add `playInstrumentNote()`**

Change:

```js
    function playMetronomeClick(audioContext, when) {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = 'square';
      osc.frequency.value = 1000;
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(0.15, when + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.03);
      osc.connect(gain);
      gain.connect(audioContext.destination);
      osc.start(when);
      osc.stop(when + 0.04);
      return osc;
    }
```

to:

```js
    function playMetronomeClick(audioContext, when) {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = 'square';
      osc.frequency.value = 1000;
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(0.15, when + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.03);
      osc.connect(gain);
      gain.connect(audioContext.destination);
      osc.start(when);
      osc.stop(when + 0.04);
      return osc;
    }

    function playInstrumentNote(audioContext, buffer, playbackRate, when, durationSec) {
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = playbackRate;
      const gain = audioContext.createGain();
      source.connect(gain);
      gain.connect(audioContext.destination);
      const stopTime = when + durationSec;
      const fadeStart = Math.max(when, stopTime - INSTRUMENT_FADE_SEC);
      gain.gain.setValueAtTime(1, fadeStart);
      gain.gain.linearRampToValueAtTime(0.0001, stopTime);
      source.start(when);
      source.stop(stopTime + 0.01);
      return source;
    }
```

- [ ] **Step 4: Clean up and schedule from `play()`**

Change:

```js
      state.metronomeNodes.forEach((osc) => {
        try { osc.stop(); } catch (err) { /* already stopped, ignore */ }
      });
      state.metronomeNodes = [];
      state.frozenTime = null;
```

to:

```js
      state.metronomeNodes.forEach((osc) => {
        try { osc.stop(); } catch (err) { /* already stopped, ignore */ }
      });
      state.metronomeNodes = [];
      state.instrumentNodes.forEach((node) => {
        try { node.stop(); } catch (err) { /* already stopped, ignore */ }
      });
      state.instrumentNodes = [];
      state.frozenTime = null;
```

Then change:

```js
      if (document.getElementById('metronomeCheckbox').checked) {
        state.beats.forEach((beatTime) => {
          const osc = playMetronomeClick(state.audioContext, state.playStartTime + beatTime);
          state.metronomeNodes.push(osc);
        });
      }
    }
```

to:

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
    }
```

- [ ] **Step 5: Clean up `state.instrumentNodes` on auto-stop too**

`stopPlayback()` (the Etapa 6 auto-stop path) must leave `state.instrumentNodes` in the same clean state `play()` does — otherwise a sung guide note could keep sounding after the app decides to stop everything else for silence. Change:

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
      state.instrumentNodes.forEach((node) => {
        try { node.stop(); } catch (err) { /* already stopped, ignore */ }
      });
      state.instrumentNodes = [];
      document.getElementById('playbackStatus').textContent = reason;
    }
```

- [ ] **Step 6: Manual verification**

No automated test — Web Audio scheduling, verified in a real browser. Same harness note as prior etapas applies if your script drives `mainLoop()` or waits on real elapsed time: this browser-automation tab reports `document.visibilityState: "visible"` even unfocused, so if you need to isolate manual frame-driving from background `requestAnimationFrame`, neutralize `window.requestAnimationFrame` temporarily (save the original, restore it after).

1. Start a local static server in `App voz/`, open `index.html`.
2. Run this in the page via `javascript_exec` (loads the two-note MIDI fixture, the WAV fixture as both the reference track and the "instrument" sample, ticks "Reproducir MIDI", plays, and checks the scheduled nodes):

```js
const midiBuf = await fetch('./tests/fixtures/sample.mid').then(r => r.arrayBuffer());
const wavBuf = await fetch('./tests/fixtures/sample.wav').then(r => r.arrayBuffer());
const { notes, durationSec, beats } = parseMidi(midiBuf);
state.notes = notes;
state.durationSec = durationSec;
state.beats = beats;
resetNoteProgress();
state.audioBuffer = await state.audioContext.decodeAudioData(wavBuf.slice(0));
state.instrumentSample = await state.audioContext.decodeAudioData(wavBuf.slice(0));
state.instrumentReferenceMidi = 60;

document.getElementById('playMidiCheckbox').checked = true;
await play();

const expectedRates = state.notes.map(n => playbackRateForNote(n.pitch, state.instrumentReferenceMidi));
const actualRates = state.instrumentNodes.map(n => n.playbackRate.value);

const firstRunCount = state.instrumentNodes.length;

// A second "Reproducir" must clear and repopulate, not accumulate.
await play();
const secondRunCount = state.instrumentNodes.length;

// Unchecking before "Reproducir" must leave it empty.
document.getElementById('playMidiCheckbox').checked = false;
await play();
const uncheckedCount = state.instrumentNodes.length;

// stopPlayback must also clear it.
document.getElementById('playMidiCheckbox').checked = true;
await play();
const beforeStop = state.instrumentNodes.length;
stopPlayback('test stop');
const afterStop = state.instrumentNodes.length;

JSON.stringify({ firstRunCount, expectedRates, actualRates, secondRunCount, uncheckedCount, beforeStop, afterStop });
```

3. Confirm `firstRunCount` and `secondRunCount` both equal `state.notes.length` (2 for this fixture), `actualRates` matches `expectedRates` element-for-element, `uncheckedCount` is `0`, `beforeStop` is `2`, and `afterStop` is `0`.
4. Confirm no console errors throughout. Stop the server and close any tabs you opened.

- [ ] **Step 7: Commit**

```bash
git add "App voz/index.html"
git commit -m "feat(app-voz): play the MIDI as a sampled, pitch-shifted reference guide"
```
