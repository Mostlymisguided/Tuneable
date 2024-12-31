const jwt = require('jsonwebtoken');
const authMiddleware = require('../middleware/authMiddleware'); // Adjust the path as necessary
const httpMocks = require('node-mocks-http');
const mongoose = require('mongoose');

jest.mock('../db', () => ({
    connectDB: jest.fn(() => Promise.resolve()), // Mock connectDB
    disconnectDB: jest.fn(() => Promise.resolve()), // Mock disconnectDB
  }));  

describe('Auth Middleware', () => {
  const validToken = jwt.sign({ id: 'user123', name: 'Test User' }, 'secretKey', { expiresIn: '1h' }); // Use your actual secret key
  const expiredToken = jwt.sign({ id: 'user123', name: 'Test User' }, 'secretKey', { expiresIn: '-1h' });

  it('should attach user to req if token is valid', async () => {
    const req = httpMocks.createRequest({
      headers: {
        authorization: `Bearer ${validToken}`,
      },
    });
    const res = httpMocks.createResponse();
    const next = jest.fn();

    await authMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user.id).toBe('user123');
  });

  it('should return 401 if token is missing', async () => {
    const req = httpMocks.createRequest();
    const res = httpMocks.createResponse();
    const next = jest.fn();

    await authMiddleware(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res._getData()).toBe('Authorization token missing'); // Adjust error message if necessary
  });

  it('should return 401 if token is invalid', async () => {
    const req = httpMocks.createRequest({
      headers: {
        authorization: 'Bearer invalidToken',
      },
    });
    const res = httpMocks.createResponse();
    const next = jest.fn();

    await authMiddleware(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res._getData()).toBe('Invalid token'); // Adjust error message if necessary
  });

  it('should return 401 if token is expired', async () => {
    const req = httpMocks.createRequest({
      headers: {
        authorization: `Bearer ${expiredToken}`,
      },
    });
    const res = httpMocks.createResponse();
    const next = jest.fn();

    await authMiddleware(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res._getData()).toBe('Token expired'); // Adjust error message if necessary
  });
});

afterAll(async () => {
    await mongoose.connection.close();
    const { disconnectDB } = require('../db');
    await disconnectDB(); // Call the mocked disconnectDB
  });
  