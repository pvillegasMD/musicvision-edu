const test = require('node:test');
const assert = require('node:assert/strict');
const { computeLoopEngaged, clampLoopStart, clampLoopEnd, hitTestLoopMarker } = require('../loop-utils.js');

test('computeLoopEngaged is false when the loop is not active, regardless of position', () => {
  assert.equal(computeLoopEngaged(false, 35, 30, 45), false);
});

test('computeLoopEngaged is true when position is inside [loopStart, loopEnd)', () => {
  assert.equal(computeLoopEngaged(true, 30, 30, 45), true);
  assert.equal(computeLoopEngaged(true, 37, 30, 45), true);
});

test('computeLoopEngaged is false at or past loopEnd (exclusive upper bound)', () => {
  assert.equal(computeLoopEngaged(true, 45, 30, 45), false);
  assert.equal(computeLoopEngaged(true, 50, 30, 45), false);
});

test('computeLoopEngaged is false before loopStart', () => {
  assert.equal(computeLoopEngaged(true, 10, 30, 45), false);
});

test('clampLoopStart passes a valid candidate through unchanged', () => {
  assert.equal(clampLoopStart(20, 45, 0.1), 20);
});

test('clampLoopStart clamps a negative candidate to 0', () => {
  assert.equal(clampLoopStart(-5, 45, 0.1), 0);
});

test('clampLoopStart clamps a candidate too close to or past loopEnd', () => {
  assert.ok(Math.abs(clampLoopStart(44.95, 45, 0.1) - 44.9) < 1e-9);
  assert.ok(Math.abs(clampLoopStart(100, 45, 0.1) - 44.9) < 1e-9);
});

test('clampLoopEnd passes a valid candidate through unchanged', () => {
  assert.equal(clampLoopEnd(40, 30, 0.1, 60), 40);
});

test('clampLoopEnd clamps a candidate beyond the duration', () => {
  assert.equal(clampLoopEnd(999, 30, 0.1, 60), 60);
});

test('clampLoopEnd clamps a candidate too close to or before loopStart', () => {
  assert.ok(Math.abs(clampLoopEnd(30.05, 30, 0.1, 60) - 30.1) < 1e-9);
  assert.ok(Math.abs(clampLoopEnd(-5, 30, 0.1, 60) - 30.1) < 1e-9);
});

test('hitTestLoopMarker detects a hit on the start marker within tolerance', () => {
  assert.equal(hitTestLoopMarker(30.05, 30, 45, 0.2), 'start');
});

test('hitTestLoopMarker detects a hit on the end marker within tolerance', () => {
  assert.equal(hitTestLoopMarker(44.9, 30, 45, 0.2), 'end');
});

test('hitTestLoopMarker returns null when the click is far from both markers', () => {
  assert.equal(hitTestLoopMarker(37, 30, 45, 0.2), null);
});

test('hitTestLoopMarker returns null just outside the tolerance', () => {
  assert.equal(hitTestLoopMarker(30.21, 30, 45, 0.2), null);
});
