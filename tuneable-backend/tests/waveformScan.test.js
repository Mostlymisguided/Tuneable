/**
 * Waveform peak scan from PCM. Run: npx jest tests/waveformScan.test.js
 */

const { peaksFromWav, peaksFromChannel } = require('../utils/waveformScan');

function wavWithTone() {
  const channels = 1;
  const sampleRate = 8000;
  const frames = 8000;
  const dataSize = frames * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < frames; i += 1) {
    const loud = i > frames * 0.5;
    const sample = Math.round(Math.sin(i / 8) * (loud ? 30000 : 4000));
    buffer.writeInt16LE(sample, 44 + (i * 2));
  }
  return buffer;
}

describe('waveform scan', () => {
  it('normalizes a channel to 96 bars', () => {
    const peaks = peaksFromChannel(Float32Array.from([0, 0.2, 1, 0.2]));
    expect(peaks).toHaveLength(96);
    expect(Math.max(...peaks)).toBe(1);
  });

  it('reads a louder second half from a wav', () => {
    const peaks = peaksFromWav(wavWithTone());
    expect(peaks).toHaveLength(96);
    const first = peaks.slice(0, 40).reduce((sum, n) => sum + n, 0);
    const second = peaks.slice(56).reduce((sum, n) => sum + n, 0);
    expect(second).toBeGreaterThan(first);
  });
});
