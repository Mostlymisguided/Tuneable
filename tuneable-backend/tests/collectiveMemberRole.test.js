const Collective = require('../models/Collective');

const setMemberRole = Collective.schema.methods.setMemberRole;
const createdAt = new Date('2024-01-01T00:00:00.000Z');

function collective(members) {
  return {
    createdAt,
    members,
    save: jest.fn(function save() {
      return Promise.resolve(this);
    }),
  };
}

describe('Collective.setMemberRole', () => {
  it('promotes an admin to founder without resetting when they joined', async () => {
    const joinedAt = new Date('2024-03-01T00:00:00.000Z');
    const record = collective([{
      userId: 'user-1',
      role: 'admin',
      instrument: 'guitar',
      joinedAt,
      addedBy: 'founder-1',
    }]);

    await setMemberRole.call(record, 'user-1', 'founder');

    expect(record.members[0]).toMatchObject({
      role: 'founder',
      instrument: 'guitar',
      joinedAt,
      addedBy: 'founder-1',
      founderTipScope: 'since',
    });
    expect(record.members[0].founderSince).toBeInstanceOf(Date);
    expect(record.members[0].founderSince.getTime()).toBeGreaterThan(joinedAt.getTime());
    expect(record.save).toHaveBeenCalledTimes(1);
  });

  it('promotes a member to admin and leaves founder tip fields unset', async () => {
    const joinedAt = new Date('2024-04-01T00:00:00.000Z');
    const record = collective([{
      userId: 'user-2',
      role: 'member',
      instrument: 'vocals',
      joinedAt,
    }]);

    await setMemberRole.call(record, 'user-2', 'admin');

    expect(record.members[0].role).toBe('admin');
    expect(record.members[0].joinedAt).toBe(joinedAt);
    expect(record.members[0].instrument).toBe('vocals');
    expect(record.members[0].founderSince).toBeUndefined();
    expect(record.members[0].founderTipScope).toBeUndefined();
  });

  it('demotes a founder and keeps their join date', async () => {
    const joinedAt = new Date('2024-01-01T00:00:00.000Z');
    const record = collective([{
      userId: 'user-1',
      role: 'founder',
      joinedAt,
      instrument: 'bass',
    }]);

    await setMemberRole.call(record, 'user-1', 'member');

    expect(record.members[0].role).toBe('member');
    expect(record.members[0].joinedAt).toBe(joinedAt);
    expect(record.members[0].instrument).toBe('bass');
    expect(record.members[0].founderTipScope).toBe('all');
  });

  it('does nothing when the role is unchanged', async () => {
    const record = collective([{ userId: 'user-1', role: 'admin', joinedAt: createdAt }]);
    await setMemberRole.call(record, 'user-1', 'admin');
    expect(record.save).not.toHaveBeenCalled();
  });

  it('rejects someone who is not an active member', async () => {
    const record = collective([{ userId: 'user-1', role: 'member', leftAt: new Date() }]);
    expect(() => setMemberRole.call(record, 'user-1', 'admin')).toThrow('Member not found');
    expect(record.save).not.toHaveBeenCalled();
  });
});
