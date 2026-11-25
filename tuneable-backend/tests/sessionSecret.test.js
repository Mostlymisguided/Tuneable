/**
 * Run: npx jest tests/sessionSecret.test.js
 */

const { getSessionSecret } = require('../config/sessionSecret');

describe('sessionSecret', () => {
  const original = process.env.SESSION_SECRET;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (original === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = original;
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('refuses a missing secret outside tests', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.SESSION_SECRET;
    expect(() => getSessionSecret()).toThrow(/SESSION_SECRET is not set/);
  });

  it('refuses the old public default', () => {
    process.env.NODE_ENV = 'production';
    process.env.SESSION_SECRET = 'your-session-secret-key';
    expect(() => getSessionSecret()).toThrow(/placeholder/);
  });

  it('returns a configured secret', () => {
    process.env.NODE_ENV = 'production';
    process.env.SESSION_SECRET = 'a-real-session-secret-value-with-enough-length';
    expect(getSessionSecret()).toBe('a-real-session-secret-value-with-enough-length');
  });
});
