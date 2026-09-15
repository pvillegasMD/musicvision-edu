# App voz — Etapa 5: Mutear WAV + Metrónomo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user practice without the WAV reference track (a "Silenciar pista" checkbox) and/or with a metronome click on every MIDI beat (a "Metrónomo" checkbox). Independent of each other and of the tuning/coloring system from Etapa 4 — this stage doesn't touch `note-tuning.js`, `state.noteProgress`, or `renderPianoRoll`'s coloring logic at all.

**Architecture:** `midi-parser.js` (already shipped, Etapa 1) gains one more field on its return value — `beats: number[]`, the exact-second timestamp of every MIDI beat, reusing the tempo map machinery `parseMidi` already has internally for tick→seconds conversion. `index.html` gains a persistent `GainNode` sitting between the WAV's `AudioBufferSourceNode` and the speakers (so muting is just setting its gain to 0, live, no need to restart playback), and a metronome that schedules every beat's click **up front, all at once**, at the exact moment "Reproducir" is clicked — using `AudioScheduledSourceNode.start(when)` with a precise future `AudioContext` time for each click. This deliberately avoids needing a lookahead/just-in-time scheduler (the kind Etapa 1 explicitly said would only be needed for discrete scheduled events): Web Audio's own internal clock keeps `start(when)` sample-accurate regardless of JavaScript timing jitter, so scheduling everything once at play-time is sufficient.

**Tech Stack:** Vanilla JS, Web Audio API (`GainNode`, `OscillatorNode.start(when)`). No npm, no build, no external libraries — same as prior etapas.

## Global Constraints

- No external libraries, no npm packages, no build step. The app remains `index.html` + `midi-parser.js` (modified) + `piano-roll-geometry.js` + `audio-level.js` + `pitch-detection.js` + `note-utils.js` + `note-tuning.js` — still zero-build, still opens with a double-click.
- Automated tests exist only for pure, DOM-free logic. `midi-parser.js`'s existing test file gets one more test case for `beats`; there is no automated test for the mute toggle or the metronome scheduling (both are Web Audio/DOM behavior, verified manually per prior etapas' established pattern).
- Muting is **live** — toggling the checkbox takes effect immediately, whether or not the WAV is currently playing, with no need to click "Reproducir" again.
- The metronome's on/off state is decided **once, at the moment "Reproducir" is clicked** — toggling the checkbox mid-song has no effect until the next "Reproducir" click. This is a deliberate scope simplification (confirmed with the user during design) to avoid needing to cancel/reschedule already-scheduled clicks mid-playback.
- The metronome click must remain audible even when the WAV is muted, and the WAV mute must not affect the metronome or the existing success-blip sound (`playSuccessBlip`) — mute only ever touches the WAV's own audio path.
- This stage does not touch `note-tuning.js`, `state.noteProgress`, `state.activeNoteIndex/Color`, or any of `renderPianoRoll`'s coloring branches from Etapa 4.
- Continue on the existing branch/worktree from prior etapas (`worktree-app-voz-etapa1`) — don't create a new worktree for this plan.

---

### Task 1: Expose beat timestamps from the MIDI parser (`midi-parser.js`)

**Files:**
- Modify: `App voz/midi-parser.js`
- Modify: `App voz/tests/midi-parser.test.js`

**Interfaces:**
- Produces: `parseMidi(buffer)`'s return value gains one field: `{notes, durationSec, beats}`, where `beats: number[]` is the timestamp in seconds of every beat from tick `0` (inclusive) up to and including the first beat at or after `durationSec`. `notes` and `durationSec` are unchanged in shape and behavior — this is a strictly additive change, existing callers destructuring only `{notes, durationSec}` are unaffected.

- [ ] **Step 1: Write the failing test**

In `App voz/tests/midi-parser.test.js`, add this test after the existing two (don't modify the existing tests):

```js
test('parseMidi exposes beat timestamps derived from ticksPerBeat and the tempo map', () => {
  const result = parseMidi(SAMPLE_MIDI_BYTES.buffer);
  assert.equal(result.beats.length, 3);
  assert.ok(Math.abs(result.beats[0] - 0) < 1e-9);
  assert.ok(Math.abs(result.beats[1] - 0.5) < 1e-9);
  assert.ok(Math.abs(result.beats[2] - 1.0) < 1e-9);
});
```

(This reuses the existing `SAMPLE_MIDI_BYTES` constant already defined at the top of this test file — don't redefine it. The fixture is 480 ticks/beat at the default tempo of 120 BPM, i.e. 0.5s/beat, with two notes spanning 0–1.0s total, so beats fall exactly at 0, 0.5, and 1.0 seconds.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "App voz" && node --test tests/midi-parser.test.js`
Expected: FAIL — `result.beats` is `undefined`, so `result.beats.length` throws a `TypeError`.

- [ ] **Step 3: Write the implementation**

In `App voz/midi-parser.js`, change:

```js
  const durationSec = notes.reduce((max, n) => Math.max(max, n.start + n.duration), 0);
  return { notes, durationSec };
}
```

to:

```js
  const durationSec = notes.reduce((max, n) => Math.max(max, n.start + n.duration), 0);

  const beats = [];
  let beatTick = 0;
  const maxBeats = 100000; // safety cap against a corrupt/degenerate tempo map
  while (beats.length < maxBeats) {
    const t = tickToSeconds(beatTick);
    if (beats.length > 0 && t > durationSec) break;
    beats.push(t);
    beatTick += ticksPerBeat;
  }

  return { notes, durationSec, beats };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "App voz" && node --test tests/midi-parser.test.js`
Expected: PASS — 3 tests, 0 failures. (Hand-verified during planning: for the fixture's bytes, `beats` is exactly `[0, 0.5, 1]`.)

- [ ] **Step 5: Commit**

```bash
git add "App voz/midi-parser.js" "App voz/tests/midi-parser.test.js"
git commit -m "feat(app-voz): expose beat timestamps from the MIDI parser"
```

---

### Task 2: Mute the WAV reference track (`index.html`)

**Files:**
- Modify: `App voz/index.html`

**Interfaces:**
- Produces: `state.wavGainNode` — a `GainNode` created once at page load, connected to `state.audioContext.destination`, that every `AudioBufferSourceNode` created by `play()` connects through instead of connecting to `destination` directly. Its `.gain.value` is `0` when muted, `1` otherwise.

- [ ] **Step 1: Create the persistent WAV gain node**

Right after the `const state = {...}` object literal closes (before `const PIXELS_PER_SECOND = 150;`), add:

```js
    state.wavGainNode = state.audioContext.createGain();
    state.wavGainNode.connect(state.audioContext.destination);
```

- [ ] **Step 2: Route WAV playback through it**

In `play()`, change:

```js
      node.connect(state.audioContext.destination);
```

to:

```js
      node.connect(state.wavGainNode);
```

(Nothing else in `play()` changes for this step — `playSuccessBlip` and, later in this plan, the metronome click still connect directly to `state.audioContext.destination`, unaffected by this gain node.)

- [ ] **Step 3: Add the mute checkbox and wire it up**

In the HTML, inside the existing `.controls` div, right after the `<button id="playBtn">Reproducir</button>` line, add:

```html
    <label><input type="checkbox" id="muteWavCheckbox"> Silenciar pista</label>
```

Then, right after the existing `document.getElementById('playBtn').addEventListener('click', play);` line, add:

```js
    document.getElementById('muteWavCheckbox').addEventListener('change', (e) => {
      state.wavGainNode.gain.value = e.target.checked ? 0 : 1;
    });
```

- [ ] **Step 4: Manual verification**

There is no automated test for this step — it's Web Audio graph wiring, verified via state inspection in a real browser (this app's established pattern for anything that can't be unit-tested).

1. Start a local static server in `App voz/` (`python3 -m http.server <port>`), open `index.html` (or via browser automation — try `ToolSearch` for "browser navigate").
2. Load `tests/fixtures/sample.wav`. Confirm `state.wavGainNode.gain.value === 1` initially (checkbox unchecked by default).
3. Click "Reproducir". Confirm no console errors, and that `state.sourceNode` exists and is connected (the graph wiring itself isn't directly inspectable via a public API, but the absence of errors and continued normal playback — verified by `currentPlaybackTime()` advancing — confirms the connection succeeded).
4. Check the "Silenciar pista" checkbox mid-playback. Confirm `state.wavGainNode.gain.value` becomes `0` immediately (no need to stop/restart playback).
5. Uncheck it. Confirm `state.wavGainNode.gain.value` returns to `1`.
6. Confirm no console errors throughout. Stop the server and close any tabs you opened.

- [ ] **Step 5: Commit**

```bash
git add "App voz/index.html"
git commit -m "feat(app-voz): add a live mute toggle for the WAV reference track"
```

---

### Task 3: Metronome (`index.html`)

**Files:**
- Modify: `App voz/index.html`

**Interfaces:**
- Consumes: `beats` (from Task 1's `parseMidi(buffer)` return value).
- Produces: `state.beats` (`number[]`, the currently-loaded MIDI's beat timestamps in seconds) and `state.metronomeNodes` (`OscillatorNode[]`, the currently-scheduled metronome clicks for the in-progress playthrough, so they can be stopped if playback restarts before they finish). Also `playMetronomeClick(audioContext, when)`, following the same shape as the existing `playSuccessBlip(audioContext)`.

- [ ] **Step 1: Add `beats` and `metronomeNodes` to `state`**

Change the `state` object literal from:

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
      metronomeNodes: []
    };
```

- [ ] **Step 2: Store `beats` when a MIDI file loads**

In the `midiInput` `change` handler, change:

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

to:

```js
      try {
        const buffer = await file.arrayBuffer();
        const { notes, durationSec, beats } = parseMidi(buffer);
        state.notes = notes;
        state.durationSec = durationSec;
        state.beats = beats;
        resetNoteProgress();
        document.getElementById('midiStatus').textContent =
          `MIDI cargado: ${notes.length} notas, duración ${durationSec.toFixed(2)}s`;
        renderPianoRoll();
      } catch (err) {
        state.notes = [];
        state.durationSec = 0;
        state.beats = [];
        resetNoteProgress();
        document.getElementById('midiStatus').textContent =
          `Error al cargar el MIDI: ${err.message || 'Archivo MIDI inválido'}`;
        renderPianoRoll();
      }
```

- [ ] **Step 3: Add the metronome checkbox**

In the HTML, right after the mute checkbox added in Task 2 (`<label><input type="checkbox" id="muteWavCheckbox"> Silenciar pista</label>`), add:

```html
    <label><input type="checkbox" id="metronomeCheckbox"> Metrónomo</label>
```

- [ ] **Step 4: Add `playMetronomeClick()`**

Right after `playSuccessBlip()`'s closing brace and before `renderPianoRoll();`, add:

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

- [ ] **Step 5: Schedule clicks from `play()`**

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
      state.frozenTime = null;
      resetNoteProgress();
      const node = state.audioContext.createBufferSource();
      node.buffer = state.audioBuffer;
      node.connect(state.wavGainNode);
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
      state.metronomeNodes.forEach((osc) => {
        try { osc.stop(); } catch (err) { /* already stopped, ignore */ }
      });
      state.metronomeNodes = [];
      state.frozenTime = null;
      resetNoteProgress();
      const node = state.audioContext.createBufferSource();
      node.buffer = state.audioBuffer;
      node.connect(state.wavGainNode);
      state.sourceNode = node;
      state.playStartTime = state.audioContext.currentTime;
      node.start();
      node.onended = () => {
        if (state.sourceNode === node) {
          state.frozenTime = state.audioContext.currentTime - state.playStartTime;
          state.sourceNode = null;
        }
      };
      if (document.getElementById('metronomeCheckbox').checked) {
        state.beats.forEach((beatTime) => {
          const osc = playMetronomeClick(state.audioContext, state.playStartTime + beatTime);
          state.metronomeNodes.push(osc);
        });
      }
    }
```

(The `try/catch` around `osc.stop()` during cleanup guards against calling `stop()` on a click that already finished playing naturally — harmless either way, this just avoids a spurious console error.)

- [ ] **Step 6: Manual verification**

No automated test — verify with a real browser, same constraints as Task 2 (Web Audio scheduling isn't directly inspectable, verify via state/counts and absence of errors).

1. Start a local static server in `App voz/`, open `index.html`, load `tests/fixtures/sample.mid` (which has exactly 3 beats: 0, 0.5, 1.0 — per Task 1) and `tests/fixtures/sample.wav`.
2. Confirm `state.beats` is `[0, 0.5, 1]` after loading.
3. Check the "Metrónomo" checkbox, then click "Reproducir". Immediately after, confirm `state.metronomeNodes.length === 3`.
4. Let playback finish naturally. Confirm no console errors (in particular, no error from any click's internal `stop()` call at its scheduled end).
5. Click "Reproducir" again with the checkbox still checked. Confirm `state.metronomeNodes.length === 3` again (a fresh set, the old array was cleared and repopulated) and no console errors from stopping the previous (already-finished) clicks.
6. Uncheck "Metrónomo", click "Reproducir" again. Confirm `state.metronomeNodes.length === 0`.
7. Re-check "Metrónomo" and confirm the mute checkbox from Task 2 has no effect on the metronome: mute the WAV, play with the metronome checked, confirm `state.metronomeNodes.length === 3` is unaffected by `state.wavGainNode.gain.value` being `0` (they're independent audio paths — this can't be "heard" in this environment, but confirm no code path in `playMetronomeClick` references `state.wavGainNode` at all, i.e. the independence is structural, not just coincidental).
8. Confirm no console errors throughout. Stop the server and close any tabs you opened.

- [ ] **Step 7: Commit**

```bash
git add "App voz/index.html"
git commit -m "feat(app-voz): add a metronome that clicks on every MIDI beat"
```
