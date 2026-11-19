/**
 * Home listen-queue classification.
 * Run: npx jest tests/homeListenQueue.test.js
 */

const { classifyHomeListenQueue } = require('../services/homeListenQueueService');

function tune(id) {
  return { _id: id, contentType: ['music'], contentForm: ['tune'], title: id };
}

describe('classifyHomeListenQueue', () => {
  const mediaById = {
    queued: tune('queued'),
    tipped: tune('tipped'),
    both: tune('both'),
    heard: tune('heard'),
    heardTip: tune('heardTip'),
    podcast: { _id: 'podcast', contentForm: ['podcastepisode'], contentType: ['spoken'] },
    book: { _id: 'book', contentForm: ['book'], contentType: ['written'] },
  };

  it('keeps queued tunes that have neither a tip nor a qualified play', () => {
    const result = classifyHomeListenQueue({
      queueEntries: [
        { mediaId: 'both', addedAt: '2026-01-01T00:00:00.000Z' },
        { mediaId: 'queued', addedAt: '2026-01-02T00:00:00.000Z' },
        { mediaId: 'podcast', addedAt: '2026-01-03T00:00:00.000Z' },
      ],
      bids: [
        { mediaId: 'both', userBidTotal: 111, lastBidAt: '2026-01-04T00:00:00.000Z' },
        { mediaId: 'tipped', userBidTotal: 200, lastBidAt: '2026-01-05T00:00:00.000Z' },
        { mediaId: 'heardTip', userBidTotal: 50, lastBidAt: '2026-01-06T00:00:00.000Z' },
        { mediaId: 'book', userBidTotal: 10, lastBidAt: '2026-01-07T00:00:00.000Z' },
      ],
      heard: [
        { mediaId: 'heard', qualifiedAt: '2026-02-01T00:00:00.000Z' },
        { mediaId: 'heardTip', qualifiedAt: '2026-02-02T00:00:00.000Z' },
        { mediaId: 'podcast', qualifiedAt: '2026-02-03T00:00:00.000Z' },
      ],
      mediaById,
    });

    expect(result.unheard.map((item) => item.mediaId)).toEqual(['queued']);
    expect(result.unheard[0]).toMatchObject({ queued: true, tipped: false, heard: false });

    expect(result.heard.map((item) => item.mediaId)).toEqual(['heardTip', 'heard']);
    expect(result.heard[0]).toMatchObject({ tipped: true, heard: true });
    expect(result.counts).toEqual({ unheard: 1, heard: 2, tipped: 3 });
  });

  it('caps the returned lists without shrinking the counts', () => {
    const many = {};
    const heard = [];
    for (let i = 0; i < 3; i += 1) {
      const id = `h${i}`;
      many[id] = tune(id);
      heard.push({ mediaId: id, qualifiedAt: new Date(Date.UTC(2026, 0, i + 1)).toISOString() });
    }

    const result = classifyHomeListenQueue({
      heard,
      mediaById: many,
      heardLimit: 2,
    });

    expect(result.heard).toHaveLength(2);
    expect(result.heard[0].mediaId).toBe('h2');
    expect(result.counts.heard).toBe(3);
  });
});
