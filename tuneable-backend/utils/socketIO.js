/**
 * Socket.IO Server Setup for Real-time Notifications
 * 
 * Handles real-time notification delivery to users
 */

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');

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
        const { token } = data;
        
        if (!token) {
          socket.emit('error', { message: 'Token is required' });
          return;
        }

        // Verify JWT token and get user
        const user = await verifyTokenAndGetUser(token);
        
        if (!user) {
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
        console.error('Socket.IO authentication error:', error);
        socket.emit('error', { message: 'Authentication failed', details: error.message });
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

module.exports = {
  initializeSocketIO,
  sendNotification,
  broadcastNotification,
  sendUnreadCount,
  getIO: () => io
};

