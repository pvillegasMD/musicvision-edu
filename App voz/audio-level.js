function computeLevel(byteTimeDomainData) {
  let sumSquares = 0;
  let peak = 0;
  for (let i = 0; i < byteTimeDomainData.length; i++) {
    const normalized = (byteTimeDomainData[i] - 128) / 128;
    sumSquares += normalized * normalized;
    const abs = Math.abs(normalized);
    if (abs > peak) peak = abs;
  }
  const rms = Math.sqrt(sumSquares / byteTimeDomainData.length);
  return { rms, peak };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { computeLevel };
}
