# App voz — Cambiador de octava Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a voice-type selector to "App voz" that transposes the loaded MIDI's notes down one or two octaves (male voice / bass-baritone), so the piano roll, the live mic comparison, and the audible instrument guide all judge/render against the transposed pitch instead of the original.

**Architecture:** `state.originalNotes` stores the MIDI exactly as parsed (untransposed). `state.notes` — already consumed everywhere in the app (piano roll rendering, live pitch comparison, instrument playback rate) — becomes a derived value: `transposeNotes(state.originalNotes, semitones)`. A new `<select>` control lets the user pick the semitone offset; changing it recomputes `state.notes` on the spot. The select is disabled during active playback, mirroring the existing pattern for `#calibrateBtn`.

**Tech Stack:** Vanilla JS, no build step. Tests run with `node --test` against pure functions exported via `module.exports`. Manual browser verification via a local `python3 -m http.server` and the `mcp__Claude_Browser__*` tools (same pattern used in prior etapas).

## Global Constraints

- No build step, no npm, no external libraries — hand-written JS only, consistent with the rest of the repo (`CLAUDE.md`).
- Every file exports pure functions via `module.exports` guarded by `typeof module !== 'undefined' && module.exports`, so both `node --test` and the plain `<script>` browser global work.
- Default behavior must be unchanged for anyone who never touches the new selector (0 semitones = current behavior, byte-for-byte).
- Spec: `docs/superpowers/specs/2026-09-15-app-voz-cambiador-octava-design.md`.

---

### Task 1: `transposeNotes` pure function

**Files:**
- Modify: `App voz/note-utils.js`
- Test: `App voz/tests/note-utils.test.js`

**Interfaces:**
- Produces: `transposeNotes(notes, semitones) -> Array<{pitch: number, start: number, duration: number, ...}>` — returns a **new** array of **new** note objects (does not mutate the input), each with `pitch` shifted by `semitones`; all other properties (`start`, `duration`, and any others a note object carries) are copied unchanged via spread.

- [ ] **Step 1: Write the failing tests**

Append to `App voz/tests/note-utils.test.js` (add `transposeNotes` to the existing `require` destructure on line 3):

```js
const { frequencyToMidi, midiToNoteName, describePitch, playbackRateForNote, transposeNotes } = require('../note-utils.js');
```

Then add these tests at the end of the file:

```js
test('transposeNotes shifts pitch by the given semitones and leaves start/duration untouched', () => {
  const notes = [{ pitch: 60, start: 0, duration: 1 }, { pitch: 64, start: 1, duration: 0.5 }];
  const result = transposeNotes(notes, -12);
  assert.deepEqual(result, [
    { pitch: 48, start: 0, duration: 1 },
    { pitch: 52, start: 1, duration: 0.5 }
  ]);
});

test('transposeNotes with 0 semitones returns equivalent notes', () => {
  const notes = [{ pitch: 60, start: 0, duration: 1 }];
  const result = transposeNotes(notes, 0);
  assert.deepEqual(result, notes);
});

test('transposeNotes does not mutate the input array or its notes', () => {
  const notes = [{ pitch: 60, start: 0, duration: 1 }];
  const original = JSON.parse(JSON.stringify(notes));
  transposeNotes(notes, -24);
  assert.deepEqual(notes, original);
});

test('transposeNotes handles an empty array', () => {
  assert.deepEqual(transposeNotes([], -12), []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test "App voz/tests/note-utils.test.js"`
Expected: FAIL — `transposeNotes is not a function` (or `undefined`).

- [ ] **Step 3: Implement `transposeNotes`**

In `App voz/note-utils.js`, add the function after `playbackRateForNote` (before the `module.exports` block):

```js
function transposeNotes(notes, semitones) {
  return notes.map((note) => ({ ...note, pitch: note.pitch + semitones }));
}
```

Update the `module.exports` line to include it:

```js
module.exports = { frequencyToMidi, midiToNoteName, describePitch, playbackRateForNote, transposeNotes };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test "App voz/tests/note-utils.test.js"`
Expected: PASS, all tests including the 4 new ones.

- [ ] **Step 5: Commit**

```bash
git add "App voz/note-utils.js" "App voz/tests/note-utils.test.js"
git commit -m "feat(app-voz): add transposeNotes pure function"
```

---

### Task 2: Voice-type selector wired into the app

**Files:**
- Modify: `App voz/index.html`

**Interfaces:**
- Consumes: `transposeNotes(notes, semitones)` from Task 1 (already loaded via `<script src="./note-utils.js">`, confirm this script tag exists near the other `<script src="./...">` tags before `<script>` with the inline app logic; if it's missing, add `<script src="./note-utils.js"></script>` alongside the others).

- [ ] **Step 1: Add the `<select>` control to the HTML**

In `App voz/index.html`, in the `.controls` div, right after the MIDI file input (around line 22), add:

```html
    <label>MIDI: <input type="file" id="midiInput" accept=".mid,.midi"></label>
    <label>Tipo de voz:
      <select id="voiceTypeSelect">
        <option value="0" selected>Original (sin transportar)</option>
        <option value="-12">Voz masculina (-1 octava)</option>
        <option value="-24">Bajo/Barítono (-2 octavas)</option>
      </select>
    </label>
```

- [ ] **Step 2: Add `originalNotes` to `state`**

In the `state` object literal (around line 58-82), add a new field right after `notes: []`:

```js
      notes: [],
      originalNotes: [],
```

- [ ] **Step 3: Update the MIDI load handler to populate both fields**

Find the `midiInput` `change` handler (around line 309-331). Replace the success branch's note assignment:

```js
        const { notes, durationSec, beats } = parseMidi(buffer);
        state.notes = notes;
        state.durationSec = durationSec;
        state.beats = beats;
```

with:

```js
        const { notes, durationSec, beats } = parseMidi(buffer);
        state.originalNotes = notes;
        state.notes = transposeNotes(notes, getSelectedSemitones());
        state.durationSec = durationSec;
        state.beats = beats;
```

And in the `catch` branch, replace:

```js
        state.notes = [];
        state.durationSec = 0;
        state.beats = [];
```

with:

```js
        state.notes = [];
        state.originalNotes = [];
        state.durationSec = 0;
        state.beats = [];
```

- [ ] **Step 4: Add a `getSelectedSemitones` helper and the `voiceTypeSelect` change handler**

Add this function near `resetNoteProgress` (around line 156, right after its closing brace):

```js
    function getSelectedSemitones() {
      const select = document.getElementById('voiceTypeSelect');
      return parseInt(select.value, 10);
    }
```

Add the change handler right after the `midiInput` `change` handler's closing `});` (after line 331, before the `wavInput` handler):

```js
    document.getElementById('voiceTypeSelect').addEventListener('change', () => {
      state.notes = transposeNotes(state.originalNotes, getSelectedSemitones());
      resetNoteProgress();
      renderPianoRoll();
    });
```

- [ ] **Step 5: Disable the selector during playback, re-enable when playback ends**

In `play()` (around line 369-426), right after the line `document.getElementById('playbackStatus').textContent = '';` (line 394), add:

```js
      document.getElementById('voiceTypeSelect').disabled = true;
```

In `stopPlayback(reason)` (around line 428-444), right after the line `document.getElementById('playbackStatus').textContent = reason;`, add:

```js
      document.getElementById('voiceTypeSelect').disabled = false;
```

In `play()`'s `node.onended` callback (around line 401-406), which handles the WAV finishing naturally, add the re-enable inside the `if (state.sourceNode === node)` block:

```js
      node.onended = () => {
        if (state.sourceNode === node) {
          state.frozenTime = state.audioContext.currentTime - state.playStartTime;
          state.sourceNode = null;
          document.getElementById('voiceTypeSelect').disabled = false;
        }
      };
```

- [ ] **Step 6: Verify `note-utils.js` is loaded as a browser global**

Check the `<script src="./...">` tags near the top of the file (around line 48-57). Confirm `<script src="./note-utils.js"></script>` is present (it should already be there from Etapa 8, since `playbackRateForNote` is already used in `index.html`). If it is present, no change needed.

- [ ] **Step 7: Manual browser verification**

Start a local server and open the app:

```bash
cd "/Users/Arranger/Claude/App voz" && python3 -m http.server 8791
```

Using the `mcp__Claude_Browser__*` tools:
1. Navigate to `http://localhost:8791/index.html`.
2. Use `read_console_messages` with `onlyErrors: true` — expect no errors on load.
3. Load `tests/fixtures/sample.mid` into `#midiInput` via the file input (simulate a real `change` event, e.g. with a `DataTransfer`/`new File(...)` construction executed through `javascript_tool`, matching the technique already used in Etapa 8's Task 2 verification).
4. Read the piano roll canvas or use `javascript_tool` to inspect `state.notes[0].pitch` vs `state.originalNotes[0].pitch` — confirm they're equal (default selector = Original, 0 semitones).
5. Use `form_input` (or `javascript_tool` dispatching a `change` event) to set `#voiceTypeSelect` to `"-12"`.
6. Re-inspect `state.notes[0].pitch` — confirm it now equals `state.originalNotes[0].pitch - 12`.
7. Set `#voiceTypeSelect` to `"-24"` — confirm `state.notes[0].pitch` equals `state.originalNotes[0].pitch - 24`.
8. Set it back to `"0"` — confirm `state.notes[0].pitch` equals `state.originalNotes[0].pitch` again.
9. Load `tests/fixtures/sample.wav` into `#wavInput`, click `#playBtn`, then use `javascript_tool` to check `document.getElementById('voiceTypeSelect').disabled === true` while `state.sourceNode` is non-null.
10. Click `#stopBtn`, then confirm `document.getElementById('voiceTypeSelect').disabled === false`.

Expected: all checks pass, no console errors at any step.

- [ ] **Step 8: Run the full test suite**

Run: `cd "App voz" && node --test tests/*.test.js`
Expected: all tests pass (51 total: 47 from before + 4 new `transposeNotes` tests).

- [ ] **Step 9: Commit**

```bash
git add "App voz/index.html"
git commit -m "feat(app-voz): add voice-type selector that transposes the MIDI octave"
```

---

## Self-Review Notes

- **Spec coverage:** `transposeNotes` (Task 1) ✓; `originalNotes`/derived `notes` (Task 2 Steps 2-4) ✓; instant recompute on selector change without reloading MIDI (Task 2 Step 4) ✓; select disabled during playback, re-enabled on all 3 stop paths — natural end via `onended` (Step 5), manual stop via `stopPlayback` (Step 5), auto-stop via silence also routes through `stopPlayback` so it's covered by the same change (Step 5) ✓; default = 0 semitones, non-breaking ✓.
- **Placeholder scan:** none found — every step has literal code or an exact command.
- **Type consistency:** `transposeNotes(notes, semitones)` signature matches between Task 1's implementation and every Task 2 call site (`transposeNotes(notes, getSelectedSemitones())` and `transposeNotes(state.originalNotes, getSelectedSemitones())`).
