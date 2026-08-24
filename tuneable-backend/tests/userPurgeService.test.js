/**
 * Unit tests for admin user purge guards (no DB).
 * Run: node tuneable-backend/tests/userPurgeService.test.js
 */

const assert = require('assert');
const { assertCanPurge, assertUsernameShape } = require('../services/userPurgeService');

function expectStatus(fn, status, messageIncludes) {
  try {
    fn();
    assert.fail('expected error');
  } catch (err) {
    assert.strictEqual(err.status, status, err.message);
    if (messageIncludes) {
      assert.ok(String(err.message).includes(messageIncludes), err.message);
    }
  }
}

function testUsernameShape() {
  assertUsernameShape('testuser1');
  expectStatus(() => assertUsernameShape('ab'), 400, '3–20');
  expectStatus(() => assertUsernameShape('not valid'), 400, 'letters and numbers');
}

function testPurgeGuards() {
  const actor = { _id: 'admin1', username: 'admin', role: ['user', 'admin'] };
  expectStatus(() => assertCanPurge(null, actor), 404, 'not found');
  expectStatus(
    () => assertCanPurge({ _id: 'admin1', role: ['user'] }, actor),
    400,
    'own account'
  );
  expectStatus(
    () => assertCanPurge({ _id: 'other', role: ['user', 'admin'] }, actor),
    403,
    'Admin accounts'
  );
  assertCanPurge({ _id: 'tester', role: ['user'], username: 'testuser1' }, actor);
}

function run() {
  testUsernameShape();
  testPurgeGuards();
  console.log('✅ userPurgeService.test.js passed');
}

run();
