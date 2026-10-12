const test = require('node:test');
const assert = require('node:assert/strict');
const { countUnsungBeats } = require('../silence-guard.js');

test('countUnsungBeats counts only beats covered by a note, ignoring gap beats entirely', () => {
  const notes = [{ pitch: 60, start: 0, duration: 1 }];
  const beats = [0, 0.5, 1, 1.5, 2];
  assert.equal(countUnsungBeats(beats, notes, -1, 2), 3);
});

test('countUnsungBeats resets the count after 4 consecutive beats not covered by any note', () => {
  const notes = [
    { pitch: 60, start: 0, duration: 1.4 },
    { pitch: 62, start: 5, duration: 1 }
  ];
  const beats = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
  assert.equal(countUnsungBeats(beats, notes, -1, 5), 1);
});

test('countUnsungBeats does not reset the count for a gap shorter than 4 beats', () => {
  const notes = [
    { pitch: 60, start: 0, duration: 0.4 },
    { pitch: 62, start: 2, duration: 0.4 }
  ];
  const beats = [0, 0.5, 1, 1.5, 2];
  assert.equal(countUnsungBeats(beats, notes, -1, 2), 2);
});

test('countUnsungBeats returns 0 when there are no notes at all', () => {
  assert.equal(countUnsungBeats([0, 0.5, 1], [], -1, 1), 0);
});
