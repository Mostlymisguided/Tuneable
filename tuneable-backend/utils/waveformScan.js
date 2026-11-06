const WAVEFORM_BARS = 96;

function peaksFromChannel(samples, bars = WAVEFORM_BARS) {
  const length = samples.length || 0;
  if (!length) return null;
  const block = Math.max(1, Math.floor(length / bars));
  const stride = Math.max(1, Math.floor(block / 24));
  const peaks = [];
  for (let i = 0; i < bars; i += 1) {
    let max = 0;
    const start = i * block;
    const end = Math.min(length, start + block);
    for (let j = start; j < end; j += stride) {
      const sample = Math.abs(samples[j] || 0);
      if (sample > max) max = sample;
    }
    peaks.push(max);
  }
  const top = Math.max(...peaks, 0.0001);
  return peaks.map((peak) => Math.round((peak / top) * 100) / 100);
}

function readAscii(buffer, offset, length) {
  return buffer.toString('ascii', offset, offset + length);
}

function peaksFromWav(buffer) {
  if (buffer.length < 44 || readAscii(buffer, 0, 4) !== 'RIFF' || readAscii(buffer, 8, 4) !== 'WAVE') {
    return null;
  }
  let offset = 12;
  let audioFormat = 1;
  let channels = 1;
  let bitsPerSample = 16;
  let dataOffset = -1;
  let dataSize = 0;
  while (offset + 8 <= buffer.length) {
    const id = readAscii(buffer, offset, 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (id === 'fmt ' && size >= 16) {
      audioFormat = buffer.readUInt16LE(start);
      channels = buffer.readUInt16LE(start + 2);
      bitsPerSample = buffer.readUInt16LE(start + 14);
    } else if (id === 'data') {
      dataOffset = start;
      dataSize = size;
      break;
    }
    offset = start + size + (size % 2);
  }
  if (dataOffset < 0 || channels < 1) return null;
  if (audioFormat !== 1 || (bitsPerSample !== 16 && bitsPerSample !== 8)) return null;
  const bytesPerSample = bitsPerSample / 8;
  const frameSize = bytesPerSample * channels;
  const frames = Math.floor(Math.min(dataSize, buffer.length - dataOffset) / frameSize);
  if (!frames) return null;
  const samples = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) {
    const at = dataOffset + (i * frameSize);
    if (bitsPerSample === 16) {
      samples[i] = buffer.readInt16LE(at) / 32768;
    } else {
      samples[i] = (buffer[at] - 128) / 128;
    }
  }
  return peaksFromChannel(samples);
}

async function peaksFromMp3(buffer) {
  let MPEGDecoder;
  try {
    ({ MPEGDecoder } = require('mpg123-decoder'));
  } catch (error) {
    console.warn('waveform scan: mpg123-decoder is not installed');
    return null;
  }
  const decoder = new MPEGDecoder();
  await decoder.ready;
  try {
    const decoded = decoder.decode(new Uint8Array(buffer));
    const channel = decoded?.channelData?.[0];
    if (!channel || !channel.length) return null;
    return peaksFromChannel(channel);
  } finally {
    decoder.free();
  }
}

async function scanWaveformPeaks(buffer, filename = '') {
  if (!buffer || !buffer.length) return null;
  const name = String(filename).toLowerCase();
  const isWav = name.endsWith('.wav') || (buffer.length > 12 && readAscii(buffer, 0, 4) === 'RIFF');
  if (isWav) return peaksFromWav(buffer);
  return peaksFromMp3(buffer);
}

module.exports = {
  WAVEFORM_BARS,
  peaksFromChannel,
  peaksFromWav,
  scanWaveformPeaks,
};
