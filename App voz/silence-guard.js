function countSilentBeats(beats, sinceTime, uptoTime) {
  return beats.filter(t => t > sinceTime && t <= uptoTime).length;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { countSilentBeats };
}
