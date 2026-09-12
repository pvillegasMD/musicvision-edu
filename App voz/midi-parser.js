function parseMidi(buffer) {
  const dv = new DataView(buffer);
  let p = 0;
  const r1 = () => dv.getUint8(p++);
  const r2 = () => { const v = dv.getUint16(p); p += 2; return v; };
  const r4 = () => { const v = dv.getUint32(p); p += 4; return v; };
  const rVL = () => { let v = 0, b; do { b = r1(); v = (v << 7) | (b & 0x7F); } while (b & 0x80); return v; };

  if (r4() !== 0x4D546864) throw new Error('No es un archivo MIDI válido');
  r4();
  r2();
  const numTracks = r2();
  const ticksPerBeat = r2();

  const allEvents = [];
  for (let t = 0; t < numTracks; t++) {
    const chunkId = r4();
    const chunkLen = r4();
    if (chunkId !== 0x4D54726B) { p += chunkLen; continue; }
    const trackEnd = p + chunkLen;
    let tick = 0, lastStatus = 0;
    while (p < trackEnd) {
      const delta = rVL();
      tick += delta;
      let status = r1();
      if (status < 0x80) { p--; status = lastStatus; } else { lastStatus = status; }
      const type = status & 0xF0;
      if (type === 0x80 || type === 0x90) {
        const note = r1(), vel = r1();
        allEvents.push({ tick, type: (type === 0x90 && vel > 0) ? 'on' : 'off', note });
      } else if (type === 0xA0 || type === 0xB0 || type === 0xE0) {
        r1(); r1();
      } else if (type === 0xC0 || type === 0xD0) {
        r1();
      } else if (status === 0xFF) {
        const metaType = r1(), len = rVL();
        if (metaType === 0x51 && len === 3) {
          allEvents.push({ tick, type: 'tempo', value: (r1() << 16) | (r1() << 8) | r1() });
        } else {
          p += len;
        }
      } else if (status === 0xF0 || status === 0xF7) {
        p += rVL();
      } else {
        throw new Error('Byte de estado MIDI desconocido: 0x' + status.toString(16));
      }
    }
    p = trackEnd;
  }

  const tempoMap = [{ tick: 0, tempo: 500000 }];
  allEvents.forEach(e => { if (e.type === 'tempo') tempoMap.push({ tick: e.tick, tempo: e.value }); });
  tempoMap.sort((a, b) => a.tick - b.tick);

  function tickToSeconds(targetTick) {
    let seconds = 0, prevTick = 0, prevTempo = 500000;
    for (const { tick, tempo } of tempoMap) {
      if (tick >= targetTick) break;
      seconds += (Math.min(tick, targetTick) - prevTick) * (prevTempo / 1000000) / ticksPerBeat;
      prevTick = tick;
      prevTempo = tempo;
    }
    seconds += (targetTick - prevTick) * (prevTempo / 1000000) / ticksPerBeat;
    return seconds;
  }

  const onStack = {};
  const notes = [];
  allEvents
    .slice()
    .sort((a, b) => a.tick - b.tick)
    .forEach(e => {
      if (e.type === 'on') {
        (onStack[e.note] = onStack[e.note] || []).push(e.tick);
      } else if (e.type === 'off') {
        const stack = onStack[e.note];
        if (stack && stack.length) {
          const startTick = stack.shift();
          const start = tickToSeconds(startTick);
          const duration = Math.max(0.001, tickToSeconds(e.tick) - start);
          notes.push({ pitch: e.note, start, duration });
        }
      }
    });
  notes.sort((a, b) => a.start - b.start);

  const durationSec = notes.reduce((max, n) => Math.max(max, n.start + n.duration), 0);

  const beats = [];
  let beatTick = 0;
  const maxBeats = 100000; // safety cap against a corrupt/degenerate tempo map
  while (beats.length < maxBeats) {
    const t = tickToSeconds(beatTick);
    beats.push(t);
    if (t >= durationSec) break;
    beatTick += ticksPerBeat;
  }

  return { notes, durationSec, beats };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseMidi };
}
