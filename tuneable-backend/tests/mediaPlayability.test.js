/**
 * Unit tests for media playability + public source sanitization (no DB).
 * Run: npx jest tests/mediaPlayability.test.js
 */

const {
  isMediaPlayable,
  getPlayabilityBlockReason,
  enrichMediaWithPlayability,
  stripDirectAudioSources,
} = require('../utils/mediaPlayability');

const UPLOAD = 'https://uploads.tuneable.stream/media-uploads/daft-punk-around-the-world-a1b2c3d4.mp3';
const YT = 'https://www.youtube.com/watch?v=abcdefghijk';

describe('isMediaPlayable', () => {
  it('plays cleared artist uploads', () => {
    expect(isMediaPlayable({
      sources: { upload: UPLOAD, youtube: YT },
      rightsStatus: 'cleared',
      rightsCleared: true,
      contentForm: ['tune'],
    })).toBe(true);
  });

  it('does not play pending library-import uploads', () => {
    expect(isMediaPlayable({
      sources: { upload: UPLOAD, youtube: YT },
      rightsStatus: 'pending',
      rightsCleared: false,
      contentForm: ['tune'],
    })).toBe(false);
  });

  it('does not play disputed tracks even with an upload', () => {
    expect(isMediaPlayable({
      sources: { upload: UPLOAD },
      rightsStatus: 'disputed',
      rightsCleared: false,
      contentForm: ['tune'],
    })).toBe(false);
  });

  it('does not play catalog-only tracks', () => {
    expect(isMediaPlayable({
      sources: { youtube: YT },
      rightsStatus: 'cleared',
      rightsCleared: false,
      contentForm: ['tune'],
    })).toBe(false);
  });

  it('plays podcasts with enclosure audio regardless of rightsStatus', () => {
    expect(isMediaPlayable({
      sources: { enclosure: 'https://cdn.example/ep.mp3' },
      rightsStatus: 'pending',
      rightsCleared: false,
      contentForm: ['podcastepisode'],
    })).toBe(true);
  });

  it('does not play catalog books even with an attached file', () => {
    expect(isMediaPlayable({
      sources: { upload: UPLOAD },
      rightsStatus: 'cleared',
      rightsCleared: true,
      contentType: ['written'],
      contentForm: ['book'],
    })).toBe(false);
  });
});

describe('getPlayabilityBlockReason', () => {
  it('returns rights for pending uploads', () => {
    expect(getPlayabilityBlockReason({
      sources: { upload: UPLOAD },
      rightsStatus: 'pending',
      rightsCleared: false,
      contentForm: ['tune'],
    })).toBe('rights');
  });

  it('returns audio for YouTube catalog with uncleared rights and no file', () => {
    expect(getPlayabilityBlockReason({
      sources: { youtube: YT },
      rightsStatus: 'cleared',
      rightsCleared: false,
      contentForm: ['tune'],
    })).toBe('audio');
  });

  it('returns audio when there is no file', () => {
    expect(getPlayabilityBlockReason({
      sources: { youtube: YT },
      rightsStatus: 'cleared',
      rightsCleared: true,
      contentForm: ['tune'],
    })).toBe('audio');
  });
});

describe('enrichMediaWithPlayability', () => {
  it('strips direct audio URLs for pending tracks', () => {
    const presented = enrichMediaWithPlayability({
      title: 'Around the World',
      sources: { upload: UPLOAD, youtube: YT },
      rightsStatus: 'pending',
      rightsCleared: false,
      contentForm: ['tune'],
    });
    expect(presented.isPlayable).toBe(false);
    expect(presented.hasHostedAudio).toBe(true);
    expect(presented.awaitingUpload).toBe(false);
    expect(presented.sources.upload).toBeUndefined();
    expect(presented.sources.youtube).toBe(YT);
    expect(presented.playabilityBlockReason).toBe('rights');
  });

  it('keeps upload URLs for cleared playable tracks', () => {
    const presented = enrichMediaWithPlayability({
      sources: { upload: UPLOAD },
      rightsStatus: 'cleared',
      rightsCleared: true,
      contentForm: ['tune'],
    });
    expect(presented.isPlayable).toBe(true);
    expect(presented.sources.upload).toBe(UPLOAD);
    expect(presented.hasHostedAudio).toBe(true);
  });

  it('can expose pending URLs for trusted admin responses', () => {
    const presented = enrichMediaWithPlayability({
      sources: { upload: UPLOAD },
      rightsStatus: 'pending',
      rightsCleared: false,
      contentForm: ['tune'],
    }, { exposeDirectAudio: true });
    expect(presented.isPlayable).toBe(false);
    expect(presented.sources.upload).toBe(UPLOAD);
  });

  it('keeps podcast enclosure URLs', () => {
    const enclosure = 'https://cdn.example/ep.mp3';
    const presented = enrichMediaWithPlayability({
      sources: { enclosure },
      rightsStatus: 'pending',
      contentForm: ['podcastepisode'],
    });
    expect(presented.isPlayable).toBe(true);
    expect(presented.sources.enclosure).toBe(enclosure);
  });

  it('marks catalog books as not playable and not awaiting audio upload', () => {
    const presented = enrichMediaWithPlayability({
      title: 'The Hobbit',
      sources: { openLibrary: 'https://openlibrary.org/works/OL45883W' },
      contentType: ['written'],
      contentForm: ['book'],
    });
    expect(presented.isPlayable).toBe(false);
    expect(presented.awaitingUpload).toBe(false);
    expect(presented.hasHostedAudio).toBe(false);
  });
});

describe('stripDirectAudioSources', () => {
  it('removes upload keys and keeps catalog links', () => {
    expect(stripDirectAudioSources({
      upload: UPLOAD,
      audio_direct: UPLOAD,
      youtube: YT,
      spotify: 'https://open.spotify.com/track/1',
    })).toEqual({
      youtube: YT,
      spotify: 'https://open.spotify.com/track/1',
    });
  });
});
