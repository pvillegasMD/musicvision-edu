function sortSongsByTitle(songs) {
  return [...songs].sort((a, b) => a.titulo.localeCompare(b.titulo));
}

function buildFailureReport(songTitle, wavError, midiError, timestamp) {
  const failed = [];
  if (wavError) failed.push('WAV');
  if (midiError) failed.push('MIDI');
  return {
    cancion: songTitle,
    archivos_fallidos: failed.join(', '),
    error_wav: wavError || '',
    error_midi: midiError || '',
    fecha: timestamp
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { sortSongsByTitle, buildFailureReport };
}
