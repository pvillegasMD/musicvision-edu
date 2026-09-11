function centsOffTarget(frequency, targetMidi) {
  const exactMidi = 69 + 12 * Math.log2(frequency / 440);
  return (exactMidi - targetMidi) * 100;
}

function isInTune(cents, tolerance = 50) {
  return Math.abs(cents) <= tolerance;
}

function noteStatus(note, currentTime) {
  if (currentTime < note.start) return 'upcoming';
  if (currentTime <= note.start + note.duration) return 'active';
  return 'past';
}

function accumulateTuning(progress, isInTuneNow, deltaSeconds) {
  return {
    timeInTune: progress.timeInTune + (isInTuneNow ? deltaSeconds : 0),
    timeTotal: progress.timeTotal + deltaSeconds
  };
}

function tuningRatio(progress) {
  if (progress.timeTotal <= 0) return 0;
  return progress.timeInTune / progress.timeTotal;
}

function liveNoteColor(detectedFrequency, targetMidi, tolerance = 50) {
  if (detectedFrequency === null) return 'no-signal';
  return isInTune(centsOffTarget(detectedFrequency, targetMidi), tolerance) ? 'in-tune' : 'out-of-tune';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { centsOffTarget, isInTune, noteStatus, accumulateTuning, tuningRatio, liveNoteColor };
}
