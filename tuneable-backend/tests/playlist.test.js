const request = require('supertest');
const app = require('../index'); // Your Express app
const Playlist = require('../models/Playlist');
const db = require('../db'); // Adjust the path as needed

jest.mock('../db', () => ({
    connectDB: jest.fn(() => Promise.resolve()), // Mock connectDB
    disconnectDB: jest.fn(() => Promise.resolve()), // Mock disconnectDB
  }));  

describe('Playlist API', () => {
  beforeAll(async () => {
    // Clear any existing test data
    await Playlist.deleteMany({});
  });

  afterAll(async () => {
    // Cleanup test data
    await Playlist.deleteMany({});
  });

  it('should create a new playlist', async () => {
    const res = await request(app)
      .post('/api/playlists')
      .send({ name: 'Party Hits', description: 'Best party songs' });
    
    expect(res.status).toBe(201);
    expect(res.body.playlist.name).toBe('Party Hits');
    expect(res.body.playlist.tracks).toEqual([]);
  });

  it('should fail to create a playlist with invalid data', async () => {
    const res = await request(app)
      .post('/api/playlists')
      .send({ name: 'Sh' }); // Invalid name (too short)
    
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
    expect(res.body.error).toContain('Name must be at least 3 characters'); // Example validation
  });
});

let server;

beforeAll(async () => {
  try {
    server = app.listen(8000, () => {
      console.log('Test server running on port 8000');
    });
  } catch (error) {
    console.error('Error starting the server:', error);
    throw error; // Ensure tests fail if the server doesn't start
  }
});

afterAll(async () => {
  if (server) {
    try {
      await server.close();
      console.log('Test server shut down gracefully');
    } catch (error) {
      console.error('Error shutting down the server:', error);
    }
  }
});
