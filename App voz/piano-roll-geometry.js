function pitchRange(notes) {
  if (!notes.length) return { minPitch: 60, maxPitch: 72 };
  const pitches = notes.map(n => n.pitch);
  return {
    minPitch: Math.min(...pitches) - 2,
    maxPitch: Math.max(...pitches) + 2
  };
}

function pitchToY(pitch, minPitch, maxPitch, canvasHeight) {
  if (maxPitch === minPitch) return canvasHeight / 2;
  return canvasHeight * (maxPitch - pitch) / (maxPitch - minPitch);
}

function computeSemitoneGridLines(minPitch, maxPitch, canvasHeight) {
  const lines = [];
  const start = Math.ceil(minPitch);
  const end = Math.floor(maxPitch);
  for (let pitch = start; pitch <= end; pitch++) {
    lines.push(pitchToY(pitch, minPitch, maxPitch, canvasHeight));
  }
  return lines;
}

function computeNoteRect(note, view) {
  const { currentTime, pixelsPerSecond, playheadX, minPitch, maxPitch, canvasHeight, rowHeight } = view;
  const x = playheadX + (note.start - currentTime) * pixelsPerSecond;
  const width = note.duration * pixelsPerSecond;
  const y = pitchToY(note.pitch, minPitch, maxPitch, canvasHeight) - rowHeight / 2;
  return { x, y, width, height: rowHeight };
}

function desintegrationProgress(currentTime, noteEndTime, scrollOutDurationSec) {
  if (scrollOutDurationSec <= 0) return 1;
  const elapsed = currentTime - noteEndTime;
  return Math.max(0, Math.min(1, elapsed / scrollOutDurationSec));
}

function pitchPointX(pointTime, currentTime, pixelsPerSecond, playheadX) {
  return playheadX + (pointTime - currentTime) * pixelsPerSecond;
}

function shouldBreakLine(prevTime, nextTime, gapThresholdSec = 0.15) {
  return (nextTime - prevTime) > gapThresholdSec;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { pitchRange, pitchToY, computeNoteRect, desintegrationProgress, pitchPointX, shouldBreakLine, computeSemitoneGridLines };
}
