const test = require('node:test');
const assert = require('node:assert/strict');
const { detectPitch } = require('../pitch-detection.js');

function makeSine(freq, sampleRate, n) {
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    buf[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate);
  }
  return buf;
}

const SAMPLE_RATE = 44100;
const BUFFER_LENGTH = 2048;

test('detectPitch finds the correct frequency for pure sine waves across the vocal range', () => {
  for (const freq of [110, 220, 261.63, 440, 880]) {
    const buffer = makeSine(freq, SAMPLE_RATE, BUFFER_LENGTH);
    const detected = detectPitch(buffer, SAMPLE_RATE);
    assert.ok(detected !== null, `should detect a pitch for ${freq}Hz`);
    const errorPct = (Math.abs(detected - freq) / freq) * 100;
    assert.ok(errorPct < 1, `error for ${freq}Hz should be under 1%, got ${errorPct}% (detected ${detected})`);
  }
});

test('detectPitch returns null for silence', () => {
  const silence = new Float32Array(BUFFER_LENGTH).fill(0);
  assert.equal(detectPitch(silence, SAMPLE_RATE), null);
});

test('detectPitch returns null for white noise', () => {
  const noise = new Float32Array(BUFFER_LENGTH);
  // Fixed values (not Math.random()) so this test is deterministic — a hand-picked
  // pseudo-random-looking sequence with no periodic structure.
  let seed = 42;
  for (let i = 0; i < noise.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    noise[i] = ((seed % 2000) / 1000 - 1) * 0.5;
  }
  assert.equal(detectPitch(noise, SAMPLE_RATE), null);
});
