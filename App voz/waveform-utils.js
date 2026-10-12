function computeWaveformPeaks(samples, width) {
  if (width <= 0) return [];
  const n = samples.length;
  if (n === 0) {
    return Array.from({ length: width }, () => ({ min: 0, max: 0 }));
  }
  const samplesPerPixel = n / width;
  const peaks = [];
  for (let col = 0; col < width; col++) {
    const start = Math.floor(col * samplesPerPixel);
    const end = Math.max(start + 1, Math.floor((col + 1) * samplesPerPixel));
    let min = samples[start];
    let max = samples[start];
    for (let i = start; i < end && i < n; i++) {
      const value = samples[i];
      if (value < min) min = value;
      if (value > max) max = value;
    }
    peaks.push({ min, max });
  }
  return peaks;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { computeWaveformPeaks };
}
