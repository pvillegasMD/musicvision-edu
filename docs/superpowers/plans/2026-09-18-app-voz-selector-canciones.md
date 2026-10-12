# App voz — Selector de canciones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a song-picker dropdown that auto-loads a chosen song's WAV+MIDI from a JSON manifest, and a "notify the teacher" button (via Formspree) that appears when a song fails to load.

**Architecture:** A new pure file (`song-catalog-utils.js`) handles the two bits of real logic (alphabetical sort, building the failure-report payload) as testable functions. `index.html` fetches `canciones.json` on load to populate `#songSelect`, and its `change` handler duplicates — rather than refactors — the existing `#wavInput`/`#midiInput` loading logic, fed from `fetch()` responses instead of `File` objects, tracking per-file errors to drive the notify button.

**Tech Stack:** Vanilla JS, no build step. Tests run with `node --test` against pure functions exported via `module.exports`. Manual browser verification via a local `python3 -m http.server` and the `mcp__Claude_Browser__*` tools.

## Global Constraints

- No build step, no npm, no external libraries — hand-written JS only, consistent with the rest of the repo (`CLAUDE.md`). The Formspree call is a plain `fetch()` POST, no SDK/script tag.
- **NEVER actually POST to `https://formspree.io/f/xzezzqzd` during implementation or review verification.** This is the real teacher's Formspree endpoint, tied to their real email inbox, with a real (limited) monthly submission quota. Verify the notify button's network call by intercepting/stubbing it — e.g. temporarily replace `window.fetch` in the browser console with a function that records its arguments instead of calling the real one, before clicking the button — or by code inspection alone. Do not click the real button against the real endpoint at any point, in any task, in any review.
- Reuses the existing `#wavInput`/`#midiInput` loading logic's exact behavior (decode/parse steps, state fields touched, status text format) — duplicated for the fetch-based path rather than refactored, matching this app's established "small duplication over cross-module coupling" convention (documented in earlier plans' Global Constraints sections).
- Design spec: `docs/superpowers/specs/2026-09-18-app-voz-selector-canciones-design.md`.

---

### Task 1: `song-catalog-utils.js` — sorting and failure-report shaping

**Files:**
- Create: `App voz/song-catalog-utils.js`
- Test: `App voz/tests/song-catalog-utils.test.js`

**Interfaces:**
- Produces:
  - `sortSongsByTitle(songs) -> Array` — returns a NEW array (does not mutate the input), sorted by each song's `titulo` field using `String.prototype.localeCompare`.
  - `buildFailureReport(songTitle, wavError, midiError, timestamp) -> {cancion, archivos_fallidos, error_wav, error_midi, fecha}` — `wavError`/`midiError` are either an error message string or `null`/falsy. `timestamp` is a pre-formatted string (the caller passes `new Date().toISOString()`) — kept as a parameter rather than computed inside, so this function stays pure and testable.

- [ ] **Step 1: Write the failing tests**

Create `App voz/tests/song-catalog-utils.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { sortSongsByTitle, buildFailureReport } = require('../song-catalog-utils.js');

test('sortSongsByTitle sorts songs alphabetically by titulo', () => {
  const songs = [
    { id: 'b', titulo: 'Bajo la lluvia' },
    { id: 'a', titulo: 'Amor Completo' },
    { id: 'c', titulo: 'Canción sin nombre' }
  ];
  const sorted = sortSongsByTitle(songs);
  assert.deepEqual(sorted.map((s) => s.id), ['a', 'b', 'c']);
});

test('sortSongsByTitle does not mutate the input array', () => {
  const songs = [{ id: 'b', titulo: 'Bajo' }, { id: 'a', titulo: 'Amor' }];
  const original = songs.map((s) => ({ ...s }));
  sortSongsByTitle(songs);
  assert.deepEqual(songs, original);
});

test('sortSongsByTitle handles an empty array', () => {
  assert.deepEqual(sortSongsByTitle([]), []);
});

test('buildFailureReport reports only WAV when only the WAV failed', () => {
  const report = buildFailureReport('Amor Completo', 'HTTP 404', null, '2026-09-18T12:00:00.000Z');
  assert.equal(report.cancion, 'Amor Completo');
  assert.equal(report.archivos_fallidos, 'WAV');
  assert.equal(report.error_wav, 'HTTP 404');
  assert.equal(report.error_midi, '');
  assert.equal(report.fecha, '2026-09-18T12:00:00.000Z');
});

test('buildFailureReport reports only MIDI when only the MIDI failed', () => {
  const report = buildFailureReport('Amor Completo', null, 'HTTP 500', '2026-09-18T12:00:00.000Z');
  assert.equal(report.archivos_fallidos, 'MIDI');
  assert.equal(report.error_wav, '');
  assert.equal(report.error_midi, 'HTTP 500');
});

test('buildFailureReport reports both when both failed', () => {
  const report = buildFailureReport('Amor Completo', 'HTTP 404', 'Archivo MIDI inválido', '2026-09-18T12:00:00.000Z');
  assert.equal(report.archivos_fallidos, 'WAV, MIDI');
  assert.equal(report.error_wav, 'HTTP 404');
  assert.equal(report.error_midi, 'Archivo MIDI inválido');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "App voz" && node --test tests/song-catalog-utils.test.js`
Expected: FAIL — `Cannot find module '../song-catalog-utils.js'`.

- [ ] **Step 3: Implement `song-catalog-utils.js`**

Create `App voz/song-catalog-utils.js`:

```js
function sortSongsByTitle(songs) {
  return [...songs].sort((a, b) => a.titulo.localeCompare(b.titulo));
}

function buildFailureReport(songTitle, wavError, midiError, timestamp) {
  const failed = [];
  if (wavError) failed.push('WAV');
  if (midiError) failed.push('MIDI');
  return {
    cancion: songTitle,
    archivos_fallidos: failed.join(', '),
    error_wav: wavError || '',
    error_midi: midiError || '',
    fecha: timestamp
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { sortSongsByTitle, buildFailureReport };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "App voz" && node --test tests/song-catalog-utils.test.js`
Expected: PASS, all 6 tests.

- [ ] **Step 5: Commit**

```bash
git add "App voz/song-catalog-utils.js" "App voz/tests/song-catalog-utils.test.js"
git commit -m "feat(app-voz): add song-catalog-utils.js for sorting and failure reports"
```

---

### Task 2: Song catalog + dropdown + teacher-notification button

**Files:**
- Create: `App voz/canciones.json`
- Create: `App voz/canciones/demo/pista.wav` (copy of `App voz/tests/fixtures/sample.wav`)
- Create: `App voz/canciones/demo/guia.mid` (copy of `App voz/tests/fixtures/sample.mid`)
- Modify: `App voz/index.html`

**Interfaces:**
- Consumes: `sortSongsByTitle(songs)`, `buildFailureReport(songTitle, wavError, midiError, timestamp)` from Task 1, loaded as browser globals via a new `<script>` tag.

- [ ] **Step 1: Create the demo song catalog entry**

```bash
mkdir -p "App voz/canciones/demo"
cp "App voz/tests/fixtures/sample.wav" "App voz/canciones/demo/pista.wav"
cp "App voz/tests/fixtures/sample.mid" "App voz/canciones/demo/guia.mid"
```

Create `App voz/canciones.json`:

```json
[
  {
    "id": "demo",
    "titulo": "Canción de prueba",
    "wav": "canciones/demo/pista.wav",
    "midi": "canciones/demo/guia.mid"
  }
]
```

This gives the app a real, working song out of the box, and doubles as a template — adding a real song later is: create `App voz/canciones/<id>/` with a `pista.wav`/`guia.mid` inside, and add one more object to this array.

- [ ] **Step 2: Load the new script**

In `App voz/index.html`, after the line `<script src="./loop-utils.js"></script>`, add:

```html
    <script src="./loop-utils.js"></script>
    <script src="./song-catalog-utils.js"></script>
```

- [ ] **Step 3: Add the song dropdown and notify button to the HTML**

Right before `<label>MIDI: <input type="file" id="midiInput" accept=".mid,.midi"></label>`, add:

```html
    <label>Canción:
      <select id="songSelect">
        <option value="" selected disabled>Elige una canción...</option>
      </select>
    </label>
```

Right after `<div id="wavStatus">Sin WAV cargado.</div>`, add:

```html
    <div id="wavStatus">Sin WAV cargado.</div>
    <button id="songNotifyBtn" hidden>Informar al profesor</button>
```

- [ ] **Step 4: Add state fields**

In the `state` object literal, add `songs` and `songLoadFailure` right after `pendingStartTime: null,` (keep the existing loop fields that already follow it):

```js
      pendingStartTime: null,
      songs: [],
      songLoadFailure: null,
      loopActive: false,
```

- [ ] **Step 5: Load and render the song catalog on startup**

Right after the closing `}` of `loadDefaultInstrument()` and its `loadDefaultInstrument();` call, add:

```js
    async function loadSongCatalog() {
      try {
        const response = await fetch('./canciones.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const songs = await response.json();
        state.songs = sortSongsByTitle(songs);
        const select = document.getElementById('songSelect');
        state.songs.forEach((song) => {
          const option = document.createElement('option');
          option.value = song.id;
          option.textContent = song.titulo;
          select.appendChild(option);
        });
      } catch (err) {
        // Sin canciones.json (o inválido), el menú queda solo con el placeholder —
        // los inputs manuales de MIDI/WAV siguen funcionando como respaldo.
        state.songs = [];
      }
    }
    loadSongCatalog();
```

- [ ] **Step 6: Wire the song dropdown's `change` handler**

Add this near the other file-input `change` handlers — right after the `wavInput` `change` handler's closing `});` (the one that ends with `renderWaveform();\n    });`):

```js
    document.getElementById('songSelect').addEventListener('change', async (e) => {
      const songId = e.target.value;
      if (!songId) return;
      const song = state.songs.find((s) => s.id === songId);
      if (!song) return;

      const notifyBtn = document.getElementById('songNotifyBtn');
      notifyBtn.hidden = true;
      notifyBtn.disabled = false;
      notifyBtn.textContent = 'Informar al profesor';

      let wavError = null;
      let midiError = null;

      try {
        const response = await fetch(song.wav);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
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
        state.loopActive = false;
        state.loopStart = null;
        state.loopEnd = null;
        state.loopEngaged = false;
        document.getElementById('loopToggleBtn').disabled = false;
        document.getElementById('loopToggleBtn').classList.remove('active');
      } catch (err) {
        wavError = err.message || 'error desconocido';
        state.audioBuffer = null;
        state.waveformPeaks = [];
        state.loopActive = false;
        state.loopStart = null;
        state.loopEnd = null;
        state.loopEngaged = false;
        document.getElementById('loopToggleBtn').disabled = true;
        document.getElementById('loopToggleBtn').classList.remove('active');
        document.getElementById('wavStatus').textContent = `Error al cargar el WAV: ${wavError}`;
      }
      renderWaveform();

      try {
        const response = await fetch(song.midi);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const buffer = await response.arrayBuffer();
        const { notes, durationSec, beats } = parseMidi(buffer);
        state.originalNotes = notes;
        state.notes = transposeNotes(notes, getSelectedSemitones());
        state.durationSec = durationSec;
        state.beats = beats;
        resetNoteProgress();
        state.lastReport = null;
        state.pendingStartTime = null;
        document.getElementById('viewReportBtn').disabled = true;
        document.getElementById('midiStatus').textContent =
          formatMidiStatusText(state.notes, durationSec);
        renderPianoRoll();
      } catch (err) {
        midiError = err.message || 'error desconocido';
        state.notes = [];
        state.originalNotes = [];
        state.durationSec = 0;
        state.beats = [];
        resetNoteProgress();
        state.lastReport = null;
        state.pendingStartTime = null;
        document.getElementById('viewReportBtn').disabled = true;
        document.getElementById('midiStatus').textContent = `Error al cargar el MIDI: ${midiError}`;
        renderPianoRoll();
      }

      if (wavError || midiError) {
        state.songLoadFailure = { song, wavError, midiError };
        notifyBtn.hidden = false;
      } else {
        state.songLoadFailure = null;
      }
    });
```

Note: this handler intentionally duplicates the body of the existing `wavInput`/`midiInput` `change` handlers (same state fields touched, same status-text format) rather than extracting a shared helper — see Global Constraints. The only structural difference is `wavError`/`midiError` get captured into local variables (instead of only being written to the status `textContent`) so Step 7's notify button knows what to report.

- [ ] **Step 7: Wire the notify button**

Right after the `songSelect` change handler's closing `});`, add:

```js
    document.getElementById('songNotifyBtn').addEventListener('click', async () => {
      if (!state.songLoadFailure) return;
      const btn = document.getElementById('songNotifyBtn');
      btn.disabled = true;
      const { song, wavError, midiError } = state.songLoadFailure;
      const report = buildFailureReport(song.titulo, wavError, midiError, new Date().toISOString());
      try {
        await fetch('https://formspree.io/f/xzezzqzd', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(report)
        });
      } catch (err) {
        // Sin forma de reintentar desde acá sin complicar la interfaz — el alumno
        // ya hizo lo que podía hacer, así que igual mostramos la confirmación.
      }
      btn.textContent = 'Se le ha notificado al profesor';
    });
```

- [ ] **Step 8: Fix a pre-existing voseo slip while touching this exact neighborhood**

`loadDefaultInstrument()`'s catch branch (just above where Steps 5-7 add new code) currently reads:

```js
        document.getElementById('instrumentStatus').textContent =
          'Sin instrumento cargado (cargalo a mano, o abrí la app desde un servidor para que se cargue solo).';
```

`cargalo` is a voseo imperative (Rioplatense/Argentine) — replace it with the neutral form:

```js
        document.getElementById('instrumentStatus').textContent =
          'Sin instrumento cargado (cárgalo a mano, o abre la app desde un servidor para que se cargue solo).';
```

(`abrí` also got fixed to `abre` in the same string — same voseo issue, same fix.)

- [ ] **Step 9: Run the full automated test suite**

Run: `cd "App voz" && node --test tests/*.test.js`
Expected: all tests pass (97 total: 91 from before + 6 new `song-catalog-utils.js` tests).

- [ ] **Step 10: Manual browser verification**

**Reminder: never let any step in this verification actually POST to `https://formspree.io/f/xzezzqzd`.** Step 10.6 below explains how to verify the notify button without doing that.

Start a local server and open the app:

```bash
cd "App voz" && python3 -m http.server 8796
```

Using the `mcp__Claude_Browser__*` tools:

1. Navigate to `http://localhost:8796/index.html`.
2. Use `read_console_messages` with `onlyErrors: true` — expect no errors on load.
3. Via `javascript_tool`, confirm the dropdown populated: `document.getElementById('songSelect').options.length` should be `2` (the placeholder + the "demo" entry), and `document.getElementById('songSelect').options[1].textContent` should be `'Canción de prueba'`.
4. Select the demo song: via `javascript_tool`, set `document.getElementById('songSelect').value = 'demo'` and dispatch a `change` event (`document.getElementById('songSelect').dispatchEvent(new Event('change'))`), then wait briefly (e.g. `await new Promise(r => setTimeout(r, 300));`) for the two `fetch` calls to resolve.
5. Confirm via `javascript_tool`: `state.audioBuffer !== null`, `state.notes.length > 0`, `document.getElementById('songNotifyBtn').hidden === true` (no failure, so the notify button stays hidden), and the `#wavStatus`/`#midiStatus` text reflect a successful load (no "Error" prefix).
6. **Simulate a failure WITHOUT touching the real Formspree endpoint.** Via `javascript_tool`, temporarily inject a fake song with a broken path and select it:
   ```js
   state.songs.push({ id: 'roto', titulo: 'Canción rota', wav: './no-existe.wav', midi: './no-existe.mid' });
   const opt = document.createElement('option');
   opt.value = 'roto';
   opt.textContent = 'Canción rota';
   document.getElementById('songSelect').appendChild(opt);
   document.getElementById('songSelect').value = 'roto';
   document.getElementById('songSelect').dispatchEvent(new Event('change'));
   ```
   Wait briefly, then confirm via `javascript_tool`: `document.getElementById('songNotifyBtn').hidden === false`, `state.songLoadFailure !== null`, and `state.songLoadFailure.wavError`/`state.songLoadFailure.midiError` are both non-empty strings (both files were fake, so both should have failed).
7. **Stub `fetch` before clicking the notify button**, so the click's own network call never reaches Formspree. Via `javascript_tool`, in ONE call, replace `window.fetch` with a recording stub, click the button (or call its handler logic directly), and inspect what it WOULD have sent:
   ```js
   const originalFetch = window.fetch;
   let capturedCall = null;
   window.fetch = (url, options) => {
     capturedCall = { url, body: options && options.body };
     return Promise.resolve(new Response('{}', { status: 200 }));
   };
   document.getElementById('songNotifyBtn').click();
   await new Promise(r => setTimeout(r, 100));
   window.fetch = originalFetch;
   capturedCall;
   ```
   Confirm the captured `url` is exactly `'https://formspree.io/f/xzezzqzd'`, and `JSON.parse(capturedCall.body)` has `cancion === 'Canción rota'`, `archivos_fallidos === 'WAV, MIDI'`, and non-empty `error_wav`/`error_midi`/`fecha` fields.
8. Confirm via `javascript_tool`: `document.getElementById('songNotifyBtn').disabled === true` and `document.getElementById('songNotifyBtn').textContent === 'Se le ha notificado al profesor'`.
9. Confirm no console errors at any step (`read_console_messages` with `onlyErrors: true`) — note that the two fake-file fetches in step 6 will show up as failed network requests in the browser's network tab, which is expected and not a console error; only check for actual JS console errors.

Expected: all checks pass, no console errors, and — critically — no real network request ever reached `formspree.io`.

- [ ] **Step 11: Commit**

```bash
git add "App voz/index.html" "App voz/canciones.json" "App voz/canciones/demo/pista.wav" "App voz/canciones/demo/guia.mid"
git commit -m "feat(app-voz): add a song picker with auto-load and teacher notification on failure"
```

---

## Self-Review Notes

- **Spec coverage:** `canciones.json` manifest + folder convention (Task 2 Step 1) ✓; dropdown populated on load, alphabetically sorted, placeholder-first, no auto-selection (Task 2 Steps 3, 5) ✓; selecting a song loads WAV+MIDI reusing the existing decode/parse logic (Task 2 Step 6) ✓; manual `#midiInput`/`#wavInput` inputs left untouched and still functional (no changes to those handlers) ✓; failure → notify button appears, POSTs to the exact given Formspree URL with song/error/timestamp context (Task 2 Step 7) ✓; button disables and its text changes to the exact confirmation string after being clicked (Task 2 Step 7) ✓; button/failure state resets on selecting a different song (Task 2 Step 6, the `notifyBtn.hidden = true` / `disabled = false` / text reset at the top of the handler) ✓; notify button scoped only to song load failures, not the instrument (no change to `loadDefaultInstrument`/`#instrumentInput`, aside from the unrelated voseo fix in Step 8) ✓.
- **Placeholder scan:** none found — every step has literal code or an exact command.
- **Type consistency:** `sortSongsByTitle(songs)` and `buildFailureReport(songTitle, wavError, midiError, timestamp)` signatures match between Task 1's implementation and Task 2's call sites (`sortSongsByTitle(songs)` in `loadSongCatalog`, `buildFailureReport(song.titulo, wavError, midiError, new Date().toISOString())` in the notify handler). `state.songLoadFailure` is written once (in the `songSelect` handler, either as `{song, wavError, midiError}` or `null`) and read once (in the notify handler, destructured as `{song, wavError, midiError}`) — same shape both places.
