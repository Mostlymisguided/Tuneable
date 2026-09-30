/**
 * Run: npx jest tests/loginThrottle.test.js
 */

const throttle = require('../utils/loginThrottle');
const { getJwtSecret } = require('../config/jwtSecret');

describe('loginThrottle', () => {
  beforeEach(() => throttle._resetForTests());

  it('locks an (account, IP) pair after the max failures without affecting other IPs', () => {
    const user = { _id: 'u1' };
    const attacker = throttle.pairKey({ user, ip: '6.6.6.6' });
    const owner = throttle.pairKey({ user, ip: '1.2.3.4' });

    let result;
    for (let i = 0; i < throttle.PAIR_MAX_FAILURES; i += 1) {
      result = throttle.recordPairFailure(attacker);
    }
    expect(result.lockedUntil).toBeInstanceOf(Date);
    expect(throttle.getPairLock(attacker)).toBeInstanceOf(Date);
    expect(throttle.getPairLock(owner)).toBeNull();
  });

  it('counts unknown identifiers the same way as real accounts', () => {
    const known = throttle.pairKey({ user: { _id: 'u1' }, ip: '1.1.1.1' });
    const unknown = throttle.pairKey({ user: null, identifier: 'Nobody', ip: '1.1.1.1' });
    const a = throttle.recordPairFailure(known);
    const b = throttle.recordPairFailure(unknown);
    expect(a).toEqual(b);
    expect(throttle.pairKey({ user: null, identifier: ' nobody ', ip: '1.1.1.1' })).toBe(unknown);
  });

  it('clears the pair on success', () => {
    const key = throttle.pairKey({ user: { _id: 'u1' }, ip: '1.1.1.1' });
    throttle.recordPairFailure(key);
    throttle.clearPair(key);
    expect(throttle.recordPairFailure(key).failedAttempts).toBe(1);
  });

  it('locks the account only after many failures across IPs, and ignores stale ones', () => {
    const now = new Date();
    const user = { failedLoginAttempts: 0, lastFailedLoginAttempt: null, accountLockedUntil: null };
    for (let i = 0; i < throttle.ACCOUNT_MAX_FAILURES - 1; i += 1) throttle.recordAccountFailure(user, now);
    expect(throttle.getAccountLock(user, now)).toBeNull();
    throttle.recordAccountFailure(user, now);
    expect(throttle.getAccountLock(user, now)).toBeInstanceOf(Date);

    const stale = { failedLoginAttempts: 29, lastFailedLoginAttempt: new Date(now - 2 * 60 * 60 * 1000) };
    throttle.recordAccountFailure(stale, now);
    expect(stale.failedLoginAttempts).toBe(1);
  });
});

describe('getJwtSecret', () => {
  const original = { ...process.env };
  afterEach(() => { process.env = { ...original }; });

  it('refuses placeholder or missing secrets outside tests', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    expect(() => getJwtSecret()).toThrow(/not set/);
    process.env.JWT_SECRET = 'defaultsecretkey';
    expect(() => getJwtSecret()).toThrow(/placeholder/);
    process.env.JWT_SECRET = 'a-real-secret-value';
    expect(getJwtSecret()).toBe('a-real-secret-value');
  });
});
