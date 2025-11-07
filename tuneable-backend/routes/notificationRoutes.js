const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const User = require('../models/User');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const { isValidObjectId } = require('../utils/validators');
const { sendNotification, sendUnreadCount, broadcastNotification } = require('../utils/socketIO');

/**
 * @route   GET /api/notifications
 * @desc    Get user's notifications (paginated)
 * @access  Private
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;
    const { page = 1, limit = 20, unreadOnly = false } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build query
    const query = { userId };
    if (unreadOnly === 'true') {
      query.isRead = false;
    }
    
    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .populate('relatedMediaId', 'title artist coverArt uuid')
      .populate('relatedPartyId', 'name uuid')
      .populate('relatedUserId', 'username profilePic uuid')
      .lean();
    
    const total = await Notification.countDocuments(query);
    const unreadCount = await Notification.countDocuments({ userId, isRead: false });
    
    res.json({
      notifications,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      },
      unreadCount
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications', details: error.message });
  }
});

/**
 * @route   GET /api/notifications/unread-count
 * @desc    Get unread notification count
 * @access  Private
 */
router.get('/unread-count', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;
    const count = await Notification.countDocuments({ userId, isRead: false });
    res.json({ count });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({ error: 'Failed to fetch unread count', details: error.message });
  }
});

/**
 * @route   PUT /api/notifications/:notificationId/read
 * @desc    Mark notification as read
 * @access  Private
 */
router.put('/:notificationId/read', authMiddleware, async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user._id;
    
    if (!isValidObjectId(notificationId)) {
      return res.status(400).json({ error: 'Invalid notification ID' });
    }
    
    const notification = await Notification.findOne({ _id: notificationId, userId });
    
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    
    notification.isRead = true;
    notification.readAt = new Date();
    await notification.save();
    
    // Update unread count via Socket.IO
    const unreadCount = await Notification.countDocuments({ userId, isRead: false });
    sendUnreadCount(userId.toString(), unreadCount);
    
    res.json({ message: 'Notification marked as read', notification });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Failed to mark notification as read', details: error.message });
  }
});

/**
 * @route   PUT /api/notifications/read-all
 * @desc    Mark all notifications as read
 * @access  Private
 */
router.put('/read-all', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;
    
    const result = await Notification.updateMany(
      { userId, isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    );
    
    // Update unread count via Socket.IO
    sendUnreadCount(userId.toString(), 0);
    
    res.json({ 
      message: 'All notifications marked as read', 
      updatedCount: result.modifiedCount 
    });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ error: 'Failed to mark all notifications as read', details: error.message });
  }
});

/**
 * @route   DELETE /api/notifications/:notificationId
 * @desc    Delete a notification
 * @access  Private
 */
router.delete('/:notificationId', authMiddleware, async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user._id;
    
    if (!isValidObjectId(notificationId)) {
      return res.status(400).json({ error: 'Invalid notification ID' });
    }
    
    const notification = await Notification.findOneAndDelete({ _id: notificationId, userId });
    
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    
    res.json({ message: 'Notification deleted' });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ error: 'Failed to delete notification', details: error.message });
  }
});

/**
 * @route   POST /api/admin/notifications/send
 * @desc    Admin: Send notification to specific user(s)
 * @access  Private (Admin only)
 */
router.post('/admin/send', adminMiddleware, async (req, res) => {
  try {
    const { userIds, title, message, link, linkText, type = 'admin_announcement' } = req.body;
    
    if (!title || !message) {
      return res.status(400).json({ error: 'Title and message are required' });
    }
    
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'User IDs array is required' });
    }
    
    // Validate user IDs exist
    const users = await User.find({ 
      _id: { $in: userIds } 
    }).select('_id');
    
    if (users.length !== userIds.length) {
      return res.status(400).json({ error: 'Some user IDs are invalid' });
    }
    
    // Create notifications for each user
    const notifications = userIds.map(userId => ({
      userId,
      type,
      title,
      message,
      link,
      linkText,
      isGlobal: false,
      createdAt: new Date()
    }));
    
    const created = await Notification.insertMany(notifications);
    
    // Emit real-time notifications via Socket.IO
    created.forEach((notification) => {
      sendNotification(notification.userId.toString(), {
        _id: notification._id,
        uuid: notification.uuid,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        link: notification.link,
        linkText: notification.linkText,
        isRead: notification.isRead,
        createdAt: notification.createdAt
      });
      
      // Update unread count for each user
      Notification.countDocuments({ userId: notification.userId, isRead: false })
        .then(count => {
          sendUnreadCount(notification.userId.toString(), count);
        })
        .catch(err => console.error('Error updating unread count:', err));
    });
    
    res.json({ 
      message: `Notification sent to ${created.length} user(s)`, 
      notifications: created 
    });
  } catch (error) {
    console.error('Error sending notification:', error);
    res.status(500).json({ error: 'Failed to send notification', details: error.message });
  }
});

/**
 * @route   POST /api/admin/notifications/broadcast
 * @desc    Admin: Broadcast notification to all users
 * @access  Private (Admin only)
 */
router.post('/admin/broadcast', adminMiddleware, async (req, res) => {
  try {
    const { title, message, link, linkText, type = 'admin_announcement' } = req.body;
    
    if (!title || !message) {
      return res.status(400).json({ error: 'Title and message are required' });
    }
    
    // Get all active users
    const users = await User.find({ isActive: true }).select('_id');
    
    if (users.length === 0) {
      return res.status(400).json({ error: 'No active users found' });
    }
    
    // Create notifications for all users
    const notifications = users.map(user => ({
      userId: user._id,
      type,
      title,
      message,
      link,
      linkText,
      isGlobal: true,
      createdAt: new Date()
    }));
    
    // Insert in batches to avoid memory issues
    const batchSize = 1000;
    let inserted = 0;
    
    for (let i = 0; i < notifications.length; i += batchSize) {
      const batch = notifications.slice(i, i + batchSize);
      await Notification.insertMany(batch);
      inserted += batch.length;
    }
    
    // Emit real-time notifications via Socket.IO (broadcast to all)
    broadcastNotification({
      type,
      title,
      message,
      link,
      linkText,
      isGlobal: true,
      createdAt: new Date()
    });
    
    // Update unread counts for all users (will be done individually via Socket.IO)
    
    res.json({ 
      message: `Notification broadcasted to ${inserted} user(s)`, 
      count: inserted 
    });
  } catch (error) {
    console.error('Error broadcasting notification:', error);
    res.status(500).json({ error: 'Failed to broadcast notification', details: error.message });
  }
});

module.exports = router;

