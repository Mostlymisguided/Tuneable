/**
 * Notification Service
 * 
 * Utility service for creating and sending notifications
 */

const Notification = require('../models/Notification');
const User = require('../models/User');
const Media = require('../models/Media');
const { sendNotification, sendUnreadCount } = require('../utils/socketIO');

/**
 * Create a notification for a user
 * @param {Object} params - Notification parameters
 * @param {string} params.userId - User ID to send notification to
 * @param {string} params.type - Notification type (bid_received, comment_reply, etc.)
 * @param {string} params.title - Notification title
 * @param {string} params.message - Notification message
 * @param {string} params.link - Optional link URL
 * @param {string} params.linkText - Optional link text
 * @param {string} params.relatedMediaId - Optional related media ID
 * @param {string} params.relatedPartyId - Optional related party ID
 * @param {string} params.relatedUserId - Optional related user ID
 * @param {string} params.relatedBidId - Optional related bid ID
 * @param {string} params.relatedCommentId - Optional related comment ID
 * @param {string} params.groupKey - Optional group key for aggregating similar notifications
 * @returns {Promise<Object>} Created notification
 */
const createNotification = async (params) => {
  try {
    const {
      userId,
      type,
      title,
      message,
      link,
      linkText,
      relatedMediaId,
      relatedPartyId,
      relatedUserId,
      relatedBidId,
      relatedCommentId,
      relatedLabelId,
      relatedCollectiveId,
      inviteType,
      inviteRole,
      groupKey
    } = params;

    if (!userId || !type || !title || !message) {
      throw new Error('Missing required notification parameters');
    }

    // Check if user has this notification type enabled
    // Note: Some notification types are always sent (creator_approved, creator_rejected, 
    // claim_approved, claim_rejected, admin_announcement, warning) and should not be checked
    const alwaysSendTypes = [
      'creator_approved',
      'creator_rejected',
      'claim_approved',
      'claim_rejected',
      'admin_announcement',
      'warning'
    ];

    if (!alwaysSendTypes.includes(type)) {
      const user = await User.findById(userId).select('preferences');
      if (user && user.preferences?.notifications?.types) {
        const notifType = type;
        const isEnabled = user.preferences.notifications.types[notifType];
        if (isEnabled === false) {
          console.log(`Notification ${notifType} disabled for user ${userId}`);
          return null; // Don't create notification if user has disabled it
        }
      }
    }

    // Create notification in database
    const notification = new Notification({
      userId,
      type,
      title,
      message,
      link,
      linkText,
      relatedMediaId,
      relatedPartyId,
      relatedUserId,
      relatedBidId,
      relatedCommentId,
      relatedLabelId,
      relatedCollectiveId,
      inviteType,
      inviteRole,
      groupKey,
      isRead: false
    });

    await notification.save();

    // Populate related fields for Socket.IO emission
    const populated = await Notification.findById(notification._id)
      .populate('relatedMediaId', 'title artist coverArt uuid')
      .populate('relatedPartyId', 'name uuid')
      .populate('relatedUserId', 'username profilePic uuid')
      .populate('relatedLabelId', 'name slug uuid')
      .populate('relatedCollectiveId', 'name slug uuid')
      .lean();

    // Send real-time notification via Socket.IO
    sendNotification(userId.toString(), {
      _id: populated._id,
      uuid: populated.uuid,
      type: populated.type,
      title: populated.title,
      message: populated.message,
      link: populated.link,
      linkText: populated.linkText,
      isRead: populated.isRead,
      createdAt: populated.createdAt,
      relatedMediaId: populated.relatedMediaId,
      relatedPartyId: populated.relatedPartyId,
      relatedUserId: populated.relatedUserId
    });

    // Update unread count
    const unreadCount = await Notification.countDocuments({ userId, isRead: false });
    sendUnreadCount(userId.toString(), unreadCount);

    console.log(`📬 Notification created: ${type} for user ${userId}`);
    return populated;
  } catch (error) {
    console.error('Error creating notification:', error);
    throw error;
  }
};

/**
 * Create bid received notification
 * @param {string} mediaOwnerId - User ID of media owner
 * @param {string} bidderId - User ID of bidder
 * @param {string} mediaId - Media ID
 * @param {string} bidId - Bid ID
 * @param {number} bidAmount - Bid amount
 * @param {string} mediaTitle - Media title
 */
const notifyBidReceived = async (mediaOwnerId, bidderId, mediaId, bidId, bidAmount, mediaTitle) => {
  try {
    const bidder = await User.findById(bidderId).select('username');
    const Media = require('../models/Media');
    const media = await Media.findById(mediaId).select('uuid');
    
    // Use UUID for link if available, otherwise fall back to ObjectId
    const mediaLinkId = media?.uuid || mediaId;
    
    await createNotification({
      userId: mediaOwnerId,
      type: 'bid_received',
      title: 'New Bid Received',
      message: `${bidder?.username || 'Someone'} placed a £${bidAmount.toFixed(2)} bid on "${mediaTitle}"`,
      link: `/tune/${mediaLinkId}`,
      linkText: 'View Media',
      relatedMediaId: mediaId,
      relatedUserId: bidderId,
      relatedBidId: bidId,
      groupKey: `bid_received_${mediaId}`
    });
  } catch (error) {
    console.error('Error creating bid received notification:', error);
  }
};

/**
 * Create outbid notification
 * @param {string} userId - User ID who was outbid
 * @param {string} mediaId - Media ID
 * @param {string} bidId - New top bid ID
 * @param {number} newTopBid - New top bid amount
 * @param {string} mediaTitle - Media title
 */
const notifyOutbid = async (userId, mediaId, bidId, newTopBid, mediaTitle) => {
  try {
    const Media = require('../models/Media');
    const media = await Media.findById(mediaId).select('uuid');
    
    // Use UUID for link if available, otherwise fall back to ObjectId
    const mediaLinkId = media?.uuid || mediaId;
    
    await createNotification({
      userId,
      type: 'bid_outbid',
      title: 'You Were Outbid',
      message: `Someone placed a higher bid (£${newTopBid.toFixed(2)}) on "${mediaTitle}"`,
      link: `/tune/${mediaLinkId}`,
      linkText: 'View Media',
      relatedMediaId: mediaId,
      relatedBidId: bidId,
      groupKey: `bid_outbid_${mediaId}_${userId}`
    });
  } catch (error) {
    console.error('Error creating outbid notification:', error);
  }
};

/**
 * Create comment reply notification
 * @param {string} commentOwnerId - User ID of original comment owner
 * @param {string} replierId - User ID of user who replied
 * @param {string} mediaId - Media ID
 * @param {string} commentId - Original comment ID
 * @param {string} replyId - Reply comment ID
 * @param {string} mediaTitle - Media title
 */
const notifyCommentReply = async (commentOwnerId, replierId, mediaId, commentId, replyId, mediaTitle) => {
  try {
    // Don't notify if user replied to their own comment
    if (commentOwnerId.toString() === replierId.toString()) {
      return;
    }

    const replier = await User.findById(replierId).select('username');
    const Media = require('../models/Media');
    const media = await Media.findById(mediaId).select('uuid');
    
    // Use UUID for link if available, otherwise fall back to ObjectId
    const mediaLinkId = media?.uuid || mediaId;
    
    await createNotification({
      userId: commentOwnerId,
      type: 'comment_reply',
      title: 'New Reply to Your Comment',
      message: `${replier?.username || 'Someone'} replied to your comment on "${mediaTitle}"`,
      link: `/tune/${mediaLinkId}`,
      linkText: 'View Comment',
      relatedMediaId: mediaId,
      relatedUserId: replierId,
      relatedCommentId: replyId,
      groupKey: `comment_reply_${commentId}`
    });
  } catch (error) {
    console.error('Error creating comment reply notification:', error);
  }
};

/**
 * Create creator application notification
 * @param {string} userId - User ID
 * @param {string} status - 'verified' or 'rejected' (matches creatorRoutes.js status values)
 * @param {string} reason - Optional reason for rejection
 */
const notifyCreatorApplication = async (userId, status, reason = null) => {
  try {
    const isApproved = status === 'verified'; // Creator routes use 'verified' not 'approved'
    
    await createNotification({
      userId,
      type: isApproved ? 'creator_approved' : 'creator_rejected',
      title: isApproved ? 'Creator Application Approved!' : 'Creator Application Rejected',
      message: isApproved
        ? 'Congratulations! Your creator application has been approved. You can now upload content.'
        : `Your creator application was rejected.${reason ? ` Reason: ${reason}` : ''}`,
      link: isApproved ? '/creator/upload' : '/creator/register',
      linkText: isApproved ? 'Upload Content' : 'Reapply',
      groupKey: `creator_application_${userId}`
    });
  } catch (error) {
    console.error('Error creating creator application notification:', error);
  }
};

/**
 * Create claim notification
 * @param {string} userId - User ID
 * @param {string} status - 'approved' or 'rejected'
 * @param {string} mediaId - Media ID
 * @param {string} mediaTitle - Media title
 * @param {string} reason - Optional reason for rejection
 */
const notifyClaim = async (userId, status, mediaId, mediaTitle, reason = null) => {
  try {
    const isApproved = status === 'approved';
    const Media = require('../models/Media');
    const media = await Media.findById(mediaId).select('uuid');
    
    // Use UUID for link if available, otherwise fall back to ObjectId
    const mediaLinkId = media?.uuid || mediaId;
    
    await createNotification({
      userId,
      type: isApproved ? 'claim_approved' : 'claim_rejected',
      title: isApproved ? 'Tune Claim Approved!' : 'Tune Claim Rejected',
      message: isApproved
        ? `Your claim for "${mediaTitle}" has been approved. You are now the verified owner.`
        : `Your claim for "${mediaTitle}" was rejected.${reason ? ` Reason: ${reason}` : ''}`,
      link: `/tune/${mediaLinkId}`,
      linkText: 'View Media',
      relatedMediaId: mediaId,
      groupKey: `claim_${status}_${mediaId}_${userId}`
    });
  } catch (error) {
    console.error('Error creating claim notification:', error);
  }
};

/**
 * Create TuneBytes earned notification
 * @param {string} userId - User ID
 * @param {number} amount - TuneBytes amount earned
 * @param {string} reason - Reason for earning (e.g., "discovery", "popularity_growth")
 * @param {string} mediaId - Optional media ID
 * @param {string} mediaTitle - Optional media title
 */
const notifyTuneBytesEarned = async (userId, amount, reason, mediaId = null, mediaTitle = null) => {
  try {
    let message = `You earned ${amount.toFixed(2)} TuneBytes`;
    if (reason === 'discovery') {
      message += mediaTitle ? ` for discovering "${mediaTitle}"` : ' for discovering a tune';
    } else if (reason === 'popularity_growth') {
      message += mediaTitle ? ` as "${mediaTitle}" gained popularity` : ' as a tune gained popularity';
    }

    let link = '/wallet';
    let mediaLinkId = null;
    
    if (mediaId) {
      try {
        const Media = require('../models/Media');
        const media = await Media.findById(mediaId).select('uuid');
        mediaLinkId = media?.uuid || mediaId;
        link = `/tune/${mediaLinkId}`;
      } catch (error) {
        console.error('Error fetching media UUID for TuneBytes notification:', error);
        link = '/wallet';
      }
    }

    await createNotification({
      userId,
      type: 'tune_bytes_earned',
      title: 'TuneBytes Earned!',
      message,
      link,
      linkText: mediaId ? 'View Media' : 'View Wallet',
      relatedMediaId: mediaId,
      groupKey: mediaId ? `tunebytes_${mediaId}_${userId}` : null
    });
  } catch (error) {
    console.error('Error creating TuneBytes earned notification:', error);
  }
};

/**
 * Notify users that media they bid on was vetoed
 * @param {string} userId - User ID who bid on the media
 * @param {string} mediaId - Media ID
 * @param {string} mediaTitle - Media title
 * @param {string} partyId - Party ID
 * @param {string} partyName - Party name
 * @param {number} refundAmount - Amount refunded (in pence)
 * @param {string} reason - Optional veto reason
 */
const notifyMediaVetoed = async (userId, mediaId, mediaTitle, partyId, partyName, refundAmount, reason = null) => {
  try {
    const Media = require('../models/Media');
    const Party = require('../models/Party');
    const media = await Media.findById(mediaId).select('uuid');
    const party = await Party.findById(partyId).select('uuid');
    
    const mediaLinkId = media?.uuid || mediaId;
    const partyLinkId = party?.uuid || partyId;
    
    let message = `"${mediaTitle}" was vetoed from "${partyName}". Your bid of £${(refundAmount / 100).toFixed(2)} has been refunded.`;
    if (reason) {
      message += ` Reason: ${reason}`;
    }
    
    await createNotification({
      userId,
      type: 'media_vetoed',
      title: 'Media Vetoed',
      message,
      link: `/party/${partyLinkId}`,
      linkText: 'View Party',
      relatedMediaId: mediaId,
      relatedPartyId: partyId,
      groupKey: `media_vetoed_${mediaId}_${partyId}_${userId}`
    });
  } catch (error) {
    console.error('Error creating media vetoed notification:', error);
  }
};

/**
 * Notify users that media they bid on was unvetoed
 * @param {string} userId - User ID who bid on the media
 * @param {string} mediaId - Media ID
 * @param {string} mediaTitle - Media title
 * @param {string} partyId - Party ID
 * @param {string} partyName - Party name
 */
const notifyMediaUnvetoed = async (userId, mediaId, mediaTitle, partyId, partyName) => {
  try {
    const Media = require('../models/Media');
    const Party = require('../models/Party');
    const media = await Media.findById(mediaId).select('uuid');
    const party = await Party.findById(partyId).select('uuid');
    
    const mediaLinkId = media?.uuid || mediaId;
    const partyLinkId = party?.uuid || partyId;
    
    await createNotification({
      userId,
      type: 'media_unvetoed',
      title: 'Media Unvetoed',
      message: `"${mediaTitle}" has been unvetoed in "${partyName}". You can bid on it again if you'd like.`,
      link: `/party/${partyLinkId}`,
      linkText: 'View Party',
      relatedMediaId: mediaId,
      relatedPartyId: partyId,
      groupKey: `media_unvetoed_${mediaId}_${partyId}_${userId}`
    });
  } catch (error) {
    console.error('Error creating media unvetoed notification:', error);
  }
};

module.exports = {
  createNotification,
  notifyBidReceived,
  notifyOutbid,
  notifyCommentReply,
  notifyCreatorApplication,
  notifyClaim,
  notifyTuneBytesEarned,
  notifyMediaVetoed,
  notifyMediaUnvetoed
};

