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
