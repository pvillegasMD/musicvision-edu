const test = require('node:test');
const assert = require('node:assert/strict');
const { frequencyToMidi, midiToNoteName, describePitch, playbackRateForNote } = require('../note-utils.js');

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
