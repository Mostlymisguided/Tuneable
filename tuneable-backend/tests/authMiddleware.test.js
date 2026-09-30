/**
 * Run: npx jest tests/authMiddleware.test.js
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const authMiddleware = require('../middleware/authMiddleware');
const { getJwtSecret } = require('../config/jwtSecret');

function mockRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function reqWith(token) {
  return { headers: token ? { authorization: `Bearer ${token}` } : {} };
}

function mockUserLookup(user) {
  jest.spyOn(User, 'findOne').mockReturnValue({ select: () => Promise.resolve(user) });
}

const uuid = '0191f3a2-1111-7222-8333-944455556666';

describe('authMiddleware', () => {
  let logSpy;
  beforeEach(() => { logSpy = jest.spyOn(console, 'log').mockImplementation(() => {}); });
  afterEach(() => { jest.restoreAllMocks(); logSpy.mockRestore(); });

  it('rejects requests without a token', async () => {
    const res = mockRes();
    const next = jest.fn();
    await authMiddleware(reqWith(null), res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects tokens signed with another secret', async () => {
    const res = mockRes();
    const next = jest.fn();
    await authMiddleware(reqWith(jwt.sign({ userId: uuid }, 'defaultsecretkey')), res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects expired tokens', async () => {
    const res = mockRes();
    const next = jest.fn();
    const token = jwt.sign({ userId: uuid }, getJwtSecret(), { expiresIn: '-1h' });
    await authMiddleware(reqWith(token), res, next);
    expect(res.statusCode).toBe(401);
  });

  it('attaches the user for a valid token', async () => {
    const user = { _id: 'abc', uuid, username: 'listener', isActive: true };
    mockUserLookup(user);
    const req = reqWith(jwt.sign({ userId: uuid }, getJwtSecret()));
    const next = jest.fn();
    await authMiddleware(req, mockRes(), next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toBe(user);
  });

  it('rejects tokens issued before the last password change', async () => {
    const iat = Math.floor(Date.now() / 1000) - 60;
    mockUserLookup({ _id: 'abc', uuid, isActive: true, passwordChangedAt: new Date() });
    const res = mockRes();
    const next = jest.fn();
    await authMiddleware(reqWith(jwt.sign({ userId: uuid, iat }, getJwtSecret())), res, next);
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('SESSION_REVOKED');
    expect(next).not.toHaveBeenCalled();
  });

  it('blocks inactive accounts', async () => {
    mockUserLookup({ _id: 'abc', uuid, isActive: false });
    const res = mockRes();
    await authMiddleware(reqWith(jwt.sign({ userId: uuid }, getJwtSecret())), res, jest.fn());
    expect(res.statusCode).toBe(403);
  });
});
