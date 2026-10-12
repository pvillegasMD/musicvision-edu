const fs = require('fs');
const path = require('path');

function makeWavFixture(outPath) {
  const sampleRate = 44100;
  // Matches tests/fixtures/sample.mid: C4 (261.63Hz) for 0.5s, then D4 (293.66Hz) for 0.5s.
  const notes = [
    { freq: 261.63, start: 0, duration: 0.5 },
    { freq: 293.66, start: 0.5, duration: 0.5 }
  ];
  const totalSamples = Math.round(sampleRate * 1.0);
  const data = new Int16Array(totalSamples);

  for (const note of notes) {
    const startSample = Math.round(note.start * sampleRate);
    const numSamples = Math.round(note.duration * sampleRate);
    const fadeSamples = Math.round(sampleRate * 0.01);
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      let amp = 0.4;
      if (i < fadeSamples) amp *= i / fadeSamples;
      if (i > numSamples - fadeSamples) amp *= (numSamples - i) / fadeSamples;
      const sample = Math.sin(2 * Math.PI * note.freq * t) * amp;
      data[startSample + i] = Math.round(sample * 32767);
    }
  }

  const bytesPerSample = 2, numChannels = 1;
  const byteRate = sampleRate * numChannels * bytesPerSample;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = data.length * bytesPerSample;

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  const body = Buffer.from(data.buffer);
  fs.writeFileSync(outPath, Buffer.concat([header, body]));
}

makeWavFixture(path.join(__dirname, 'sample.wav'));
console.log('Escrito', path.join(__dirname, 'sample.wav'));
