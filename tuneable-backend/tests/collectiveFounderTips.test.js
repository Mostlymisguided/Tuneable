const {
  founderTipWindows,
  founderTipTotal,
  sumFounderTipsForCollectives,
  collectiveRankingAggregate,
  freezeFounderTipScope,
} = require('../utils/collectiveFounderTips');

const founderId = '64b000000000000000000001';
const otherId = '64b000000000000000000002';
const createdAt = new Date('2024-01-01T00:00:00.000Z');

function collective(members, id = 'col-1') {
  return { _id: id, createdAt, members };
}

describe('collective founder tips', () => {
  it('counts a founding owner\'s tips from before the collective existed', () => {
    const windows = founderTipWindows(collective([{
      userId: founderId,
      role: 'founder',
      joinedAt: new Date('2024-01-01T00:00:20.000Z'),
    }]));
    const total = founderTipTotal(windows, [
      { userId: founderId, amount: 100, createdAt: new Date('2023-06-01T00:00:00.000Z'), status: 'active' },
      { userId: founderId, amount: 50, createdAt: new Date('2024-03-01T00:00:00.000Z'), status: 'active' },
      { userId: founderId, amount: 25, createdAt: new Date('2024-04-01T00:00:00.000Z'), status: 'refunded' },
    ]);
    expect(total).toBe(150);
  });

  it('does not import history for a founder recorded long after the collective was created', () => {
    const windows = founderTipWindows(collective([{
      userId: founderId,
      role: 'founder',
      joinedAt: new Date('2024-09-01T00:00:00.000Z'),
    }]));
    const total = founderTipTotal(windows, [
      { userId: founderId, amount: 40, createdAt: new Date('2024-02-01T00:00:00.000Z'), status: 'active' },
      { userId: founderId, amount: 15, createdAt: new Date('2024-10-01T00:00:00.000Z'), status: 'active' },
    ]);
    expect(total).toBe(15);
  });

  it('counts every tip when a founder is invited as a founder', () => {
    const windows = founderTipWindows(collective([{
      userId: founderId,
      role: 'founder',
      founderTipScope: 'all',
      founderSince: new Date('2024-08-01T00:00:00.000Z'),
      joinedAt: new Date('2024-08-01T00:00:00.000Z'),
    }]));
    const total = founderTipTotal(windows, [
      { userId: founderId, amount: 80, createdAt: new Date('2024-02-01T00:00:00.000Z'), status: 'active' },
    ]);
    expect(total).toBe(80);
  });

  it('starts a promoted founder at the promotion, and ignores admins and members', () => {
    const windows = founderTipWindows(collective([
      {
        userId: founderId,
        role: 'founder',
        founderTipScope: 'since',
        founderSince: new Date('2024-05-01T00:00:00.000Z'),
      },
      {
        userId: otherId,
        role: 'admin',
        joinedAt: createdAt,
      },
      {
        userId: '64b000000000000000000003',
        role: 'member',
        joinedAt: createdAt,
      },
    ]));

    const total = founderTipTotal(windows, [
      { userId: founderId, amount: 40, createdAt: new Date('2024-04-01T00:00:00.000Z'), status: 'active' },
      { userId: founderId, amount: 60, createdAt: new Date('2024-05-01T00:00:00.000Z'), status: 'active' },
      { userId: otherId, amount: 500, createdAt: new Date('2024-06-01T00:00:00.000Z'), status: 'active' },
      { userId: '64b000000000000000000003', amount: 500, createdAt: new Date('2024-06-01T00:00:00.000Z'), status: 'active' },
    ]);
    expect(total).toBe(60);
  });

  it('keeps a former founder\'s tips from before they left', () => {
    const windows = founderTipWindows(collective([{
      userId: founderId,
      role: 'founder',
      founderTipScope: 'all',
      leftAt: new Date('2024-07-01T00:00:00.000Z'),
    }]));
    const total = founderTipTotal(windows, [
      { userId: founderId, amount: 30, createdAt: new Date('2024-02-01T00:00:00.000Z'), status: 'active' },
      { userId: founderId, amount: 70, createdAt: new Date('2024-08-01T00:00:00.000Z'), status: 'active' },
    ]);
    expect(total).toBe(30);
  });

  it('gives the same founder history to each collective they founded', () => {
    const tips = [
      { userId: founderId, amount: 100, createdAt: new Date('2023-01-01T00:00:00.000Z'), status: 'active' },
    ];
    const founder = {
      userId: { _id: founderId },
      role: 'founder',
      founderTipScope: 'all',
    };
    const totals = sumFounderTipsForCollectives([
      collective([founder], 'col-a'),
      collective([founder], 'col-b'),
    ], tips);
    expect(totals.get('col-a')).toBe(100);
    expect(totals.get('col-b')).toBe(100);
  });

  it('remembers an original founder so a later join-date edit does not drop their history', () => {
    const row = {
      userId: founderId,
      role: 'founder',
      joinedAt: new Date('2024-01-01T00:00:10.000Z'),
    };
    expect(freezeFounderTipScope(collective([row]), row)).toBe(true);
    expect(row.founderTipScope).toBe('all');
    row.joinedAt = new Date('2026-01-01T00:00:00.000Z');
    const total = founderTipTotal(founderTipWindows(collective([row])), [
      { userId: founderId, amount: 20, createdAt: new Date('2023-01-01T00:00:00.000Z'), status: 'active' },
    ]);
    expect(total).toBe(20);
  });

  it('adds founder tips on top of tips the collective\'s media already received', () => {
    expect(collectiveRankingAggregate(200, 150)).toBe(350);
    expect(collectiveRankingAggregate(undefined, 150)).toBe(150);
  });
});
