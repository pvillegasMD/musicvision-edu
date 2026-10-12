function computeCalibrationOffset(deltas, minValid = 2, minDelta = 0, maxDelta = 0.5) {
  const valid = deltas.filter(d => d !== null && d >= minDelta && d <= maxDelta);
  if (valid.length < minValid) return null;
  const sorted = [...valid].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { computeCalibrationOffset };
}
