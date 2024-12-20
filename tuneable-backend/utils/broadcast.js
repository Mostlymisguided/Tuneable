const { WebSocketServer } = require('ws');

let wss = null; // Placeholder for WebSocketServer instance

// Initialize WebSocket Server
const setWebSocketServer = (server) => {
  wss = new WebSocketServer({ server });
  console.log('WebSocket server initialized.');

  wss.on('connection', (ws) => {
    console.log('A new client connected!');

    ws.on('message', (message) => {
      console.log(`Received: ${message}`);
    });

    ws.on('close', () => {
      console.log('Client disconnected');
    });
  });
};

// Broadcast updates to clients
const broadcast = (partyId, data) => {
  if (!wss) {
    console.error('WebSocket server is not initialized');
    return;
  }
  console.log(`Broadcasting to partyId: ${partyId}`, data);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(JSON.stringify({ partyId, ...data }));
    }
  });
};

module.exports = { setWebSocketServer, broadcast };
