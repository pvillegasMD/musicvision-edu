function round2(value) {
  return Math.round(value * 100) / 100;
}

function buildReportSvg(notes, noteProgress, fullPitchHistory, options, geometryFns) {
  const { pitchRange, computeNoteRect, pitchToY, pitchPointX, shouldBreakLine, computeSemitoneGridLines } = geometryFns;
  const { pixelsPerSecond, rowHeight, height, gapThresholdSec, colors } = options;
  const { minPitch, maxPitch } = pitchRange(notes);
  const notesEnd = notes.reduce((max, n) => Math.max(max, n.start + n.duration), 0);
  const lastPitchTime = fullPitchHistory.length > 0 ? fullPitchHistory[fullPitchHistory.length - 1].time : 0;
  const durationSec = Math.max(notesEnd, options.durationSec || 0, lastPitchTime);
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

  const gridColor = colors.gridRow || 'rgba(255,255,255,0.04)';
  const beatGridColor = colors.gridBeat || 'rgba(255,255,255,0.05)';
  const noteBorderColor = colors.noteBorder || 'rgba(0,0,0,0.28)';

  const gridRowLines = computeSemitoneGridLines(minPitch, maxPitch, height)
    .map((y) => `<line class="grid-row" x1="0" y1="${round2(y)}" x2="${width}" y2="${round2(y)}" stroke="${gridColor}" />`)
    .join('\n');

  const beats = options.beats || [];
  const gridBeatLines = beats
    .map((beatTime) => {
      const x = round2(pitchPointX(beatTime, 0, pixelsPerSecond, 0));
      return `<line class="grid-beat" x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="${beatGridColor}" />`;
    })
    .join('\n');

  const noteRects = notes.map((note, i) => {
    const rect = computeNoteRect(note, view);
    const progress = noteProgress[i];
    if (!progress.hadSignal) {
      return `<rect x="${round2(rect.x)}" y="${round2(rect.y)}" width="${round2(rect.width)}" height="${round2(rect.height)}" fill="${colors.noSignal}" stroke="${noteBorderColor}" stroke-width="1.5" />`;
    }
    const ratio = progress.timeTotal > 0 ? progress.timeInTune / progress.timeTotal : 0;
    const greenWidth = rect.width * ratio;
    return (
      `<rect x="${round2(rect.x)}" y="${round2(rect.y)}" width="${round2(greenWidth)}" height="${round2(rect.height)}" fill="${colors.inTune}" />` +
      `<rect x="${round2(rect.x + greenWidth)}" y="${round2(rect.y)}" width="${round2(rect.width - greenWidth)}" height="${round2(rect.height)}" fill="${colors.outOfTune}" />` +
      `<rect x="${round2(rect.x)}" y="${round2(rect.y)}" width="${round2(rect.width)}" height="${round2(rect.height)}" fill="none" stroke="${noteBorderColor}" stroke-width="1.5" />`
    );
  }).join('\n');

  let pathData = '';
  fullPitchHistory.forEach((point, i) => {
    const x = round2(pitchPointX(point.time, 0, pixelsPerSecond, 0));
    const y = round2(pitchToY(point.pitch, minPitch, maxPitch, height));
    if (i === 0 || shouldBreakLine(fullPitchHistory[i - 1].time, point.time, gapThresholdSec)) {
      pathData += `M ${x} ${y} `;
    } else {
      pathData += `L ${x} ${y} `;
    }
  });
  const pitchPath = fullPitchHistory.length > 0
    ? `<path d="${pathData.trim()}" fill="none" stroke="${colors.pitchLine}" stroke-width="2" />`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n${gridRowLines}\n${gridBeatLines}\n${noteRects}\n${pitchPath}\n</svg>`;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { buildReportSvg };
}
