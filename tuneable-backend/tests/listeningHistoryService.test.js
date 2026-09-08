/**
 * Listening history play counting (mocked models).
 * Run: npx jest tests/listeningHistoryService.test.js
 */

const mongoose = require('mongoose');

const mediaId = new mongoose.Types.ObjectId();
const userId = new mongoose.Types.ObjectId();
const historyId = new mongoose.Types.ObjectId();

const mediaDoc = {
  _id: mediaId,
  uuid: 'media-uuid',
  title: 'Test Track',
  artist: [{ name: 'Test Artist' }],
  coverArt: 'https://example.com/art.jpg',
  duration: 200,
};

jest.mock('../models/Media', () => ({
  findById: jest.fn(),
  findOne: jest.fn(),
  updateOne: jest.fn(),
}));

jest.mock('../models/ListeningHistory', () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));

const Media = require('../models/Media');
const ListeningHistory = require('../models/ListeningHistory');
const {
  ListeningHistoryError,
  trackListeningSession,
} = require('../services/listeningHistoryService');

function historyDoc(overrides = {}) {
  return {
    _id: historyId,
    userId,
    mediaId,
    sessionId: 'session-1',
    countedAsPlay: false,
    listenDurationSeconds: 0,
    completedAt: null,
    ...overrides,
  };
}

describe('trackListeningSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Media.findById.mockResolvedValue(mediaDoc);
    Media.findOne.mockResolvedValue(null);
    Media.updateOne.mockResolvedValue({ modifiedCount: 1 });
    ListeningHistory.findOne.mockResolvedValue(null);
  });

  it('rejects missing mediaId/sessionId', async () => {
    await expect(trackListeningSession({
      userId,
      mediaId: null,
      sessionId: 's',
    })).rejects.toMatchObject({ status: 400 });
  });

  it('rejects unknown media', async () => {
    Media.findById.mockResolvedValue(null);
    Media.findOne.mockResolvedValue(null);
    await expect(trackListeningSession({
      userId,
      mediaId: mediaId.toString(),
      sessionId: 's',
    })).rejects.toBeInstanceOf(ListeningHistoryError);
  });

  it('does not increment playCount for a short skip', async () => {
    const saved = historyDoc({ listenDurationSeconds: 8 });
    ListeningHistory.findOneAndUpdate.mockResolvedValue(saved);

    const result = await trackListeningSession({
      userId,
      mediaId: mediaId.toString(),
      sessionId: 'session-1',
      currentTime: 8,
      duration: 200,
      client: 'web',
    });

    expect(result.playCounted).toBe(false);
    expect(Media.updateOne).not.toHaveBeenCalled();
    expect(ListeningHistory.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });

  it('increments playCount once when the session first qualifies', async () => {
    const saved = historyDoc({ listenDurationSeconds: 30 });
    ListeningHistory.findOneAndUpdate
      .mockResolvedValueOnce(saved)
      .mockResolvedValueOnce({ ...saved, countedAsPlay: true });

    const result = await trackListeningSession({
      userId,
      mediaId: mediaId.toString(),
      sessionId: 'session-1',
      currentTime: 30,
      duration: 200,
      client: 'mobile',
    });

    expect(result.playCounted).toBe(true);
    expect(Media.updateOne).toHaveBeenCalledWith(
      { _id: mediaId },
      { $inc: { playCount: 1 } }
    );
  });

  it('does not increment again on a later heartbeat of the same session', async () => {
    const saved = historyDoc({
      countedAsPlay: true,
      listenDurationSeconds: 45,
    });
    ListeningHistory.findOne.mockResolvedValue(saved);
    ListeningHistory.findOneAndUpdate.mockResolvedValue(saved);

    const result = await trackListeningSession({
      userId,
      mediaId: mediaId.toString(),
      sessionId: 'session-1',
      currentTime: 90,
      duration: 200,
    });

    expect(result.playCounted).toBe(false);
    expect(Media.updateOne).not.toHaveBeenCalled();
    expect(ListeningHistory.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });

  it('does not double-count when a concurrent request already claimed the play', async () => {
    const saved = historyDoc({ listenDurationSeconds: 40 });
    ListeningHistory.findOneAndUpdate
      .mockResolvedValueOnce(saved)
      .mockResolvedValueOnce(null);

    const result = await trackListeningSession({
      userId,
      mediaId: mediaId.toString(),
      sessionId: 'session-1',
      currentTime: 40,
      duration: 200,
    });

    expect(result.playCounted).toBe(false);
    expect(Media.updateOne).not.toHaveBeenCalled();
  });
});
