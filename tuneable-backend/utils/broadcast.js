/**
 * WebSocket Broadcast Utility
 * 
 * NOTE: This module provides WebSocket functionality for live party (jukebox) features.
 * Currently NOT used in MVP which focuses on remote parties only.
 * 
 * Will be activated when party.type === 'live' for future jukebox functionality where
 * songs auto-play and status updates (playing, completed, etc.) are synced in real-time.
 * 
 * For remote parties (MVP), status management happens via manual skip/refresh actions.
 */

const { WebSocketServer } = require("ws");

let wss = null;
const activeRooms = {}; // Store song queues per party (live parties only)
const partyHosts = {};  // Store host per party (live parties only)

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
            if (Array.isArray(data.queue)) {
              activeRooms[data.partyId] = data.queue;
              console.log(`Queue for party ${data.partyId} updated:`, data.queue);
            } else {
              console.warn(`Invalid queue received for party ${data.partyId}`);
            }
            broadcast(data.partyId, { type: "UPDATE_QUEUE", queue: activeRooms[data.partyId] });
            break;

          case "SKIP":
            if (partyHosts[data.partyId] === data.userId) {
              handlePlaybackAction(data.partyId, data.type);
            } else {
              console.warn("⛔ Unauthorized playback action attempt.");
            }
            break;

          case "TRANSITION_SONG":
            if (partyHosts[data.partyId] === data.userId) {
              handlePlaybackAction(data.partyId, data.type);
            } else {
              console.warn("⛔ Unauthorized transition_song action attempt.");
            }
            break;

          case "PLAY":
            if (partyHosts[data.partyId] === data.userId) {
              broadcast(data.partyId, { type: "PLAY" });
            } else {
              console.warn("⛔ Unauthorized play action attempt.");
            }
            break;

          case "PAUSE":
            if (partyHosts[data.partyId] === data.userId) {
              broadcast(data.partyId, { type: "PAUSE" });
            } else {
              console.warn("⛔ Unauthorized pause action attempt.");
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
  if (action === "SKIP" || action === "TRANSITION_SONG") {
    if (!activeRooms[partyId] || !Array.isArray(activeRooms[partyId])) {
      console.warn(`No active queue available for party ${partyId}.`);
      return;
    }
    // Remove the current song.
    activeRooms[partyId].shift();
    broadcast(partyId, { type: "UPDATE_QUEUE", queue: activeRooms[partyId] });
    if (activeRooms[partyId].length > 0) {
      broadcast(partyId, { type: "PLAY_NEXT", song: activeRooms[partyId][0] });
      broadcast(partyId, { type: "PLAY" });
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

const broadcastToParty = broadcast;

module.exports = { setWebSocketServer, broadcast, broadcastToParty };
