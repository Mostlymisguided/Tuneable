const request = require('supertest');
const app = require('../index'); // Import your Express app
const Party = require('../models/Party');
const Playlist = require('../models/Playlist');
const db = require('../db'); // Adjust the path as needed

jest.mock('../db', () => ({
    connectDB: jest.fn(() => Promise.resolve()), // Mock connectDB
    disconnectDB: jest.fn(() => Promise.resolve()), // Mock disconnectDB
  }));
  

describe('Party API', () => {
  let playlist;
  beforeAll(async () => {
    // Create a test playlist
    playlist = await Playlist.create({
      name: 'Test Playlist',
      description: 'Playlist for testing',
      tracks: [
        { title: 'Track 1', platform: 'Spotify', url: 'http://spotify.com/track1' },
      ],
    });
  });

  afterAll(async () => {
    // Clean up test data
    await Playlist.deleteMany({});
    await Party.deleteMany({});
  });

  it('should create a new party', async () => {
    const res = await request(app)
      .post('/api/parties')
      .send({ name: 'Test Party' });

    expect(res.status).toBe(201);
    expect(res.body.party.name).toBe('Test Party');
    expect(res.body.party.playlist.toString()).toBe(playlist._id.toString());
  });

  it('should fetch all parties', async () => {
    const res = await request(app).get('/api/parties');

    expect(res.status).toBe(200);
    expect(res.body.parties.length).toBeGreaterThan(0);
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

