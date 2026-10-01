/**
 * Login, change-password and reset endpoints, with the database and email mocked.
 * Run: npx jest tests/passwordRoutes.test.js
 */

jest.mock('../utils/emailService', () => new Proxy({}, {
  get(target, key) {
    if (key === '__esModule' || key === 'then') return undefined;
    if (!target[key]) target[key] = jest.fn().mockResolvedValue(true);
    return target[key];
  },
}));

const express = require('express');
const request = require('supertest');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const emailService = require('../utils/emailService');
const loginThrottle = require('../utils/loginThrottle');
const { getJwtSecret } = require('../config/jwtSecret');

const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use('/api/users', require('../routes/userRoutes'));
app.use('/api/email', require('../routes/emailRoutes'));

const PASSWORD = 'lantern otter velvet cactus';
let passwordHash;
let ipCounter = 0;
const freshIp = () => `10.0.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`;

function makeUser(overrides = {}) {
  return new User({
    username: 'listener',
    email: 'listener@example.com',
    password: passwordHash,
    isActive: true,
    ...overrides,
  });
}

beforeAll(async () => {
  passwordHash = await bcrypt.hash(PASSWORD, 10);
});

beforeEach(() => {
  loginThrottle._resetForTests();
  jest.spyOn(User.prototype, 'save').mockImplementation(function save() { return Promise.resolve(this); });
  global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => '' });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('POST /api/users/login', () => {
  const login = (identifier, password, ip = freshIp()) =>
    request(app).post('/api/users/login').set('X-Forwarded-For', ip).send({ identifier, password });

  it('answers unknown accounts exactly like a wrong password', async () => {
    jest.spyOn(User, 'findByLoginIdentifier').mockImplementation(async (id) => (id === 'listener' ? makeUser() : null));
    const wrong = await login('listener', 'not the password');
    const unknown = await login('nobody-here', 'not the password');
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
  });

  it('pauses the attacking IP but not the owner', async () => {
    const user = makeUser();
    jest.spyOn(User, 'findByLoginIdentifier').mockResolvedValue(user);
    const attackerIp = freshIp();
    let res;
    for (let i = 0; i < loginThrottle.PAIR_MAX_FAILURES; i += 1) {
      res = await login('listener', `guess-${i}`, attackerIp);
    }
    expect(res.status).toBe(423);
    expect((await login('listener', PASSWORD, attackerIp)).status).toBe(423);

    const owner = await login('listener', PASSWORD, freshIp());
    expect(owner.status).toBe(200);
    expect(owner.body.token).toBeTruthy();
  });

  it('only reveals a suspended account to someone with the password', async () => {
    jest.spyOn(User, 'findByLoginIdentifier').mockResolvedValue(makeUser({ isActive: false }));
    expect((await login('listener', 'wrong')).status).toBe(401);
    expect((await login('listener', PASSWORD)).status).toBe(403);
  });

  it('never returns the password hash', async () => {
    jest.spyOn(User, 'findByLoginIdentifier').mockResolvedValue(makeUser());
    const res = await login('listener', PASSWORD);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain(passwordHash);
    expect(res.body.user.hasPassword).toBe(true);
  });
});

describe('POST /api/users/me/password', () => {
  function signedIn(user) {
    jest.spyOn(User, 'findOne').mockReturnValue({ select: () => Promise.resolve(user) });
    jest.spyOn(User, 'findById').mockResolvedValue(user);
    const token = jwt.sign({ userId: user.uuid }, getJwtSecret(), { expiresIn: '1h' });
    return (body) => request(app)
      .post('/api/users/me/password')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Forwarded-For', freshIp())
      .send(body);
  }

  it('rejects a wrong current password with 400, not 401', async () => {
    const send = signedIn(makeUser());
    const res = await send({ currentPassword: 'nope', newPassword: 'fresh random words here' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_CURRENT_PASSWORD');
  });

  it('rejects passwords under 8 characters', async () => {
    const send = signedIn(makeUser());
    const res = await send({ currentPassword: PASSWORD, newPassword: 'short', acceptPasswordWarnings: true });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('WEAK_PASSWORD');
  });

  it('warns about a common password, then accepts it once acknowledged', async () => {
    const user = makeUser();
    const send = signedIn(user);
    const warned = await send({ currentPassword: PASSWORD, newPassword: 'password123' });
    expect(warned.status).toBe(422);
    expect(warned.body.code).toBe('PASSWORD_WARNINGS');
    expect(user.password).toBe(passwordHash);

    const ok = await send({ currentPassword: PASSWORD, newPassword: 'password123', acceptPasswordWarnings: true });
    expect(ok.status).toBe(200);
    expect(user.password).toBe('password123');
  });

  it('changes the password, revokes older sessions and returns a token that still works', async () => {
    const user = makeUser();
    const send = signedIn(user);
    const res = await send({ currentPassword: PASSWORD, newPassword: 'fresh random words here' });

    expect(res.status).toBe(200);
    expect(user.password).toBe('fresh random words here');
    expect(user.passwordChangedAt).toBeInstanceOf(Date);
    const { iat } = jwt.verify(res.body.token, getJwtSecret());
    expect(iat).toBeGreaterThanOrEqual(Math.floor(user.passwordChangedAt.getTime() / 1000));
    expect(emailService.sendPasswordChangedNotification).toHaveBeenCalledWith(user);
  });

  it('sends social-only accounts to the emailed link', async () => {
    const send = signedIn(makeUser({ password: undefined }));
    const res = await send({ currentPassword: '', newPassword: 'fresh random words here' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NO_PASSWORD');
  });
});

describe('password reset', () => {
  it('gives the same answer whether or not the account exists or the email sends', async () => {
    jest.spyOn(User, 'findOne').mockImplementation(async ({ email }) => (email === 'known@example.com' ? makeUser({ email }) : null));
    emailService.sendPasswordReset.mockResolvedValueOnce(false);
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const known = await request(app).post('/api/email/password-reset/request').send({ email: 'known@example.com' });
    const unknown = await request(app).post('/api/email/password-reset/request').send({ email: 'unknown@example.com' });
    expect(known.status).toBe(200);
    expect(unknown.body).toEqual(known.body);
  });

  it('keeps the link usable after a weak password, then resets and clears lockout', async () => {
    const user = makeUser({ failedLoginAttempts: 12, accountLockedUntil: new Date(Date.now() + 60_000) });
    const token = user.generatePasswordResetToken();
    jest.spyOn(User, 'findByPasswordResetToken').mockResolvedValue(user);

    const weak = await request(app).post('/api/email/password-reset/confirm').send({ token, newPassword: 'short' });
    expect(weak.status).toBe(400);
    expect(weak.body.code).toBe('WEAK_PASSWORD');
    expect(user.passwordResetToken).toBeTruthy();

    const ok = await request(app).post('/api/email/password-reset/confirm').send({ token, newPassword: 'fresh random words here' });
    expect(ok.status).toBe(200);
    expect(user.passwordResetToken).toBeUndefined();
    expect(user.accountLockedUntil).toBeNull();
    expect(user.passwordChangedAt).toBeInstanceOf(Date);
  });

  it('flags invalid links so the page can send users back', async () => {
    jest.spyOn(User, 'findByPasswordResetToken').mockResolvedValue(null);
    const res = await request(app).post('/api/email/password-reset/confirm').send({ token: 'bogus', newPassword: 'fresh random words here' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('RESET_TOKEN_INVALID');
  });
});
