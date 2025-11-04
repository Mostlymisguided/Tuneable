const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Report = require('../models/Report');
const Media = require('../models/Media');
const User = require('../models/User');
const Label = require('../models/Label');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const { sendEmail } = require('../utils/emailService');
const { isValidObjectId } = require('../utils/validators');

// Submit a report for a media item
router.post('/media/:mediaId/report', authMiddleware, async (req, res) => {
  try {
    const { mediaId } = req.params;
    const { category, description, contactEmail } = req.body;
    const userId = req.user._id;

    // Validate required fields
    if (!category || !description) {
      return res.status(400).json({ error: 'Category and description are required' });
    }

    // Validate category (media categories)
    const validCategories = ['copyright', 'incorrect_info', 'incorrect_tags', 'inappropriate', 'duplicate', 'other'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    // Find the media
    const media = await Media.findOne({ 
      $or: [
        { _id: isValidObjectId(mediaId) ? mediaId : null },
        { uuid: mediaId }
      ]
    });

    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }

    // Check if user has already reported this media
    const existingReport = await Report.findOne({
      reportType: 'media',
      mediaId: media._id,
      reportedBy: userId
    });

    if (existingReport) {
      return res.status(400).json({ 
        error: 'You have already reported this tune. Please wait for our review.' 
      });
    }

    // Create the report
    const report = new Report({
      reportType: 'media',
      mediaId: media._id,
      mediaUuid: media.uuid,
      reportedBy: userId,
      category,
      description: description.trim(),
      contactEmail: contactEmail?.trim() || null,
      status: 'pending'
    });

    await report.save();

    // Populate reporter info for email
    await report.populate('reportedBy', 'username email uuid');

    // Send email notification to admin
    try {
      const categoryLabels = {
        copyright: 'Copyright/Rights Issue',
        incorrect_info: 'Incorrect Information',
        incorrect_tags: 'Incorrect Tags',
        inappropriate: 'Inappropriate Content',
        duplicate: 'Duplicate',
        other: 'Other Issue'
      };

      const emailHtml = `
        <h2>New Tune Report Submitted</h2>
        <p><strong>Priority:</strong> ${category === 'copyright' ? '🔴 HIGH' : '🟡 NORMAL'}</p>
        <p><strong>Category:</strong> ${categoryLabels[category]}</p>
        <p><strong>Tune:</strong> ${media.title} by ${Array.isArray(media.artist) ? media.artist[0]?.name : media.artist}</p>
        <p><strong>Tune UUID:</strong> ${media.uuid}</p>
        <p><strong>Reported By:</strong> @${report.reportedBy.username} (${report.reportedBy.uuid})</p>
        ${contactEmail ? `<p><strong>Contact Email:</strong> ${contactEmail}</p>` : ''}
        <p><strong>Description:</strong></p>
        <p style="background: #f5f5f5; padding: 15px; border-radius: 5px;">${description}</p>
        <p><a href="https://tuneable.stream/admin" style="background: #8b5cf6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">Review in Admin Panel</a></p>
      `;

      await sendEmail({
        to: process.env.ADMIN_EMAIL || 'mostlymisguided@icloud.com',
        subject: `${category === 'copyright' ? '🔴 URGENT: ' : ''}Tune Report - ${categoryLabels[category]}`,
        html: emailHtml
      });
    } catch (emailError) {
      console.error('Failed to send report notification email:', emailError);
      // Don't fail the request if email fails
    }

    res.json({ 
      message: 'Report submitted successfully. We will review it shortly.',
      reportId: report._id
    });

  } catch (error) {
    console.error('Error submitting report:', error);
    
    // Handle duplicate report error from unique index
    if (error.code === 11000) {
      return res.status(400).json({ 
        error: 'You have already reported this tune' 
      });
    }
    
    res.status(500).json({ error: 'Failed to submit report' });
  }
});

// Legacy route for backward compatibility (placed after specific routes)
// This will only match if the mediaId is not 'media', 'users', 'labels', or 'admin'
router.post('/:mediaId/report', authMiddleware, async (req, res, next) => {
  const { mediaId } = req.params;
  // Skip if this looks like a route prefix
  if (mediaId === 'media' || mediaId === 'users' || mediaId === 'labels' || mediaId === 'admin') {
    return next();
  }
  
  // Handle legacy media report format
  try {
    const { category, description, contactEmail } = req.body;
    const userId = req.user._id;

    if (!category || !description) {
      return res.status(400).json({ error: 'Category and description are required' });
    }

    const validCategories = ['copyright', 'incorrect_info', 'incorrect_tags', 'inappropriate', 'duplicate', 'other'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    const media = await Media.findOne({ 
      $or: [
        { _id: isValidObjectId(mediaId) ? mediaId : null },
        { uuid: mediaId }
      ]
    });

    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }

    const existingReport = await Report.findOne({
      reportType: 'media',
      mediaId: media._id,
      reportedBy: userId
    });

    if (existingReport) {
      return res.status(400).json({ 
        error: 'You have already reported this tune. Please wait for our review.' 
      });
    }

    const report = new Report({
      reportType: 'media',
      mediaId: media._id,
      mediaUuid: media.uuid,
      reportedBy: userId,
      category,
      description: description.trim(),
      contactEmail: contactEmail?.trim() || null,
      status: 'pending'
    });

    await report.save();
    await report.populate('reportedBy', 'username email uuid');

    try {
      const categoryLabels = {
        copyright: 'Copyright/Rights Issue',
        incorrect_info: 'Incorrect Information',
        incorrect_tags: 'Incorrect Tags',
        inappropriate: 'Inappropriate Content',
        duplicate: 'Duplicate',
        other: 'Other Issue'
      };

      const emailHtml = `
        <h2>New Tune Report Submitted</h2>
        <p><strong>Priority:</strong> ${category === 'copyright' ? '🔴 HIGH' : '🟡 NORMAL'}</p>
        <p><strong>Category:</strong> ${categoryLabels[category]}</p>
        <p><strong>Tune:</strong> ${media.title} by ${Array.isArray(media.artist) ? media.artist[0]?.name : media.artist}</p>
        <p><strong>Tune UUID:</strong> ${media.uuid}</p>
        <p><strong>Reported By:</strong> @${report.reportedBy.username} (${report.reportedBy.uuid})</p>
        ${contactEmail ? `<p><strong>Contact Email:</strong> ${contactEmail}</p>` : ''}
        <p><strong>Description:</strong></p>
        <p style="background: #f5f5f5; padding: 15px; border-radius: 5px;">${description}</p>
        <p><a href="https://tuneable.stream/admin" style="background: #8b5cf6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">Review in Admin Panel</a></p>
      `;

      await sendEmail({
        to: process.env.ADMIN_EMAIL || 'mostlymisguided@icloud.com',
        subject: `${category === 'copyright' ? '🔴 URGENT: ' : ''}Tune Report - ${categoryLabels[category]}`,
        html: emailHtml
      });
    } catch (emailError) {
      console.error('Failed to send report notification email:', emailError);
    }

    res.json({ 
      message: 'Report submitted successfully. We will review it shortly.',
      reportId: report._id
    });
  } catch (error) {
    console.error('Error submitting report:', error);
    if (error.code === 11000) {
      return res.status(400).json({ 
        error: 'You have already reported this tune' 
      });
    }
    res.status(500).json({ error: 'Failed to submit report' });
  }
});

// Submit a report for a user
router.post('/users/:userId/report', authMiddleware, async (req, res) => {
  try {
    const { userId: targetUserId } = req.params;
    const { category, description, contactEmail } = req.body;
    const reporterId = req.user._id;

    // Validate required fields
    if (!category || !description) {
      return res.status(400).json({ error: 'Category and description are required' });
    }

    // Validate category (user categories)
    const validCategories = ['harassment', 'spam', 'impersonation', 'inappropriate', 'copyright', 'other'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    // Find the target user
    const targetUser = await User.findOne({
      $or: [
        { _id: isValidObjectId(targetUserId) ? targetUserId : null },
        { uuid: targetUserId }
      ]
    });

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent self-reporting
    if (targetUser._id.toString() === reporterId.toString()) {
      return res.status(400).json({ error: 'You cannot report yourself' });
    }

    // Check if user has already reported this user
    const existingReport = await Report.findOne({
      reportType: 'user',
      userId: targetUser._id,
      reportedBy: reporterId
    });

    if (existingReport) {
      return res.status(400).json({ 
        error: 'You have already reported this user. Please wait for our review.' 
      });
    }

    // Create the report
    const report = new Report({
      reportType: 'user',
      userId: targetUser._id,
      userUuid: targetUser.uuid,
      reportedBy: reporterId,
      category,
      description: description.trim(),
      contactEmail: contactEmail?.trim() || null,
      status: 'pending'
    });

    await report.save();

    // Populate reporter info for email
    await report.populate('reportedBy', 'username email uuid');

    // Send email notification to admin
    try {
      const categoryLabels = {
        harassment: 'Harassment/Bullying',
        spam: 'Spam/Scam',
        impersonation: 'Impersonation',
        inappropriate: 'Inappropriate Content/Behavior',
        copyright: 'Copyright Infringement',
        other: 'Other Issue'
      };

      const emailHtml = `
        <h2>New User Report Submitted</h2>
        <p><strong>Priority:</strong> ${category === 'harassment' || category === 'impersonation' ? '🔴 HIGH' : '🟡 NORMAL'}</p>
        <p><strong>Category:</strong> ${categoryLabels[category]}</p>
        <p><strong>Reported User:</strong> @${targetUser.username} (${targetUser.uuid})</p>
        <p><strong>Reported By:</strong> @${report.reportedBy.username} (${report.reportedBy.uuid})</p>
        ${contactEmail ? `<p><strong>Contact Email:</strong> ${contactEmail}</p>` : ''}
        <p><strong>Description:</strong></p>
        <p style="background: #f5f5f5; padding: 15px; border-radius: 5px;">${description}</p>
        <p><a href="https://tuneable.stream/admin" style="background: #8b5cf6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">Review in Admin Panel</a></p>
      `;

      await sendEmail({
        to: process.env.ADMIN_EMAIL || 'mostlymisguided@icloud.com',
        subject: `${category === 'harassment' || category === 'impersonation' ? '🔴 URGENT: ' : ''}User Report - ${categoryLabels[category]}`,
        html: emailHtml
      });
    } catch (emailError) {
      console.error('Failed to send report notification email:', emailError);
      // Don't fail the request if email fails
    }

    res.json({ 
      message: 'Report submitted successfully. We will review it shortly.',
      reportId: report._id
    });

  } catch (error) {
    console.error('Error submitting report:', error);
    
    // Handle duplicate report error from unique index
    if (error.code === 11000) {
      return res.status(400).json({ 
        error: 'You have already reported this user' 
      });
    }
    
    res.status(500).json({ error: 'Failed to submit report' });
  }
});

// Submit a report for a label
router.post('/labels/:labelId/report', authMiddleware, async (req, res) => {
  try {
    const { labelId: targetLabelId } = req.params;
    const { category, description, contactEmail } = req.body;
    const reporterId = req.user._id;

    // Validate required fields
    if (!category || !description) {
      return res.status(400).json({ error: 'Category and description are required' });
    }

    // Validate category (label categories)
    const validCategories = ['label_impersonation', 'label_incorrect_info', 'label_spam', 'inappropriate', 'other'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    // Find the target label
    const targetLabel = await Label.findOne({
      $or: [
        { _id: isValidObjectId(targetLabelId) ? targetLabelId : null },
        { slug: targetLabelId },
        { uuid: targetLabelId }
      ]
    });

    if (!targetLabel) {
      return res.status(404).json({ error: 'Label not found' });
    }

    // Check if user has already reported this label
    const existingReport = await Report.findOne({
      reportType: 'label',
      labelId: targetLabel._id,
      reportedBy: reporterId
    });

    if (existingReport) {
      return res.status(400).json({ 
        error: 'You have already reported this label. Please wait for our review.' 
      });
    }

    // Create the report
    const report = new Report({
      reportType: 'label',
      labelId: targetLabel._id,
      labelUuid: targetLabel.uuid || targetLabel.slug,
      reportedBy: reporterId,
      category,
      description: description.trim(),
      contactEmail: contactEmail?.trim() || null,
      status: 'pending'
    });

    await report.save();

    // Populate reporter info for email
    await report.populate('reportedBy', 'username email uuid');

    // Send email notification to admin
    try {
      const categoryLabels = {
        label_impersonation: 'Impersonation',
        label_incorrect_info: 'Incorrect Information',
        label_spam: 'Spam',
        inappropriate: 'Inappropriate Content',
        other: 'Other Issue'
      };

      const emailHtml = `
        <h2>New Label Report Submitted</h2>
        <p><strong>Priority:</strong> ${category === 'label_impersonation' ? '🔴 HIGH' : '🟡 NORMAL'}</p>
        <p><strong>Category:</strong> ${categoryLabels[category]}</p>
        <p><strong>Reported Label:</strong> ${targetLabel.name} (${targetLabel.slug || targetLabel.uuid})</p>
        <p><strong>Reported By:</strong> @${report.reportedBy.username} (${report.reportedBy.uuid})</p>
        ${contactEmail ? `<p><strong>Contact Email:</strong> ${contactEmail}</p>` : ''}
        <p><strong>Description:</strong></p>
        <p style="background: #f5f5f5; padding: 15px; border-radius: 5px;">${description}</p>
        <p><a href="https://tuneable.stream/admin" style="background: #8b5cf6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">Review in Admin Panel</a></p>
      `;

      await sendEmail({
        to: process.env.ADMIN_EMAIL || 'mostlymisguided@icloud.com',
        subject: `${category === 'label_impersonation' ? '🔴 URGENT: ' : ''}Label Report - ${categoryLabels[category]}`,
        html: emailHtml
      });
    } catch (emailError) {
      console.error('Failed to send report notification email:', emailError);
      // Don't fail the request if email fails
    }

    res.json({ 
      message: 'Report submitted successfully. We will review it shortly.',
      reportId: report._id
    });

  } catch (error) {
    console.error('Error submitting report:', error);
    
    // Handle duplicate report error from unique index
    if (error.code === 11000) {
      return res.status(400).json({ 
        error: 'You have already reported this label' 
      });
    }
    
    res.status(500).json({ error: 'Failed to submit report' });
  }
});

// Get all reports (admin only)
router.get('/admin/reports', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status, category, reportType, limit = 50, skip = 0 } = req.query;

    const query = {};
    if (status) query.status = status;
    if (category) query.category = category;
    if (reportType) query.reportType = reportType; // Filter by report type

    const reports = await Report.find(query)
      .populate('reportedBy', 'username email uuid profilePic')
      .populate('mediaId', 'title artist uuid coverArt')
      .populate('userId', 'username uuid profilePic')
      .populate('labelId', 'name slug uuid logo')
      .populate('resolvedBy', 'username')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));

    const total = await Report.countDocuments(query);

    res.json({ reports, total });
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// Update report status (admin only)
router.patch('/admin/reports/:reportId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { reportId } = req.params;
    const { status, adminNotes } = req.body;
    const adminId = req.user._id;

    const validStatuses = ['pending', 'in_review', 'resolved', 'dismissed'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const updateData = {};
    if (status) updateData.status = status;
    if (adminNotes !== undefined) updateData.adminNotes = adminNotes;
    
    if (status === 'resolved' || status === 'dismissed') {
      updateData.resolvedBy = adminId;
      updateData.resolvedAt = new Date();
    }

    const report = await Report.findByIdAndUpdate(
      reportId,
      updateData,
      { new: true }
    ).populate('reportedBy', 'username email')
     .populate('mediaId', 'title artist')
     .populate('userId', 'username')
     .populate('labelId', 'name');

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    // Send email to reporter when resolved
    if ((status === 'resolved' || status === 'dismissed') && report.reportedBy?.email) {
      try {
        // Determine target name based on report type
        let targetName = 'Unknown';
        if (report.reportType === 'media' && report.mediaId) {
          targetName = report.mediaId.title || 'a tune';
        } else if (report.reportType === 'user' && report.userId) {
          targetName = `@${report.userId.username}` || 'a user';
        } else if (report.reportType === 'label' && report.labelId) {
          targetName = report.labelId.name || 'a label';
        }

        const emailHtml = `
          <h2>Report Update</h2>
          <p>Your report for "${targetName}" has been ${status}.</p>
          ${adminNotes ? `<p><strong>Note from team:</strong> ${adminNotes}</p>` : ''}
          <p>Thank you for helping us maintain quality on Tuneable.</p>
        `;

        await sendEmail({
          to: report.reportedBy.email,
          subject: `Report ${status === 'resolved' ? 'Resolved' : 'Updated'} - Tuneable`,
          html: emailHtml
        });
      } catch (emailError) {
        console.error('Failed to send report update email:', emailError);
      }
    }

    res.json({ report, message: 'Report updated successfully' });
  } catch (error) {
    console.error('Error updating report:', error);
    res.status(500).json({ error: 'Failed to update report' });
  }
});

module.exports = router;

