const test = require('node:test');
const assert = require('node:assert/strict');
const { computeCalibrationOffset } = require('../latency-calibration.js');

test('computeCalibrationOffset returns the median of valid deltas (odd count)', () => {
  assert.equal(computeCalibrationOffset([0.05, 0.08, 0.06]), 0.06);
});

test('computeCalibrationOffset averages the two middle values for an even count of valid deltas', () => {
  const result = computeCalibrationOffset([0.04, 0.05, 0.08, 0.07]);
  assert.ok(Math.abs(result - 0.06) < 1e-9);
});

test('computeCalibrationOffset ignores null trials (missed detections)', () => {
  assert.equal(computeCalibrationOffset([0.05, null, 0.06, 0.07]), 0.06);
});

test('computeCalibrationOffset ignores deltas outside the default [0, 0.5] range', () => {
  const result = computeCalibrationOffset([0.05, 0.06, 0.9, -0.1]);
  assert.ok(Math.abs(result - 0.055) < 1e-9);
});

test('computeCalibrationOffset returns null when fewer than minValid deltas remain', () => {
  assert.equal(computeCalibrationOffset([0.05, null, null, null]), null);
});

test('computeCalibrationOffset honors custom minValid, minDelta and maxDelta', () => {
  assert.equal(computeCalibrationOffset([0.9], 1, 0, 1), 0.9);
  assert.equal(computeCalibrationOffset([0.9], 2, 0, 1), null);
});
