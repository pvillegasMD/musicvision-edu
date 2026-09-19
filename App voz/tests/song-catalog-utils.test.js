const test = require('node:test');
const assert = require('node:assert/strict');
const { sortSongsByTitle, buildFailureReport } = require('../song-catalog-utils.js');

test('sortSongsByTitle sorts songs alphabetically by titulo', () => {
  const songs = [
    { id: 'b', titulo: 'Bajo la lluvia' },
    { id: 'a', titulo: 'Amor Completo' },
    { id: 'c', titulo: 'Canción sin nombre' }
  ];
  const sorted = sortSongsByTitle(songs);
  assert.deepEqual(sorted.map((s) => s.id), ['a', 'b', 'c']);
});

test('sortSongsByTitle does not mutate the input array', () => {
  const songs = [{ id: 'b', titulo: 'Bajo' }, { id: 'a', titulo: 'Amor' }];
  const original = songs.map((s) => ({ ...s }));
  sortSongsByTitle(songs);
  assert.deepEqual(songs, original);
});

test('sortSongsByTitle handles an empty array', () => {
  assert.deepEqual(sortSongsByTitle([]), []);
});

test('buildFailureReport reports only WAV when only the WAV failed', () => {
  const report = buildFailureReport('Amor Completo', 'HTTP 404', null, '2026-09-18T12:00:00.000Z');
  assert.equal(report.cancion, 'Amor Completo');
  assert.equal(report.archivos_fallidos, 'WAV');
  assert.equal(report.error_wav, 'HTTP 404');
  assert.equal(report.error_midi, '');
  assert.equal(report.fecha, '2026-09-18T12:00:00.000Z');
});

test('buildFailureReport reports only MIDI when only the MIDI failed', () => {
  const report = buildFailureReport('Amor Completo', null, 'HTTP 500', '2026-09-18T12:00:00.000Z');
  assert.equal(report.archivos_fallidos, 'MIDI');
  assert.equal(report.error_wav, '');
  assert.equal(report.error_midi, 'HTTP 500');
});

test('buildFailureReport reports both when both failed', () => {
  const report = buildFailureReport('Amor Completo', 'HTTP 404', 'Archivo MIDI inválido', '2026-09-18T12:00:00.000Z');
  assert.equal(report.archivos_fallidos, 'WAV, MIDI');
  assert.equal(report.error_wav, 'HTTP 404');
  assert.equal(report.error_midi, 'Archivo MIDI inválido');
});
