const test = require('node:test');
const assert = require('node:assert/strict');
const { isNoteInTune, beatDurationAt, startedOnTime, longestStreak, computeReportStats, formatReportText } = require('../report-utils.js');
const { midiToNoteName } = require('../note-utils.js');

test('isNoteInTune is true at exactly the 0.5 threshold and false just under it', () => {
  assert.equal(isNoteInTune({ timeInTune: 0.5, timeTotal: 1 }), true);
  assert.equal(isNoteInTune({ timeInTune: 0.49, timeTotal: 1 }), false);
});

test('isNoteInTune is false for a note with no elapsed time (never sung)', () => {
  assert.equal(isNoteInTune({ timeInTune: 0, timeTotal: 0 }), false);
});

test('beatDurationAt returns the interval containing the given time', () => {
  const beats = [0, 1, 2, 3, 4];
  assert.equal(beatDurationAt(beats, 1.5), 1);
});

test('beatDurationAt falls back to the first interval before the first beat', () => {
  const beats = [2, 3, 4];
  assert.equal(beatDurationAt(beats, 0.5), 1);
});

test('beatDurationAt falls back to the last interval at or after the last beat', () => {
  const beats = [0, 1, 2];
  assert.equal(beatDurationAt(beats, 5), 1);
});

test('beatDurationAt returns a default when fewer than 2 beats are available', () => {
  assert.equal(beatDurationAt([], 1), 0.5);
  assert.equal(beatDurationAt([0], 1), 0.5);
});

test('startedOnTime is false when the note was never sung (firstSignalTime is null)', () => {
  const progress = { timeInTune: 0, timeTotal: 0, hadSignal: false, firstSignalTime: null };
  const note = { start: 2, duration: 1 };
  assert.equal(startedOnTime(progress, note, [0, 1, 2, 3]), false);
});

test('startedOnTime is true within half a beat of the note start, false just outside it', () => {
  const note = { start: 2, duration: 1 };
  const beats = [0, 1, 2, 3]; // 1s beat interval around note.start, so tolerance is 0.5s
  const onTime = { timeInTune: 0, timeTotal: 0, hadSignal: true, firstSignalTime: 2.5 };
  const late = { timeInTune: 0, timeTotal: 0, hadSignal: true, firstSignalTime: 2.51 };
  assert.equal(startedOnTime(onTime, note, beats), true);
  assert.equal(startedOnTime(late, note, beats), false);
});

test('longestStreak finds the longest run of a target value', () => {
  assert.equal(longestStreak([true, true, false, true, true, true, false], true), 3);
  assert.equal(longestStreak([true, true, false, true, true, true, false], false), 1);
});

test('longestStreak returns 0 for an empty array', () => {
  assert.equal(longestStreak([], true), 0);
});

test('computeReportStats aggregates in-tune %, on-time %, and both streaks correctly', () => {
  const notes = [
    { start: 0, duration: 1, pitch: 60 },
    { start: 1, duration: 1, pitch: 62 },
    { start: 2, duration: 1, pitch: 64 },
    { start: 3, duration: 1, pitch: 65 }
  ];
  const beats = [0, 1, 2, 3, 4]; // 1s intervals, 0.5s tolerance throughout
  const noteProgress = [
    { timeInTune: 0.9, timeTotal: 1, hadSignal: true, firstSignalTime: 0.1 },  // in tune, on time
    { timeInTune: 0.9, timeTotal: 1, hadSignal: true, firstSignalTime: 1.1 },  // in tune, on time
    { timeInTune: 0.1, timeTotal: 1, hadSignal: true, firstSignalTime: 2.9 },  // out of tune, NOT on time (0.9s late, tolerance 0.5s)
    { timeInTune: 0, timeTotal: 0, hadSignal: false, firstSignalTime: null }   // never sung
  ];

  const stats = computeReportStats(notes, noteProgress, beats);

  assert.equal(stats.totalNotes, 4);
  assert.equal(stats.inTuneCount, 2);
  assert.equal(stats.inTunePercent, 50);
  assert.equal(stats.onTimeCount, 2);
  assert.equal(stats.onTimePercent, 50);
  assert.equal(stats.longestInTuneStreak, 2);
  assert.equal(stats.longestOutOfTuneStreak, 2);
  assert.equal(stats.perNote.length, 4);
  assert.equal(stats.perNote[3].sung, false);
});

test('computeReportStats returns 0% for both percentages when there are no notes', () => {
  const stats = computeReportStats([], [], []);
  assert.equal(stats.totalNotes, 0);
  assert.equal(stats.inTunePercent, 0);
  assert.equal(stats.onTimePercent, 0);
  assert.equal(stats.longestInTuneStreak, 0);
  assert.equal(stats.longestOutOfTuneStreak, 0);
});

test('formatReportText includes the 4 summary metrics and a row per note', () => {
  const stats = {
    totalNotes: 2,
    inTuneCount: 1,
    inTunePercent: 50,
    onTimeCount: 2,
    onTimePercent: 100,
    longestInTuneStreak: 1,
    longestOutOfTuneStreak: 1,
    perNote: [
      { index: 0, start: 0, pitch: 60, sung: true, inTune: true, onTime: true },
      { index: 1, start: 1, pitch: 62, sung: true, inTune: false, onTime: true }
    ]
  };
  const text = formatReportText(stats, 2.5, midiToNoteName);
  assert.match(text, /50\.0%/);
  assert.match(text, /100\.0%/);
  assert.match(text, /Racha máxima de notas afinadas seguidas: 1/);
  assert.match(text, /Racha máxima de notas desafinadas seguidas: 1/);
  assert.match(text, /C4/);
  assert.match(text, /D4/);
});
