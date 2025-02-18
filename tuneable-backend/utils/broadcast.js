const { WebSocketServer } = require("ws");

let wss = null;
const activeRooms = {}; // Store song queues per party
const partyHosts = {}; // Store host per party

const setWebSocketServer = (server) => {
    wss = new WebSocketServer({ server });

    wss.on("connection", (ws) => {
        console.log("🔌 A new client connected!");

        ws.on("message", (message) => {
            try {
                const data = JSON.parse(message);
                if (!data.partyId) return;

                switch (data.type) {
                    case "JOIN":
                        console.log(`👥 User joined party ${data.partyId}`);
                        ws.partyId = data.partyId;
                        break;

                    case "UPDATE_QUEUE":
                        activeRooms[data.partyId] = data.queue;
                        broadcast(data.partyId, { type: "UPDATE_QUEUE", queue: data.queue });
                        break;

                    case "PLAY":
                    case "PAUSE":
                    case "SKIP":
                        if (partyHosts[data.partyId] === data.userId) {
                            handlePlaybackAction(data.partyId, data.type);
                        } else {
                            console.warn("⛔ Unauthorized playback action attempt.");
                        }
                        break;

                    case "SET_HOST":
                        partyHosts[data.partyId] = data.userId;
                        console.log(`👑 ${data.userId} is now the host of party ${data.partyId}`);
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

const handlePlaybackAction = (partyId, action) => {
    broadcast(partyId, { type: action });
    if (action === "SKIP") {
        activeRooms[partyId]?.shift(); // Remove current song
        broadcast(partyId, { type: "UPDATE_QUEUE", queue: activeRooms[partyId] });
        if (activeRooms[partyId]?.length > 0) {
            broadcast(partyId, { type: "PLAY_NEXT", song: activeRooms[partyId][0] });
        }
    }
};

const broadcast = (partyId, data) => {
    if (!wss) {
        console.error("❌ WebSocket server is not initialized");
        return;
    }
    wss.clients.forEach((client) => {
        if (client.readyState === 1 && client.partyId === partyId) {
            client.send(JSON.stringify({ partyId, ...data }));
        }
    });
};

module.exports = { setWebSocketServer, broadcast };
