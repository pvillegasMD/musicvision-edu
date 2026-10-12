function frequencyToMidi(frequency) {
  return 69 + 12 * Math.log2(frequency / 440);
}

function midiToNoteName(midiNumber) {
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const rounded = Math.round(midiNumber);
  const name = NOTE_NAMES[((rounded % 12) + 12) % 12];
  const octave = Math.floor(rounded / 12) - 1;
  return `${name}${octave}`;
}

function describePitch(frequency) {
  const exactMidi = frequencyToMidi(frequency);
  const roundedMidi = Math.round(exactMidi);
  const cents = (exactMidi - roundedMidi) * 100;
  return {
    midi: roundedMidi,
    noteName: midiToNoteName(roundedMidi),
    cents
  };
}

function playbackRateForNote(targetMidi, referenceMidi) {
  return Math.pow(2, (targetMidi - referenceMidi) / 12);
}

function transposeNotes(notes, semitones) {
  return notes.map((note) => ({ ...note, pitch: note.pitch + semitones }));
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { frequencyToMidi, midiToNoteName, describePitch, playbackRateForNote, transposeNotes };
}
