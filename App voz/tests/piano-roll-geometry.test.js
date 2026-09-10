const test = require('node:test');
const assert = require('node:assert/strict');
const { pitchRange, pitchToY, computeNoteRect } = require('../piano-roll-geometry.js');

test('pitchRange pads the observed pitch range by 2 semitones', () => {
  const r = pitchRange([{ pitch: 60, start: 0, duration: 1 }, { pitch: 67, start: 1, duration: 1 }]);
  assert.equal(r.minPitch, 58);
  assert.equal(r.maxPitch, 69);
});

test('pitchRange returns a default range for an empty note list', () => {
  const r = pitchRange([]);
  assert.equal(r.minPitch, 60);
  assert.equal(r.maxPitch, 72);
});

test('pitchToY maps maxPitch to the top (0) and minPitch to the bottom (canvasHeight)', () => {
  assert.equal(pitchToY(72, 60, 72, 240), 0);
  assert.equal(pitchToY(60, 60, 72, 240), 240);
  assert.equal(pitchToY(66, 60, 72, 240), 120);
});

test('pitchToY does not divide by zero when minPitch === maxPitch', () => {
  assert.equal(pitchToY(5, 5, 5, 100), 50);
});

test('computeNoteRect places a note using time and pitch mapping', () => {
  const rect = computeNoteRect(
    { pitch: 60, start: 1, duration: 0.5 },
    { currentTime: 0, pixelsPerSecond: 100, playheadX: 50, minPitch: 60, maxPitch: 72, canvasHeight: 240, rowHeight: 20 }
  );
  assert.equal(rect.x, 150);
  assert.equal(rect.width, 50);
  assert.equal(rect.y, 230);
  assert.equal(rect.height, 20);
});
