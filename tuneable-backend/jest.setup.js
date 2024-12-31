jest.mock('./utils/broadcast', () => {
  // Mock WebSocket Server
  const mockClients = [];
  const wss = {
    clients: mockClients,
    on: jest.fn((event, handler) => {
      if (event === 'connection') {
        const mockClient = {
          readyState: 1, // OPEN state
          send: jest.fn(),
          on: jest.fn(),
        };
        mockClients.push(mockClient);
        handler(mockClient); // Simulate a connection
      }
    }),
  };

  return {
    setWebSocketServer: jest.fn((server) => {
      console.log('Mock WebSocket server initialized');
    }),
    broadcast: jest.fn((partyId, data) => {
      console.log(`Mock broadcast to ${partyId}:`, data);
      wss.clients.forEach((client) => {
        if (client.readyState === 1) {
          client.send(JSON.stringify({ partyId, ...data }));
        }
      });
    }),
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
console.log('Resolved path to broadcast:', path.resolve(__dirname, './utils/broadcast'));

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
