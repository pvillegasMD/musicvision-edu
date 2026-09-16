function buildReportSvg(notes, noteProgress, fullPitchHistory, options, geometryFns) {
  const { pitchRange, computeNoteRect, pitchToY, pitchPointX, shouldBreakLine } = geometryFns;
  const { pixelsPerSecond, rowHeight, height, gapThresholdSec, colors } = options;
  const { minPitch, maxPitch } = pitchRange(notes);
  const durationSec = notes.reduce((max, n) => Math.max(max, n.start + n.duration), 0);
  const width = Math.max(1, Math.round(durationSec * pixelsPerSecond));

  const view = {
    currentTime: 0,
    pixelsPerSecond,
    playheadX: 0,
    minPitch,
    maxPitch,
    canvasHeight: height,
    rowHeight
  };

  const noteRects = notes.map((note, i) => {
    const rect = computeNoteRect(note, view);
    const progress = noteProgress[i];
    if (!progress.hadSignal) {
      return `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" fill="${colors.noSignal}" />`;
    }
    const ratio = progress.timeTotal > 0 ? progress.timeInTune / progress.timeTotal : 0;
    const greenWidth = rect.width * ratio;
    return (
      `<rect x="${rect.x}" y="${rect.y}" width="${greenWidth}" height="${rect.height}" fill="${colors.inTune}" />` +
      `<rect x="${rect.x + greenWidth}" y="${rect.y}" width="${rect.width - greenWidth}" height="${rect.height}" fill="${colors.outOfTune}" />`
    );
  }).join('\n');

  let pathData = '';
  fullPitchHistory.forEach((point, i) => {
    const x = pitchPointX(point.time, 0, pixelsPerSecond, 0);
    const y = pitchToY(point.pitch, minPitch, maxPitch, height);
    if (i === 0 || shouldBreakLine(fullPitchHistory[i - 1].time, point.time, gapThresholdSec)) {
      pathData += `M ${x} ${y} `;
    } else {
      pathData += `L ${x} ${y} `;
    }
  });
  const pitchPath = fullPitchHistory.length > 0
    ? `<path d="${pathData.trim()}" fill="none" stroke="${colors.pitchLine}" stroke-width="2" />`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n${noteRects}\n${pitchPath}\n</svg>`;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { buildReportSvg };
}
