function detectPitch(buffer, sampleRate, threshold = 0.15) {
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
  let betterTau = tauEstimate;
  if (tauEstimate > 0 && tauEstimate < maxTau - 1) {
    const s0 = cmndf[tauEstimate - 1];
    const s1 = cmndf[tauEstimate];
    const s2 = cmndf[tauEstimate + 1];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (denom !== 0) {
      const adjustment = (s2 - s0) / denom;
      if (isFinite(adjustment) && Math.abs(adjustment) < 1) {
        betterTau = tauEstimate + adjustment;
      }
    }
  }

  return sampleRate / betterTau;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { detectPitch };
}
