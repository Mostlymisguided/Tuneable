const mongoose = require('mongoose');

jest.mock('../db', () => ({
    connectDB: jest.fn(() => Promise.resolve()), // Mock connectDB
    disconnectDB: jest.fn(() => Promise.resolve()), // Mock disconnectDB
  }));  

describe('Database Connection', () => {
  beforeAll(async () => {
    try {
      await db.connectDB();
      console.log('Connected to the test database');
    } catch (error) {
      console.error('Error connecting to the test database:', error);
      throw error; // Fail the tests if the connection fails
    }
  });

  afterAll(async () => {
    try {
      await mongoose.connection.close();
      console.log('Disconnected from the test database');
    } catch (error) {
      console.error('Error disconnecting from the test database:', error);
    }
  });

  it('should connect to the database successfully', async () => {
    expect(mongoose.connection.readyState).toBe(1); // 1 = connected
  });

  it('should handle connection errors gracefully', async () => {
    const invalidUri = 'mongodb://invalid_uri';
    await expect(mongoose.connect(invalidUri)).rejects.toThrow(); // Check for connection failure
  });

  it('should insert and retrieve a document', async () => {
    const TestModel = mongoose.model('Test', new mongoose.Schema({ name: String }));
    const testDoc = await TestModel.create({ name: 'Test Document' });

    expect(testDoc.name).toBe('Test Document');

    const fetchedDoc = await TestModel.findOne({ name: 'Test Document' });
    expect(fetchedDoc.name).toBe('Test Document');

    await TestModel.deleteMany(); // Clean up
  });

  it('should fail to retrieve a document if none exist', async () => {
    const TestModel = mongoose.model('Test', new mongoose.Schema({ name: String }));
    const fetchedDoc = await TestModel.findOne({ name: 'Nonexistent' });
    expect(fetchedDoc).toBeNull();
  });
});