const { WebSocketServer } = require("ws");

let wss = null;
const activeRooms = {}; // Store queues per party
const partyHosts = {}; // Track who the host is for each party

// Initialize WebSocket Server
const setWebSocketServer = (server) => {
    wss = new WebSocketServer({ server });
    console.log("✅ WebSocket server initialized.");

    wss.on("connection", (ws) => {
        console.log("🔌 A new client connected!");

        ws.on("message", (message) => {
            try {
                const { type, partyId, songId, action, userId } = JSON.parse(message);

                if (!partyId) return;

                switch (type) {
                    case "ADD_SONG":
                        if (!activeRooms[partyId]) activeRooms[partyId] = [];
                        activeRooms[partyId].push(songId);
                        broadcast(partyId, { type: "UPDATE_QUEUE", queue: activeRooms[partyId] });
                        break;

                    case "SET_HOST":
                        partyHosts[partyId] = userId;
                        break;

                    case "HOST_ACTION":
                        if (partyHosts[partyId] !== userId) {
                            console.warn("⛔ Unauthorized host action attempt.");
                            return;
                        }
                        if (action === "PLAY") {
                          broadcast(partyId, { type: "PLAY", playing: true });
                      }
                      if (action === "PAUSE") {
                          broadcast(partyId, { type: "PAUSE", playing: false });
                      }
                      if (action === "SKIP") {
                          if (activeRooms[partyId]?.length > 0) {
                              activeRooms[partyId].shift(); // Remove the first song
                          }
                          broadcast(partyId, { type: "UPDATE_QUEUE", queue: activeRooms[partyId] });
                      }
                      break;
                }
            } catch (error) {
                console.error("❌ WebSocket Error:", error);
            }
        });

        ws.on("close", () => {
            console.log("❌ Client disconnected");
        });
    });
};

const broadcast = (partyId, data) => {
    if (!wss) {
        console.error("❌ WebSocket server is not initialized");
        return;
    }
    wss.clients.forEach((client) => {
        if (client.readyState === 1) {
            client.send(JSON.stringify({ partyId, ...data }));
        }
    });
};

module.exports = { setWebSocketServer, broadcast };
