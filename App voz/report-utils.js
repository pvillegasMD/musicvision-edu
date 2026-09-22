function isNoteInTune(progress, threshold = 0.5) {
  if (progress.timeTotal <= 0) return false;
  return (progress.timeInTune / progress.timeTotal) >= threshold;
}

function beatDurationAt(beats, time) {
  if (beats.length < 2) return 0.5;
  for (let i = 0; i < beats.length - 1; i++) {
    if (time >= beats[i] && time < beats[i + 1]) {
      return beats[i + 1] - beats[i];
    }
  }
  if (time < beats[0]) return beats[1] - beats[0];
  return beats[beats.length - 1] - beats[beats.length - 2];
}

function startedOnTime(progress, note, beats) {
  if (progress.firstSignalTime === null || progress.firstSignalTime === undefined) return false;
  const tolerance = beatDurationAt(beats, note.start) / 2;
  return Math.abs(progress.firstSignalTime - note.start) <= tolerance;
}

function longestStreak(values, target) {
  let longest = 0;
  let current = 0;
  values.forEach((value) => {
    if (value === target) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  });
  return longest;
}

function computeReportStats(notes, noteProgress, beats) {
  const perNote = notes.map((note, i) => {
    const progress = noteProgress[i];
    return {
      index: i,
      start: note.start,
      pitch: note.pitch,
      sung: progress.hadSignal === true,
      inTune: isNoteInTune(progress),
      onTime: startedOnTime(progress, note, beats)
    };
  });

  const totalNotes = perNote.length;
  const inTuneCount = perNote.filter((n) => n.inTune).length;
  const onTimeCount = perNote.filter((n) => n.onTime).length;

  return {
    totalNotes,
    inTuneCount,
    inTunePercent: totalNotes > 0 ? (inTuneCount / totalNotes) * 100 : 0,
    onTimeCount,
    onTimePercent: totalNotes > 0 ? (onTimeCount / totalNotes) * 100 : 0,
    longestInTuneStreak: longestStreak(perNote.map((n) => n.inTune), true),
    longestOutOfTuneStreak: longestStreak(perNote.map((n) => n.inTune), false),
    perNote
  };
}

function formatReportText(stats, durationSec, midiToNoteName) {
  const lines = [];
  lines.push('Informe de desempeño — App voz');
  lines.push(`Duración: ${durationSec.toFixed(2)}s — ${stats.totalNotes} notas`);
  lines.push('');
  lines.push(`% de notas afinadas: ${stats.inTunePercent.toFixed(1)}% (${stats.inTuneCount}/${stats.totalNotes})`);
  lines.push(`% de notas que empezaron a tiempo: ${stats.onTimePercent.toFixed(1)}% (${stats.onTimeCount}/${stats.totalNotes})`);
  lines.push(`Racha máxima de notas afinadas seguidas: ${stats.longestInTuneStreak}`);
  lines.push(`Racha máxima de notas desafinadas seguidas: ${stats.longestOutOfTuneStreak}`);
  lines.push('');
  lines.push('Detalle por nota:');
  lines.push('Hora\tNota\tA tiempo\tAfinada');
  stats.perNote.forEach((n) => {
    lines.push(`${n.start.toFixed(2)}s\t${midiToNoteName(n.pitch)}\t${n.onTime ? 'sí' : 'no'}\t${n.inTune ? 'sí' : 'no'}`);
  });
  return lines.join('\n');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { isNoteInTune, beatDurationAt, startedOnTime, longestStreak, computeReportStats, formatReportText };
}
