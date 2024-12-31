jest.mock('./utils/broadcast', () => {
    // Mock WebSocket Server
    const mockClients = []; // Simulate connected WebSocket clients
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
  
  // Debugging Path Resolution
  const path = require('path');
  console.log('Resolved path to broadcast:', path.resolve(__dirname, './utils/broadcast'));
  