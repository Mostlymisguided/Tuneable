const {
  filterUploadAudioFile,
  getUploadAudioFormat,
  checkUploadAudioFile,
} = require('../utils/r2Upload');

const MB = 1024 * 1024;

function wavBuffer() {
  const buf = Buffer.alloc(44);
  buf.write('RIFF', 0, 'ascii');
  buf.write('WAVE', 8, 'ascii');
  return buf;
}

function runFilter(file) {
  return new Promise((resolve) => {
    filterUploadAudioFile(file, (err, ok) => resolve({ err, ok }));
  });
}

describe('getUploadAudioFormat', () => {
  it('detects MP3', () => {
    const format = getUploadAudioFormat({ originalname: 'Song.MP3', mimetype: 'audio/mpeg' });
    expect(format).toMatchObject({ mediaType: 'mp3', contentType: 'audio/mpeg', ext: '.mp3' });
  });

  it.each(['audio/wav', 'audio/x-wav', 'audio/vnd.wave', 'application/octet-stream', ''])(
    'detects WAV with mime %p',
    (mimetype) => {
      const format = getUploadAudioFormat({ originalname: 'Song.wav', mimetype });
      expect(format).toMatchObject({ mediaType: 'wav', contentType: 'audio/wav', ext: '.wav' });
    },
  );

  it('rejects a mismatched extension and mime', () => {
    expect(getUploadAudioFormat({ originalname: 'Song.mp3', mimetype: 'audio/wav' })).toBeNull();
    expect(getUploadAudioFormat({ originalname: 'Song.wav', mimetype: 'audio/mpeg' })).toBeNull();
  });
});

describe('filterUploadAudioFile', () => {
  it('accepts MP3 and WAV', async () => {
    expect((await runFilter({ originalname: 'a.mp3', mimetype: 'audio/mpeg' })).ok).toBe(true);
    expect((await runFilter({ originalname: 'a.wav', mimetype: 'audio/wav' })).ok).toBe(true);
  });

  it('gives FLAC a coming-soon error', async () => {
    const { err } = await runFilter({ originalname: 'a.flac', mimetype: 'audio/flac' });
    expect(err.message).toMatch(/FLAC uploads are coming soon/);
  });

  it('rejects other types', async () => {
    const { err } = await runFilter({ originalname: 'a.ogg', mimetype: 'audio/ogg' });
    expect(err.message).toMatch(/MP3 or WAV/);
  });
});

describe('checkUploadAudioFile', () => {
  it('accepts a valid WAV up to 100MB', () => {
    const result = checkUploadAudioFile({
      originalname: 'a.wav', mimetype: 'audio/wav', size: 90 * MB, buffer: wavBuffer(),
    });
    expect(result.format.mediaType).toBe('wav');
  });

  it('rejects a WAV over 100MB', () => {
    const result = checkUploadAudioFile({
      originalname: 'a.wav', mimetype: 'audio/wav', size: 101 * MB, buffer: wavBuffer(),
    });
    expect(result.error).toMatch(/100MB/);
  });

  it('keeps the 50MB cap for MP3', () => {
    const result = checkUploadAudioFile({
      originalname: 'a.mp3', mimetype: 'audio/mpeg', size: 60 * MB, buffer: Buffer.alloc(10),
    });
    expect(result.error).toMatch(/50MB/);
  });

  it('rejects a .wav file without a RIFF/WAVE header', () => {
    const result = checkUploadAudioFile({
      originalname: 'a.wav', mimetype: 'audio/wav', size: 1000, buffer: Buffer.from('ID3 not a wav file'),
    });
    expect(result.error).toMatch(/not a valid WAV/);
  });
});
