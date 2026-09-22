const test = require('node:test');
const assert = require('node:assert/strict');
const { parseMidi } = require('../midi-parser.js');

// Hand-built minimal MIDI file: format 0, 1 track, 480 ticks/beat (default
// tempo 500000 µs/beat = 120 BPM, so 480 ticks = 0.5s).
// Track: note 60 (C4) for 0.5s, then note 62 (D4) for 0.5s, then end-of-track.
const SAMPLE_MIDI_BYTES = new Uint8Array([
  0x4D, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x01, 0x01, 0xE0,
  0x4D, 0x54, 0x72, 0x6B, 0x00, 0x00, 0x00, 0x16,
  0x00, 0x90, 0x3C, 0x64,
  0x83, 0x60, 0x80, 0x3C, 0x00,
  0x00, 0x90, 0x3E, 0x64,
  0x83, 0x60, 0x80, 0x3E, 0x00,
  0x00, 0xFF, 0x2F, 0x00
]);

test('parseMidi extracts two sequential notes with correct pitch/start/duration', () => {
  const result = parseMidi(SAMPLE_MIDI_BYTES.buffer);

  assert.equal(result.notes.length, 2);

  assert.equal(result.notes[0].pitch, 60);
  assert.equal(result.notes[0].start, 0);
  assert.ok(Math.abs(result.notes[0].duration - 0.5) < 1e-9);

  assert.equal(result.notes[1].pitch, 62);
  assert.ok(Math.abs(result.notes[1].start - 0.5) < 1e-9);
  assert.ok(Math.abs(result.notes[1].duration - 0.5) < 1e-9);

  assert.ok(Math.abs(result.durationSec - 1.0) < 1e-9);
});

test('parseMidi rejects a buffer without a valid MThd header', () => {
  const badBytes = new Uint8Array([0x00, 0x00, 0x00, 0x00]);
  assert.throws(() => parseMidi(badBytes.buffer), /No es un archivo MIDI válido/);
});

test('parseMidi exposes beat timestamps derived from ticksPerBeat and the tempo map', () => {
  const result = parseMidi(SAMPLE_MIDI_BYTES.buffer);
  assert.equal(result.beats.length, 3);
  assert.ok(Math.abs(result.beats[0] - 0) < 1e-9);
  assert.ok(Math.abs(result.beats[1] - 0.5) < 1e-9);
  assert.ok(Math.abs(result.beats[2] - 1.0) < 1e-9);
});

test('parseMidi includes the beat at or after durationSec even when durationSec is mid-beat', () => {
  // Hand-built MIDI: note 60 for 0.5s, then note 62 for 0.75s.
  // Second note ends at tick 480 + 720 = 1200, giving durationSec = 1.25s.
  // Beats at 480 ticks = 0.5s/beat: 0, 0.5, 1.0, 1.5.
  // This tests the fix: must include the beat at 1.5s (first beat >= durationSec).
  const SAMPLE_MIDI_MID_BEAT = new Uint8Array([
    0x4D, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x01, 0x01, 0xE0,
    0x4D, 0x54, 0x72, 0x6B, 0x00, 0x00, 0x00, 0x16,
    0x00, 0x90, 0x3C, 0x64,
    0x83, 0x60, 0x80, 0x3C, 0x00,
    0x00, 0x90, 0x3E, 0x64,
    0x85, 0x70, 0x80, 0x3E, 0x00,
    0x00, 0xFF, 0x2F, 0x00
  ]);

  const result = parseMidi(SAMPLE_MIDI_MID_BEAT.buffer);
  assert.equal(result.beats.length, 4, 'Should have 4 beats: [0, 0.5, 1.0, 1.5]');
  assert.ok(Math.abs(result.beats[0] - 0) < 1e-9);
  assert.ok(Math.abs(result.beats[1] - 0.5) < 1e-9);
  assert.ok(Math.abs(result.beats[2] - 1.0) < 1e-9);
  assert.ok(Math.abs(result.beats[3] - 1.5) < 1e-9, 'Must include beat after durationSec');
});

test('parseMidi does not hang or produce the 100000-entry cap when ticksPerBeat is 0 (degenerate tempo map)', () => {
  // Hand-built MIDI with division (ticksPerBeat) set to 0, an otherwise
  // valid empty track (just end-of-track). With ticksPerBeat = 0,
  // tickToSeconds(0) divides by zero and yields NaN on the very first
  // beats-loop iteration. The guard clauses added for Finding 2 must stop
  // the loop immediately (before pushing the NaN) rather than running to
  // the 100000-entry safety cap or letting a non-finite value slip into
  // the beats array (which would later crash osc.start(NaN) in the UI).
  const SAMPLE_MIDI_ZERO_DIVISION = new Uint8Array([
    0x4D, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00,
    0x4D, 0x54, 0x72, 0x6B, 0x00, 0x00, 0x00, 0x04,
    0x00, 0xFF, 0x2F, 0x00
  ]);

  const result = parseMidi(SAMPLE_MIDI_ZERO_DIVISION.buffer);

  assert.ok(result.beats.length < 100, 'beats array must stay small, not run to the 100000 cap');
  assert.ok(result.beats.every(Number.isFinite), 'no NaN/Infinity beat timestamps should be pushed');
});
