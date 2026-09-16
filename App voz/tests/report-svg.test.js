const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReportSvg } = require('../report-svg.js');
const geometryFns = require('../piano-roll-geometry.js');

const OPTIONS = {
  pixelsPerSecond: 100,
  rowHeight: 18,
  height: 240,
  gapThresholdSec: 0.15,
  durationSec: 0,
  colors: { inTune: '#3ecf6e', outOfTune: '#e05a4e', noSignal: '#6b7280', pitchLine: '#f5d90a' }
};

test('buildReportSvg returns an svg root element sized to the song duration', () => {
  const notes = [{ start: 0, duration: 1, pitch: 60 }, { start: 2, duration: 1, pitch: 64 }];
  const noteProgress = [
    { timeInTune: 1, timeTotal: 1, hadSignal: true },
    { timeInTune: 0, timeTotal: 0, hadSignal: false }
  ];
  const svg = buildReportSvg(notes, noteProgress, [], OPTIONS, geometryFns);
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="300" height="240"/);
});

test('buildReportSvg draws a solid no-signal rect for a note that was never sung', () => {
  const notes = [{ start: 0, duration: 1, pitch: 60 }];
  const noteProgress = [{ timeInTune: 0, timeTotal: 0, hadSignal: false }];
  const svg = buildReportSvg(notes, noteProgress, [], OPTIONS, geometryFns);
  assert.match(svg, /fill="#6b7280"/);
  assert.doesNotMatch(svg, /fill="#3ecf6e"/);
});

test('buildReportSvg draws a bicolor bar (in-tune + out-of-tune) for a sung note', () => {
  const notes = [{ start: 0, duration: 1, pitch: 60 }];
  const noteProgress = [{ timeInTune: 0.5, timeTotal: 1, hadSignal: true }];
  const svg = buildReportSvg(notes, noteProgress, [], OPTIONS, geometryFns);
  assert.match(svg, /fill="#3ecf6e"/);
  assert.match(svg, /fill="#e05a4e"/);
});

test('buildReportSvg draws a pitch path that breaks across a gap larger than the threshold', () => {
  const notes = [{ start: 0, duration: 5, pitch: 60 }];
  const noteProgress = [{ timeInTune: 0, timeTotal: 0, hadSignal: false }];
  // first 3 points close together (0.05s gaps, under the 0.15s threshold -> connected);
  // then a jump to t=3 (2.9s gap, over the threshold -> a new M break)
  const history = [
    { time: 0, pitch: 60 }, { time: 0.05, pitch: 60 }, { time: 0.1, pitch: 60 }, { time: 3, pitch: 60 }
  ];
  const svg = buildReportSvg(notes, noteProgress, history, OPTIONS, geometryFns);
  const moveCommands = (svg.match(/M /g) || []).length;
  assert.equal(moveCommands, 2);
});

test('buildReportSvg omits the pitch path element entirely when there is no pitch history', () => {
  const notes = [{ start: 0, duration: 1, pitch: 60 }];
  const noteProgress = [{ timeInTune: 0, timeTotal: 0, hadSignal: false }];
  const svg = buildReportSvg(notes, noteProgress, [], OPTIONS, geometryFns);
  assert.doesNotMatch(svg, /<path/);
});

test('buildReportSvg handles an empty notes array without throwing', () => {
  const svg = buildReportSvg([], [], [], OPTIONS, geometryFns);
  assert.match(svg, /^<svg/);
});

test('buildReportSvg widens the SVG to cover options.durationSec when it exceeds the notes span', () => {
  const notes = [{ start: 0, duration: 1, pitch: 60 }]; // notes span = 1s
  const noteProgress = [{ timeInTune: 1, timeTotal: 1, hadSignal: true }];
  const svg = buildReportSvg(notes, noteProgress, [], { ...OPTIONS, durationSec: 5 }, geometryFns);
  assert.match(svg, /width="500"/); // 5s * 100px/s, not 1s * 100px/s = 100
});
