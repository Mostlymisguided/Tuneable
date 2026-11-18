/**
 * TuneBytes credit and notification de-dupe (mocked models).
 * Run: npx jest tests/tuneBytesNotify.test.js
 */

jest.mock('../models/User', () => ({
  findById: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateOne: jest.fn(),
}));

jest.mock('../models/Bid', () => ({
  find: jest.fn(),
  findById: jest.fn(),
  updateOne: jest.fn(),
  updateMany: jest.fn(),
}));

jest.mock('../models/Media', () => ({}));

jest.mock('../models/TuneBytesTransaction', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
}));

const User = require('../models/User');
const service = require('../services/tuneBytesService');
const { collectTuneBytesNotice } = require('../services/tuneBytesService');

function mockStoredUser(doc) {
  User.findById.mockReturnValue({
    select: () => Promise.resolve(doc),
  });
}

const credit = {
  user: { _id: 'user1', tuneBytes: 0, username: 'ada' },
  bidId: 'bid1',
  media: { _id: 'media1', title: 'First Light' },
  discoveryRank: 1,
};

describe('applyUserDelta', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    User.updateOne.mockResolvedValue({});
  });

  it('inserts a missing bid only when that bid is absent', async () => {
    mockStoredUser({ tuneBytes: 0, tuneBytesHistory: [{ bidId: 'other', earnedAmount: 40 }] });
    User.findOneAndUpdate.mockResolvedValue({ tuneBytes: 0 });

    const result = await service.applyUserDelta({
      ...credit,
      earned: 111,
      delta: 111,
    });

    expect(result).toMatchObject({ didCredit: true, notifyDelta: 111, tunebytesBefore: 0 });
    const filter = User.findOneAndUpdate.mock.calls[0][0];
    expect(filter.tuneBytesHistory).toEqual({ $not: { $elemMatch: { bidId: 'bid1' } } });
    expect(filter['tuneBytesHistory.bidId']).toBeUndefined();
    expect(User.findOneAndUpdate.mock.calls[0][1].$inc.tuneBytes).toBe(111);
  });

  it('does not credit or notify when the stored total already matches', async () => {
    mockStoredUser({
      tuneBytes: 111,
      tuneBytesHistory: [{ bidId: 'bid1', earnedAmount: 111 }],
    });

    const result = await service.applyUserDelta({
      ...credit,
      earned: 111,
      delta: 111,
    });

    expect(result).toEqual({ didCredit: false, notifyDelta: 0, tunebytesBefore: 111 });
    expect(User.findOneAndUpdate).not.toHaveBeenCalled();
    expect(User.updateOne).not.toHaveBeenCalled();
  });

  it('credits only the growth past the stored amount', async () => {
    mockStoredUser({
      tuneBytes: 111,
      tuneBytesHistory: [{ bidId: 'bid1', earnedAmount: 111 }],
    });
    User.findOneAndUpdate.mockResolvedValue({ tuneBytes: 111 });

    const result = await service.applyUserDelta({
      ...credit,
      earned: 200,
      delta: 200,
    });

    expect(result.notifyDelta).toBe(89);
    expect(User.findOneAndUpdate.mock.calls[0][1].$inc.tuneBytes).toBe(89);
    expect(User.findOneAndUpdate.mock.calls[0][1].$set['tuneBytesHistory.$.earnedAmount']).toBe(200);
  });

  it('does not $inc again when another settler already inserted the bid', async () => {
    let reads = 0;
    User.findById.mockImplementation(() => ({
      select: () =>
        Promise.resolve(
          reads++ === 0
            ? { tuneBytes: 0, tuneBytesHistory: [] }
            : { tuneBytes: 111, tuneBytesHistory: [{ bidId: 'bid1', earnedAmount: 111 }] }
        ),
    }));
    User.findOneAndUpdate.mockResolvedValue(null);

    const result = await service.applyUserDelta({
      ...credit,
      earned: 111,
      delta: 111,
    });

    expect(result).toEqual({ didCredit: false, notifyDelta: 0, tunebytesBefore: 111 });
    expect(User.updateOne).not.toHaveBeenCalled();
  });
});

describe('collectTuneBytesNotice', () => {
  it('sums one user into a single notice and drops dust', () => {
    const notices = new Map();
    const user = { _id: 'user1' };
    const media = { title: 'First Light' };

    collectTuneBytesNotice(notices, { user, media, delta: 10, discoveryRank: 4 });
    collectTuneBytesNotice(notices, { user, media, delta: 5, discoveryRank: 1 });
    collectTuneBytesNotice(notices, { user, media, delta: 0.01, discoveryRank: 1 });
    collectTuneBytesNotice(notices, {
      user: { _id: 'user2' },
      media,
      delta: 3,
      discoveryRank: 2,
    });

    expect(notices.size).toBe(2);
    expect(notices.get('user1')).toMatchObject({ delta: 15, discoveryRank: 1 });
    expect(notices.get('user2').delta).toBe(3);
  });
});

describe('recalculateTuneBytesForMedia queue', () => {
  it('runs overlapping settles for the same media one at a time', async () => {
    let active = 0;
    let maxActive = 0;
    const spy = jest
      .spyOn(service, 'recalculateTuneBytesForMediaNow')
      .mockImplementation(async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 20));
        active -= 1;
        return { bids: [] };
      });

    await Promise.all([
      service.recalculateTuneBytesForMedia('media-a'),
      service.recalculateTuneBytesForMedia('media-a'),
      service.recalculateTuneBytesForMedia('media-a'),
    ]);

    expect(maxActive).toBe(1);
    spy.mockRestore();
  });
});
