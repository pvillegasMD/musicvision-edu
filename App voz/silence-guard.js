function countUnsungBeats(beats, notes, sinceTime, uptoTime) {
  let count = 0;
  let gapStreak = 0;
  for (const t of beats) {
    if (t <= sinceTime || t > uptoTime) continue;
    const covered = notes.some(n => t >= n.start && t <= n.start + n.duration);
    if (covered) {
      gapStreak = 0;
      count += 1;
    } else {
      gapStreak += 1;
      if (gapStreak >= 4) {
        count = 0;
      }
    }
  }
  return count;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { countUnsungBeats };
}
