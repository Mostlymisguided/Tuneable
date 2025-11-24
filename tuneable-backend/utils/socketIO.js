/**
 * Socket.IO Server Setup for Real-time Notifications
 * 
 * Handles real-time notification delivery to users
 */

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const { resolvePartyIdValue } = require('./idResolver');

let io = null;

// Map of userId -> socket connections
const userSockets = new Map();

const SECRET_KEY = process.env.JWT_SECRET || 'defaultsecretkey';

/**
 * Verify JWT token and get user
 * @param {string} token - JWT token
 * @returns {Promise<Object|null>} User object or null if invalid
 */
const verifyTokenAndGetUser = async (token) => {
  try {
    if (!token) return null;

    const decoded = jwt.verify(token, SECRET_KEY);
    
    // Fetch user by UUID (new approach) or fallback to _id (legacy support)
    let user;
    if (decoded.userId && decoded.userId.includes('-')) {
      // UUID format - look up by uuid field
      user = await User.findOne({ uuid: decoded.userId }).select('_id uuid username');
    } else if (mongoose.Types.ObjectId.isValid(decoded.userId)) {
      // Legacy ObjectId format - look up by _id for backward compatibility
      user = await User.findById(decoded.userId).select('_id uuid username');
    } else {
      return null;
    }

    return user;
  } catch (error) {
    console.error('Token verification error:', error.message);
    return null;
  }
};

/**
 * Initialize Socket.IO server
 */
const initializeSocketIO = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || '*',
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  io.on('connection', (socket) => {
    console.log('🔌 Socket.IO client connected:', socket.id);

    // Handle user authentication and join their user room
    socket.on('authenticate', async (data) => {
      try {
        const { token } = data || {};
        
        // If no token provided, silently ignore (client may connect without auth)
        if (!token) {
          return;
        }

        // Verify JWT token and get user
        const user = await verifyTokenAndGetUser(token);
        
        if (!user) {
          // Only emit error if token was provided but invalid
          socket.emit('error', { message: 'Invalid or expired token' });
          return;
        }

        const userId = user._id.toString();
        
        // Join user-specific room
        socket.join(`user:${userId}`);
        
        // Track socket connection
        if (!userSockets.has(userId)) {
          userSockets.set(userId, new Set());
        }
        userSockets.get(userId).add(socket.id);
        
        // Store user info on socket for later use
        socket.userId = userId;
        socket.user = user;
        
        console.log(`✅ User ${user.username} (${userId}) authenticated via Socket.IO`);
        
        // Emit confirmation
        socket.emit('authenticated', { success: true, userId, username: user.username });
      } catch (error) {
        // Only log/emit errors if token was provided (don't log for missing tokens)
        if (data && data.token) {
          console.error('Socket.IO authentication error:', error);
          socket.emit('error', { message: 'Authentication failed', details: error.message });
        }
        // Otherwise silently ignore (no token provided - client may connect without auth)
      }
    });

    // Handle party room joining
    socket.on('join-party', async (data) => {
      try {
        const { partyId } = data;
        if (!partyId) {
          socket.emit('error', { message: 'Party ID is required' });
          return;
        }

        // Resolve "global" slug or UUID to ObjectId (same as middleware)
        const resolvedPartyId = await resolvePartyIdValue(partyId);
        if (!resolvedPartyId) {
          socket.emit('error', { message: 'Party not found' });
          return;
        }

        // Join party room using resolved ObjectId
        socket.join(`party:${resolvedPartyId}`);
        console.log(`🎉 Socket ${socket.id} joined party room: party:${resolvedPartyId}`);
        
        // Emit confirmation with resolved partyId for consistency
        socket.emit('party-joined', { partyId: resolvedPartyId, success: true });
      } catch (error) {
        console.error('Error joining party room:', error);
        socket.emit('error', { message: 'Failed to join party room', details: error.message });
      }
    });

    // Handle party room leaving
    socket.on('leave-party', async (data) => {
      try {
        const { partyId } = data;
        if (partyId) {
          // Resolve "global" slug or UUID to ObjectId
          const resolvedPartyId = await resolvePartyIdValue(partyId);
          if (resolvedPartyId) {
            socket.leave(`party:${resolvedPartyId}`);
            console.log(`👋 Socket ${socket.id} left party room: party:${resolvedPartyId}`);
          }
        }
      } catch (error) {
        console.error('Error leaving party room:', error);
      }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log('❌ Socket.IO client disconnected:', socket.id);
      
      // Remove from userSockets map if authenticated
      if (socket.userId) {
        const sockets = userSockets.get(socket.userId);
        if (sockets) {
          sockets.delete(socket.id);
          if (sockets.size === 0) {
            userSockets.delete(socket.userId);
          }
        }
        console.log(`👋 User ${socket.user?.username || socket.userId} disconnected from Socket.IO`);
      }
    });
  });

  // Socket.IO server is initialized and ready
  return io;
};

/**
 * Send notification to specific user(s)
 * @param {string|string[]} userIds - User ID(s) to send notification to
 * @param {object} notification - Notification object
 */
const sendNotification = (userIds, notification) => {
  if (!io) {
    console.error('❌ Socket.IO server not initialized');
    return;
  }

  const userIdArray = Array.isArray(userIds) ? userIds : [userIds];

  userIdArray.forEach(userId => {
    io.to(`user:${userId}`).emit('notification', notification);
    console.log(`📬 Notification sent to user: ${userId}`);
  });
};

/**
 * Broadcast notification to all connected users
 * @param {object} notification - Notification object
 */
const broadcastNotification = (notification) => {
  if (!io) {
    console.error('❌ Socket.IO server not initialized');
    return;
  }

  io.emit('notification', notification);
  console.log('📢 Notification broadcasted to all users');
};

/**
 * Send unread count update to user
 * @param {string} userId - User ID
 * @param {number} count - Unread count
 */
const sendUnreadCount = (userId, count) => {
  if (!io) {
    console.error('❌ Socket.IO server not initialized');
    return;
  }

  io.to(`user:${userId}`).emit('unread-count', { count });
  console.log(`📊 Unread count update sent to user ${userId}: ${count}`);
};

/**
 * Broadcast update to all users in a party room
 * @param {string} partyId - Party ID
 * @param {object} data - Data to broadcast
 */
const broadcastToParty = (partyId, data) => {
  if (!io) {
    console.error('❌ Socket.IO server not initialized');
    return;
  }

  io.to(`party:${partyId}`).emit('party-update', { partyId, ...data });
  console.log(`📢 Party update broadcasted to party:${partyId}`, data.type || 'update');
};

module.exports = {
  initializeSocketIO,
  sendNotification,
  broadcastNotification,
  sendUnreadCount,
  broadcastToParty,
  getIO: () => io
};

