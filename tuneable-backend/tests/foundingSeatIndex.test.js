/**
 * Founding seat uniqueness must not treat missing/null as a duplicate key.
 * Run: npx jest tests/foundingSeatIndex.test.js
 */

const User = require('../models/User');

describe('founding seat uniqueness', () => {
  it('uses a unique partial index that only includes numeric seat numbers', () => {
    const seatIndex = User.schema.indexes().find(([fields]) => fields.foundingSeatNumber === 1);
    expect(seatIndex).toBeDefined();
    expect(seatIndex[1].unique).toBe(true);
    expect(seatIndex[1].name).toBe('foundingSeatNumber_unique_partial');
    expect(seatIndex[1].partialFilterExpression).toEqual({
      foundingSeatNumber: { $type: 'number' },
    });
    expect(seatIndex[1].sparse).toBeFalsy();
  });

  it('does not default foundingSeatNumber to null on new users', () => {
    const user = new User({
      username: 'new-listener',
      email: 'new-listener@example.com',
      password: 'secret123',
    });
    expect(user.foundingSeatNumber).toBeUndefined();
    expect(user.isFoundingCreator).toBe(false);
  });

  it('exposes repairFoundingSeatUniqueness to drop the old null-indexing unique index', () => {
    expect(typeof User.repairFoundingSeatUniqueness).toBe('function');
  });
});
