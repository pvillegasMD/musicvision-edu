const test = require('node:test');
const assert = require('node:assert/strict');
const { computeLevel } = require('../audio-level.js');

test('computeLevel returns zero for silence (all samples at the 128 midpoint)', () => {
  const silence = new Uint8Array(64).fill(128);
  const { rms, peak } = computeLevel(silence);
  assert.equal(rms, 0);
  assert.equal(peak, 0);
});

test('computeLevel returns ~1.0 peak and rms for a full-scale square wave', () => {
  const square = new Uint8Array(64);
  for (let i = 0; i < square.length; i++) square[i] = i % 2 === 0 ? 0 : 255;
  const { rms, peak } = computeLevel(square);
  assert.ok(Math.abs(peak - 1.0) < 1e-9, `peak ${peak} should be exactly 1.0`);
  assert.ok(rms > 0.99 && rms <= 1.0, `rms ${rms} should be close to 1.0`);
});

test('computeLevel matches expected rms/peak for a known sine wave amplitude', () => {
  const N = 200;
  const amplitude = 0.5;
  const sine = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const t = (2 * Math.PI * i) / N;
    const sample = amplitude * Math.sin(t);
    sine[i] = Math.round(128 + 127 * sample);
  }
  const { rms, peak } = computeLevel(sine);
  const expectedRms = amplitude / Math.sqrt(2);
  assert.ok(Math.abs(rms - expectedRms) < 0.01, `rms ${rms} should be close to ${expectedRms}`);
  assert.ok(Math.abs(peak - amplitude) < 0.02, `peak ${peak} should be close to ${amplitude}`);
});
