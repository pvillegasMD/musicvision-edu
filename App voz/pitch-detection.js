function computeCmndf(buffer) {
  const n = buffer.length;
  const maxTau = Math.floor(n / 2);

  // Step 1: difference function d(tau) = sum of (x[j] - x[j+tau])^2
  const diff = new Float32Array(maxTau);
  diff[0] = 0;
  for (let tau = 1; tau < maxTau; tau++) {
    let sum = 0;
    for (let j = 0; j < maxTau; j++) {
      const delta = buffer[j] - buffer[j + tau];
      sum += delta * delta;
    }
    diff[tau] = sum;
  }

  // Step 2: cumulative mean normalized difference function (CMNDF)
  const cmndf = new Float32Array(maxTau);
  cmndf[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau < maxTau; tau++) {
    runningSum += diff[tau];
    cmndf[tau] = diff[tau] / (runningSum / tau);
  }
  return cmndf;
}

function refineTau(cmndf, tauEstimate) {
  const maxTau = cmndf.length;
  if (tauEstimate > 0 && tauEstimate < maxTau - 1) {
    const s0 = cmndf[tauEstimate - 1];
    const s1 = cmndf[tauEstimate];
    const s2 = cmndf[tauEstimate + 1];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (denom !== 0) {
      const adjustment = (s2 - s0) / denom;
      if (isFinite(adjustment) && Math.abs(adjustment) < 1) {
        return tauEstimate + adjustment;
      }
    }
  }
  return tauEstimate;
}

function detectPitch(buffer, sampleRate, threshold = 0.15) {
  const cmndf = computeCmndf(buffer);
  const maxTau = cmndf.length;

  // Step 3: absolute threshold — find the first dip below `threshold`, then
  // walk forward to its local minimum.
  let tauEstimate = -1;
  for (let tau = 2; tau < maxTau; tau++) {
    if (cmndf[tau] < threshold) {
      while (tau + 1 < maxTau && cmndf[tau + 1] < cmndf[tau]) {
        tau++;
      }
      tauEstimate = tau;
      break;
    }
  }

  if (tauEstimate === -1) return null;

  // Step 4: parabolic interpolation around tauEstimate for sub-sample precision.
  const betterTau = refineTau(cmndf, tauEstimate);

  return sampleRate / betterTau;
}

// Local minima of the CMNDF inside the vocal range: each is a candidate period.
// They come ordered by increasing tau (decreasing frequency).
function findPitchCandidates(cmndf, sampleRate, minFrequency, maxFrequency, ceiling) {
  const lo = Math.max(2, Math.floor(sampleRate / maxFrequency));
  const hi = Math.min(cmndf.length - 2, Math.ceil(sampleRate / minFrequency));
  const candidates = [];
  for (let tau = lo + 1; tau <= hi; tau++) {
    if (cmndf[tau] < ceiling && cmndf[tau] <= cmndf[tau - 1] && cmndf[tau] < cmndf[tau + 1]) {
      candidates.push({ frequency: sampleRate / refineTau(cmndf, tau), value: cmndf[tau] });
    }
  }
  return candidates;
}

function semitoneDistance(a, b) {
  return Math.abs(12 * Math.log2(a / b));
}

// True when a and b differ by one or more octaves (within a semitone of tolerance).
function isOctaveOf(a, b) {
  const octaves = Math.abs(12 * Math.log2(a / b)) / 12;
  return octaves >= 0.9 && Math.abs(octaves - Math.round(octaves)) * 12 < 1;
}

// A pitch detector with memory. Plain YIN sometimes answers an octave too high or too
// low for a frame or two (typical of chest voice and noisy microphones). Every octave is a
// valid period of the same signal, so among the candidate periods that are about as good as
// the best one, this picks the one closest to the previous frame's pitch. A real octave jump
// is followed after `maxOverrideFrames` frames, so a genuine change of register is not stuck.
function createPitchTracker(options = {}) {
  const threshold = options.threshold === undefined ? 0.15 : options.threshold;
  const margin = options.margin === undefined ? 0.5 : options.margin;
  const minFrequency = options.minFrequency === undefined ? 70 : options.minFrequency;
  const maxFrequency = options.maxFrequency === undefined ? 1400 : options.maxFrequency;
  const maxOverrideFrames = options.maxOverrideFrames === undefined ? 12 : options.maxOverrideFrames;
  const maxMissedFrames = options.maxMissedFrames === undefined ? 6 : options.maxMissedFrames;
  const minCorrection = options.minCorrectionSemitones === undefined ? 3 : options.minCorrectionSemitones;

  let previous = null;
  let overrides = 0;
  let missed = 0;

  return {
    reset() {
      previous = null;
      overrides = 0;
      missed = 0;
    },
    detect(buffer, sampleRate) {
      const cmndf = computeCmndf(buffer);
      const candidates = findPitchCandidates(cmndf, sampleRate, minFrequency, maxFrequency, threshold + margin);
      const confident = candidates.filter((c) => c.value < threshold);
      if (confident.length === 0) {
        missed += 1;
        if (missed > maxMissedFrames) {
          previous = null;
          overrides = 0;
        }
        return null;
      }
      missed = 0;

      // Plain YIN's answer: the first (highest-frequency) clear dip.
      const standard = confident[0];
      let chosen = standard;
      if (previous !== null) {
        const bestValue = Math.min(...candidates.map((c) => c.value));
        let closest = standard;
        for (const c of candidates) {
          if (c.value > bestValue + margin) continue;
          if (!isOctaveOf(c.frequency, standard.frequency)) continue;
          if (semitoneDistance(c.frequency, previous) < semitoneDistance(closest.frequency, previous)) {
            closest = c;
          }
        }
        const gain = semitoneDistance(standard.frequency, previous) - semitoneDistance(closest.frequency, previous);
        if (gain > minCorrection && overrides < maxOverrideFrames) {
          chosen = closest;
          overrides += 1;
        } else {
          overrides = 0;
        }
      }
      previous = chosen.frequency;
      return chosen.frequency;
    }
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { detectPitch, createPitchTracker };
}
