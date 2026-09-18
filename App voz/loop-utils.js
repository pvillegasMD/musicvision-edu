function computeLoopEngaged(active, position, loopStart, loopEnd) {
  if (!active) return false;
  return position >= loopStart && position < loopEnd;
}

function clampLoopStart(candidate, loopEnd, minGap) {
  return Math.min(Math.max(candidate, 0), loopEnd - minGap);
}

function clampLoopEnd(candidate, loopStart, minGap, duration) {
  return Math.max(Math.min(candidate, duration), loopStart + minGap);
}

function hitTestLoopMarker(time, loopStart, loopEnd, tolerance) {
  if (Math.abs(time - loopStart) <= tolerance) return 'start';
  if (Math.abs(time - loopEnd) <= tolerance) return 'end';
  return null;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { computeLoopEngaged, clampLoopStart, clampLoopEnd, hitTestLoopMarker };
}
