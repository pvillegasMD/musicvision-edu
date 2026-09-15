const test = require('node:test');
const assert = require('node:assert/strict');
const { countSilentBeats } = require('../silence-guard.js');

test('countSilentBeats counts beats strictly after sinceTime and up to and including uptoTime', () => {
  const beats = [0, 0.5, 1, 1.5, 2];
  assert.equal(countSilentBeats(beats, 0.5, 2), 3);
});

test('countSilentBeats excludes a beat exactly at sinceTime and includes one exactly at uptoTime', () => {
  const beats = [0, 1, 2];
  assert.equal(countSilentBeats(beats, 1, 2), 1);
});

test('countSilentBeats returns 0 when no beats fall in the range', () => {
  assert.equal(countSilentBeats([0, 0.5], 1, 2), 0);
});

test('countSilentBeats returns 0 for an empty beats array', () => {
  assert.equal(countSilentBeats([], 0, 10), 0);
});
