/**
 * Response masking of blocked users on public routers.
 * Run: npx jest tests/maskBlockedUsersMiddleware.test.js
 */

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const mockViewer = new mongoose.Types.ObjectId();
const mockBlockedUser = new mongoose.Types.ObjectId();

jest.mock('../models/User', () => ({
  findOne: jest.fn(() => ({ select: () => ({ lean: async () => null }) })),
}));

jest.mock('../utils/userBlocks', () => {
  const actual = jest.requireActual('../utils/userBlocks');
  return {
    ...actual,
    getBlockedUserIds: jest.fn(async (id) =>
      String(id) === String(mockViewer) ? new Set([String(mockBlockedUser)]) : new Set()
    ),
  };
});

const { getJwtSecret } = require('../config/jwtSecret');
const maskBlockedUsers = require('../middleware/maskBlockedUsers');

function buildApp() {
  const app = express();
  app.use(maskBlockedUsers);
  app.get('/bids', (req, res) => {
    res.json({
      bids: [
        { amount: 200, userId: { _id: String(mockBlockedUser), username: 'blocked', profilePic: 'p' } },
        { amount: 100, userId: { _id: 'other', username: 'friend', profilePic: 'q' } },
      ],
    });
  });
  app.get('/status', (req, res) => res.status(201).send({ ok: true }));
  return app;
}

const tokenFor = (id) => jwt.sign({ userId: String(id) }, getJwtSecret());

describe('maskBlockedUsers middleware', () => {
  test('masks blocked users for a signed-in viewer', async () => {
    const res = await request(buildApp())
      .get('/bids')
      .set('Authorization', `Bearer ${tokenFor(mockViewer)}`);
    expect(res.status).toBe(200);
    expect(res.body.bids[0].userId).toMatchObject({ username: 'Supporter', anonymous: true, _id: String(mockBlockedUser) });
    expect(res.body.bids[0].amount).toBe(200);
    expect(res.body.bids[1].userId.username).toBe('friend');
  });

  test('leaves responses alone for anonymous viewers', async () => {
    const res = await request(buildApp()).get('/bids');
    expect(res.body.bids[0].userId.username).toBe('blocked');
  });

  test('ignores invalid tokens', async () => {
    const res = await request(buildApp()).get('/bids').set('Authorization', 'Bearer nope');
    expect(res.body.bids[0].userId.username).toBe('blocked');
  });

  test('keeps status codes set before res.send', async () => {
    const res = await request(buildApp())
      .get('/status')
      .set('Authorization', `Bearer ${tokenFor(mockViewer)}`);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true });
  });
});
