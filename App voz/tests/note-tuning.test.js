const test = require('node:test');
const assert = require('node:assert/strict');
const { centsOffTarget, isInTune, noteStatus, accumulateTuning, tuningRatio, liveNoteColor } = require('../note-tuning.js');

test('centsOffTarget is 0 for an exact match, positive when sharp, negative when flat', () => {
  assert.ok(Math.abs(centsOffTarget(440, 69)) < 1e-6);
  assert.ok(centsOffTarget(450, 69) > 0);
  assert.ok(centsOffTarget(430, 69) < 0);
});

test('isInTune respects the +/-50 cent boundary inclusively', () => {
  assert.equal(isInTune(0), true);
  assert.equal(isInTune(50), true);
  assert.equal(isInTune(50.1), false);
  assert.equal(isInTune(-50), true);
  assert.equal(isInTune(-50.1), false);
});

test('noteStatus classifies before/during/after a note, inclusive of both endpoints', () => {
  const note = { start: 1, duration: 0.5 };
  assert.equal(noteStatus(note, 0.5), 'upcoming');
  assert.equal(noteStatus(note, 1), 'active');
  assert.equal(noteStatus(note, 1.25), 'active');
  assert.equal(noteStatus(note, 1.5), 'active');
  assert.equal(noteStatus(note, 1.500001), 'past');
});

test('accumulateTuning adds deltaSeconds to timeTotal always, and to timeInTune only when in tune', () => {
  let p = { timeInTune: 0, timeTotal: 0 };
  p = accumulateTuning(p, true, 0.1);
  assert.ok(Math.abs(p.timeInTune - 0.1) < 1e-9);
  assert.ok(Math.abs(p.timeTotal - 0.1) < 1e-9);
  p = accumulateTuning(p, false, 0.05);
  assert.ok(Math.abs(p.timeInTune - 0.1) < 1e-9);
  assert.ok(Math.abs(p.timeTotal - 0.15) < 1e-9);
});

test('tuningRatio divides safely, returning 0 for a note with no elapsed time', () => {
  assert.equal(tuningRatio({ timeInTune: 0, timeTotal: 0 }), 0);
  assert.ok(Math.abs(tuningRatio({ timeInTune: 0.8, timeTotal: 1.0 }) - 0.8) < 1e-9);
});

test('liveNoteColor returns no-signal for null, in-tune/out-of-tune otherwise', () => {
  assert.equal(liveNoteColor(null, 69), 'no-signal');
  assert.equal(liveNoteColor(440, 69), 'in-tune');
  assert.equal(liveNoteColor(400, 69), 'out-of-tune');
});
