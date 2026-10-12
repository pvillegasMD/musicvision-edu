const test = require('node:test');
const assert = require('node:assert/strict');
const { detectPitch, createPitchTracker } = require('../pitch-detection.js');

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

function makeHarmonics(parts, sampleRate, n) {
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (const [freq, amp, phase] of parts) {
      v += amp * Math.sin((2 * Math.PI * freq * i) / sampleRate + (phase || 0));
    }
    buf[i] = v * 0.3;
  }
  return buf;
}

// 200 Hz plus a sub-harmonic at 100 Hz: plain YIN reports 100 Hz (an octave too low).
const SUBHARMONIC_FRAME = () => makeHarmonics([[200, 1], [100, 0.3, 1.0]], SAMPLE_RATE, BUFFER_LENGTH);
// Weak 200 Hz fundamental under a strong 400 Hz partial: plain YIN reports 400 Hz (an octave too high).
const STRONG_SECOND_PARTIAL_FRAME = () => makeHarmonics([[200, 0.1], [400, 1], [600, 0.2]], SAMPLE_RATE, BUFFER_LENGTH);

test('the fixtures really do fool the plain detector (sanity check for the tracker tests)', () => {
  assert.ok(Math.abs(detectPitch(SUBHARMONIC_FRAME(), SAMPLE_RATE) - 100) < 2);
  assert.ok(Math.abs(detectPitch(STRONG_SECOND_PARTIAL_FRAME(), SAMPLE_RATE) - 400) < 4);
});

test('createPitchTracker matches detectPitch on a clean sine with no history', () => {
  const tracker = createPitchTracker();
  for (const freq of [110, 220, 440, 880]) {
    tracker.reset();
    const detected = tracker.detect(makeSine(freq, SAMPLE_RATE, BUFFER_LENGTH), SAMPLE_RATE);
    assert.ok(Math.abs(detected - freq) / freq < 0.01, `expected ~${freq}, got ${detected}`);
  }
});

test('createPitchTracker returns null for silence and for white noise', () => {
  const tracker = createPitchTracker();
  assert.equal(tracker.detect(new Float32Array(BUFFER_LENGTH), SAMPLE_RATE), null);
  const noise = new Float32Array(BUFFER_LENGTH);
  let seed = 42;
  for (let i = 0; i < noise.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    noise[i] = ((seed % 2000) / 1000 - 1) * 0.5;
  }
  assert.equal(tracker.detect(noise, SAMPLE_RATE), null);
});

test('createPitchTracker never reports a frequency above the maximum (high-frequency hiss/clicks)', () => {
  const frame = makeHarmonics([[200, 1], [3100, 2, 0.7]], SAMPLE_RATE, BUFFER_LENGTH);
  assert.ok(detectPitch(frame, SAMPLE_RATE) > 3000, 'sanity: the plain detector locks onto the 3100 Hz tone');
  const detected = createPitchTracker().detect(frame, SAMPLE_RATE);
  assert.ok(detected === null || detected <= 1400, `got ${detected}`);
});

test('createPitchTracker ignores tones below the minimum frequency', () => {
  assert.equal(createPitchTracker().detect(makeSine(50, SAMPLE_RATE, BUFFER_LENGTH), SAMPLE_RATE), null);
});

test('createPitchTracker keeps the previous octave when one frame jumps an octave down', () => {
  const tracker = createPitchTracker();
  const steady = makeSine(200, SAMPLE_RATE, BUFFER_LENGTH);
  tracker.detect(steady, SAMPLE_RATE);
  tracker.detect(steady, SAMPLE_RATE);
  const glitch = tracker.detect(SUBHARMONIC_FRAME(), SAMPLE_RATE);
  assert.ok(Math.abs(glitch - 200) < 3, `expected ~200, got ${glitch}`);
  assert.ok(Math.abs(tracker.detect(steady, SAMPLE_RATE) - 200) < 3);
});

test('createPitchTracker keeps the previous octave when one frame jumps an octave up', () => {
  const tracker = createPitchTracker();
  const steady = makeSine(200, SAMPLE_RATE, BUFFER_LENGTH);
  tracker.detect(steady, SAMPLE_RATE);
  tracker.detect(steady, SAMPLE_RATE);
  const glitch = tracker.detect(STRONG_SECOND_PARTIAL_FRAME(), SAMPLE_RATE);
  assert.ok(Math.abs(glitch - 200) < 3, `expected ~200, got ${glitch}`);
});

test('createPitchTracker follows a real octave jump up after a few frames', () => {
  const tracker = createPitchTracker();
  const low = makeSine(200, SAMPLE_RATE, BUFFER_LENGTH);
  const high = makeSine(400, SAMPLE_RATE, BUFFER_LENGTH);
  tracker.detect(low, SAMPLE_RATE);
  tracker.detect(low, SAMPLE_RATE);
  const results = [];
  for (let i = 0; i < 20; i++) results.push(tracker.detect(high, SAMPLE_RATE));
  assert.ok(Math.abs(results[results.length - 1] - 400) < 4, `last result should be ~400, got ${results[results.length - 1]}`);
  const firstHigh = results.findIndex((f) => Math.abs(f - 400) < 4);
  assert.ok(firstHigh >= 0 && firstHigh <= 12, `should switch within 13 frames, switched at ${firstHigh}`);
});

test('createPitchTracker follows a real octave jump down immediately', () => {
  const tracker = createPitchTracker();
  tracker.detect(makeSine(400, SAMPLE_RATE, BUFFER_LENGTH), SAMPLE_RATE);
  const detected = tracker.detect(makeSine(200, SAMPLE_RATE, BUFFER_LENGTH), SAMPLE_RATE);
  assert.ok(Math.abs(detected - 200) < 3, `expected ~200, got ${detected}`);
});

test('createPitchTracker forgets the previous pitch after reset()', () => {
  const tracker = createPitchTracker();
  const steady = makeSine(200, SAMPLE_RATE, BUFFER_LENGTH);
  tracker.detect(steady, SAMPLE_RATE);
  tracker.reset();
  const detected = tracker.detect(SUBHARMONIC_FRAME(), SAMPLE_RATE);
  assert.ok(Math.abs(detected - 100) < 2, `without history the plain detector's answer applies, got ${detected}`);
});

test('createPitchTracker forgets the previous pitch after a long run of unvoiced frames', () => {
  const tracker = createPitchTracker();
  tracker.detect(makeSine(200, SAMPLE_RATE, BUFFER_LENGTH), SAMPLE_RATE);
  for (let i = 0; i < 10; i++) tracker.detect(new Float32Array(BUFFER_LENGTH), SAMPLE_RATE);
  const detected = tracker.detect(SUBHARMONIC_FRAME(), SAMPLE_RATE);
  assert.ok(Math.abs(detected - 100) < 2, `history should have expired, got ${detected}`);
});

test('createPitchTracker does not hold back a genuine melodic leap that is not an octave', () => {
  const tracker = createPitchTracker();
  const low = makeSine(200, SAMPLE_RATE, BUFFER_LENGTH);
  tracker.detect(low, SAMPLE_RATE);
  tracker.detect(low, SAMPLE_RATE);
  const detected = tracker.detect(makeSine(267, SAMPLE_RATE, BUFFER_LENGTH), SAMPLE_RATE);
  assert.ok(Math.abs(detected - 267) / 267 < 0.01, `expected ~267, got ${detected}`);
});
