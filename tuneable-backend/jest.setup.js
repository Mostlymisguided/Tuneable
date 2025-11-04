jest.mock('./utils/socketIO', () => {
  return {
    initializeSocketIO: jest.fn((server) => {
      console.log('Mock Socket.IO server initialized');
      return {
        on: jest.fn(),
        to: jest.fn(() => ({
          emit: jest.fn(),
        })),
        emit: jest.fn(),
      };
    }),
    sendNotification: jest.fn(),
    broadcastNotification: jest.fn(),
    sendUnreadCount: jest.fn(),
    broadcastToParty: jest.fn((partyId, data) => {
      console.log(`Mock broadcast to party ${partyId}:`, data);
    }),
    getIO: jest.fn(() => ({
      to: jest.fn(() => ({
        emit: jest.fn(),
      })),
      emit: jest.fn(),
    })),
  };
});

// Mock Database Connection
jest.mock('./db', () => ({
  connectDB: jest.fn(async () => {
    console.log('Mock database connected');
  }),
  disconnectDB: jest.fn(async () => {
    console.log('Mock database disconnected');
  }),
}));

// Debugging Path Resolution
const path = require('path');
console.log('Resolved path to socketIO:', path.resolve(__dirname, './utils/socketIO'));

// Ensure proper cleanup of database connections after tests
const mongoose = require('mongoose');
afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close(); // Ensure the database connection is closed
    console.log('Database connection closed');
  }
});

// Mock app.listen for testing
jest.mock('./index', () => {
  const appMock = {
    ...jest.requireActual('./index').app,
    listen: jest.fn(() => {
      console.log('Mock server started');
      return { close: jest.fn() }; // Mock close method for server cleanup
    }),
  };
  return { app: appMock };
});

// Increase Jest timeout for tests that involve database or network operations
jest.setTimeout(30000); // 30 seconds
