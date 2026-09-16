const test = require('node:test');
const assert = require('node:assert/strict');
const { computeWaveformPeaks } = require('../waveform-utils.js');

test('computeWaveformPeaks returns exactly `width` peaks for a simple alternating signal', () => {
  const samples = [0, 1, -1, 0, 1, -1, 0, 1, -1, 0]; // 10 samples
  const peaks = computeWaveformPeaks(samples, 5);
  assert.equal(peaks.length, 5);
});

test('computeWaveformPeaks computes the correct min/max per column on an exact 2-samples-per-pixel split', () => {
  const samples = [0, 1, -1, 0, 1, -1, 0, 1, -1, 0]; // 10 samples, width 5 -> 2 samples/column
  const peaks = computeWaveformPeaks(samples, 5);
  assert.deepEqual(peaks[0], { min: 0, max: 1 });   // samples[0..1] = [0, 1]
  assert.deepEqual(peaks[1], { min: -1, max: 0 });  // samples[2..3] = [-1, 0]
  assert.deepEqual(peaks[2], { min: -1, max: 1 });  // samples[4..5] = [1, -1]
});

test('computeWaveformPeaks returns an empty array when width is 0', () => {
  assert.deepEqual(computeWaveformPeaks([1, 2, 3], 0), []);
});

test('computeWaveformPeaks returns width entries of {min: 0, max: 0} for an empty samples array', () => {
  const peaks = computeWaveformPeaks([], 4);
  assert.equal(peaks.length, 4);
  peaks.forEach((p) => assert.deepEqual(p, { min: 0, max: 0 }));
});

test('computeWaveformPeaks handles more pixel columns than samples without throwing or going out of bounds', () => {
  const samples = [0.5, -0.5];
  const peaks = computeWaveformPeaks(samples, 10);
  assert.equal(peaks.length, 10);
  peaks.forEach((p) => {
    assert.ok(p.min <= p.max);
    assert.ok(Number.isFinite(p.min) && Number.isFinite(p.max));
  });
});

test('computeWaveformPeaks always has min <= max in every column, for a larger pseudo-random signal', () => {
  const samples = [];
  for (let i = 0; i < 997; i++) {
    samples.push(Math.sin(i * 0.37) * 0.8 + Math.sin(i * 1.9) * 0.2);
  }
  const peaks = computeWaveformPeaks(samples, 200);
  assert.equal(peaks.length, 200);
  peaks.forEach((p) => assert.ok(p.min <= p.max));
});
