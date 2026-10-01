/**
 * Password policy, reset tokens, session revocation and response sanitising.
 * Run: npx jest tests/passwordSecurity.test.js
 */

const crypto = require('crypto');
const User = require('../models/User');
const {
  PASSWORD_MIN_LENGTH,
  checkPasswordRules,
  getPasswordWarnings,
  isPasswordBreached,
  assessNewPassword,
  checkNewPassword,
} = require('../utils/passwordPolicy');
const { isTokenRevoked } = require('../utils/sessionRevocation');
const { stripSensitiveUserFields } = require('../utils/userSanitizer');
const { withWelcomeCreditOffer } = require('../utils/betaCreditHelper');
const rateLimit = require('../middleware/rateLimit');

function pwnedBodyFor(password, count = 42) {
  const hash = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
  return `0000000000000000000000000000000000A:0\r\n${hash.slice(5)}:${count}\r\n`;
}

describe('checkPasswordRules', () => {
  it('enforces length only, with no composition rules', () => {
    expect(checkPasswordRules('short')).toMatch(/at least 8/);
    expect(checkPasswordRules('lantern otter velvet cactus')).toBeNull();
    expect(checkPasswordRules('alllowercaseletters')).toBeNull();
    expect(checkPasswordRules('x'.repeat(129))).toMatch(/at most 128/);
  });

  it('counts emoji as single characters', () => {
    expect(checkPasswordRules('🎵🎶🎸🥁🎹🎺🎻')).toMatch(/at least/);
    expect(checkPasswordRules('🎵🎶🎸🥁🎹🎺🎻🎤')).toBeNull();
  });

  it('accepts common and personal passwords (they only warn)', () => {
    expect(checkPasswordRules('password123')).toBeNull();
    expect(checkPasswordRules('aaaaaaaaaa')).toBeNull();
  });

  it('exposes the minimum length', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
  });
});

describe('getPasswordWarnings', () => {
  it('warns about common and repeated-character passwords', () => {
    expect(getPasswordWarnings('password123')[0]).toMatch(/very common/);
    expect(getPasswordWarnings('Pass-Word 123')[0]).toMatch(/very common/);
    expect(getPasswordWarnings('aaaaaaaaaa')[0]).toMatch(/easy to guess/);
  });

  it('warns about passwords containing the username or email name', () => {
    const ctx = { username: 'DJ_Shadow', email: 'josh.davis@example.com' };
    expect(getPasswordWarnings('djshadow-rocks', ctx)[0]).toMatch(/username or email/);
    expect(getPasswordWarnings('JoshDavis2026', ctx)[0]).toMatch(/username or email/);
    expect(getPasswordWarnings('lantern otter velvet', ctx)).toEqual([]);
  });
});

describe('isPasswordBreached', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  it('sends only the 5-char hash prefix and matches the suffix', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => pwnedBodyFor('hunter2hunter2') });
    await expect(isPasswordBreached('hunter2hunter2')).resolves.toBe(true);
    const url = global.fetch.mock.calls[0][0];
    expect(url).toMatch(/\/range\/[0-9A-F]{5}$/);
  });

  it('ignores padding entries with a zero count', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => pwnedBodyFor('unique phrase here', 0) });
    await expect(isPasswordBreached('unique phrase here')).resolves.toBe(false);
  });

  it('fails open when the service is unreachable', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(isPasswordBreached('whatever phrase')).resolves.toBeNull();
    await expect(assessNewPassword('lantern otter velvet cactus')).resolves.toEqual({ error: null, warnings: [] });
    console.warn.mockRestore();
  });

  it('assessNewPassword warns about breached passwords', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => pwnedBodyFor('correct horse battery staple') });
    const { error, warnings } = await assessNewPassword('correct horse battery staple');
    expect(error).toBeNull();
    expect(warnings[0]).toMatch(/data breach/);
  });
});

describe('checkNewPassword', () => {
  const realFetch = global.fetch;
  beforeEach(() => { global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => '' }); });
  afterEach(() => { global.fetch = realFetch; });

  it('blocks only on length', async () => {
    await expect(checkNewPassword('short', {}, true)).resolves.toMatchObject({ status: 400, body: { code: 'WEAK_PASSWORD' } });
  });

  it('returns warnings until the user accepts them', async () => {
    const first = await checkNewPassword('password123', {});
    expect(first).toMatchObject({ status: 422, body: { code: 'PASSWORD_WARNINGS' } });
    expect(first.body.warnings.length).toBeGreaterThan(0);
    await expect(checkNewPassword('password123', {}, true)).resolves.toBeNull();
  });
});

describe('password reset tokens', () => {
  function makeUser() {
    return new User({ username: 'resetter', email: 'resetter@example.com', password: 'old-hash' });
  }

  it('stores only a hash of the emailed token', () => {
    const user = makeUser();
    const token = user.generatePasswordResetToken();
    expect(user.passwordResetToken).not.toBe(token);
    expect(user.passwordResetToken).toBe(crypto.createHash('sha256').update(token).digest('hex'));
  });

  it('resets with the raw token, clears lockout and stamps passwordChangedAt', () => {
    const user = makeUser();
    const token = user.generatePasswordResetToken();
    user.failedLoginAttempts = 6;
    user.accountLockedUntil = new Date(Date.now() + 60_000);

    expect(user.resetPassword('wrong-token', 'new password here')).toBe(false);
    expect(user.resetPassword(token, 'new password here')).toBe(true);

    expect(user.password).toBe('new password here');
    expect(user.passwordResetToken).toBeUndefined();
    expect(user.failedLoginAttempts).toBe(0);
    expect(user.accountLockedUntil).toBeNull();
    expect(user.passwordChangedAt).toBeInstanceOf(Date);
  });

  it('rejects expired tokens', () => {
    const user = makeUser();
    const token = user.generatePasswordResetToken();
    user.passwordResetExpires = Date.now() - 1;
    expect(user.resetPassword(token, 'new password here')).toBe(false);
  });

  it('comparePassword returns false for accounts without a password', async () => {
    const user = new User({ username: 'oauth-only', email: 'o@example.com' });
    await expect(user.comparePassword('anything')).resolves.toBe(false);
  });
});

describe('isTokenRevoked', () => {
  const changedAt = new Date('2026-09-30T12:00:00.500Z');
  const changedAtSeconds = Math.floor(changedAt.getTime() / 1000);

  it('revokes tokens issued before the change', () => {
    expect(isTokenRevoked({ iat: changedAtSeconds - 1 }, { passwordChangedAt: changedAt })).toBe(true);
  });

  it('keeps the token issued in the same second as the change', () => {
    expect(isTokenRevoked({ iat: changedAtSeconds }, { passwordChangedAt: changedAt })).toBe(false);
  });

  it('ignores users who never changed their password', () => {
    expect(isTokenRevoked({ iat: 1 }, { passwordChangedAt: null })).toBe(false);
    expect(isTokenRevoked({ iat: 1 }, null)).toBe(false);
  });
});

describe('response sanitising', () => {
  it('strips credentials and reports hasPassword', () => {
    const out = stripSensitiveUserFields({
      username: 'a',
      password: '$2b$10$hash',
      passwordResetToken: 'x',
      googleRefreshToken: 'y',
    });
    expect(out).toEqual({ username: 'a', hasPassword: true });
  });

  it('login/register payloads never include the password hash', () => {
    const user = new User({ username: 'leaky', email: 'leaky@example.com', password: '$2b$10$hash' });
    user.generatePasswordResetToken();
    user.googleAccessToken = 'secret';
    const payload = withWelcomeCreditOffer(user);
    expect(payload.password).toBeUndefined();
    expect(payload.passwordResetToken).toBeUndefined();
    expect(payload.googleAccessToken).toBeUndefined();
    expect(payload.hasPassword).toBe(true);
    expect(JSON.stringify(user.toJSON())).not.toContain('$2b$10$hash');
  });
});

describe('rateLimit', () => {
  function run(mw, req) {
    const res = { statusCode: 200, set: jest.fn(), status(c) { this.statusCode = c; return this; }, json: jest.fn() };
    const next = jest.fn();
    mw(req, res, next);
    return { res, next };
  }

  it('blocks after max requests per IP', () => {
    const mw = rateLimit({ name: 't1', windowMs: 60_000, max: 2 });
    const req = { ip: '1.2.3.4', body: {} };
    expect(run(mw, req).next).toHaveBeenCalled();
    expect(run(mw, req).next).toHaveBeenCalled();
    const third = run(mw, req);
    expect(third.next).not.toHaveBeenCalled();
    expect(third.res.statusCode).toBe(429);
    expect(run(mw, { ip: '5.6.7.8', body: {} }).next).toHaveBeenCalled();
  });

  it('can key by email alone across IPs', () => {
    const mw = rateLimit({ name: 't2', windowMs: 60_000, max: 1, perIp: false, key: (r) => r.body.email });
    expect(run(mw, { ip: '1.1.1.1', body: { email: 'Victim@x.com' } }).next).toHaveBeenCalled();
    expect(run(mw, { ip: '2.2.2.2', body: { email: 'victim@x.com' } }).res.statusCode).toBe(429);
  });
});
