const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Report = require('../models/Report');
const Media = require('../models/Media');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/authMiddleware');
const { adminMiddleware } = require('../middleware/adminMiddleware');
const { sendEmail } = require('../services/emailService');

// Submit a report for a media item
router.post('/:mediaId/report', authMiddleware, async (req, res) => {
  try {
    const { mediaId } = req.params;
    const { category, description, contactEmail } = req.body;
    const userId = req.user._id;

    // Validate required fields
    if (!category || !description) {
      return res.status(400).json({ error: 'Category and description are required' });
    }

    // Validate category
    const validCategories = ['copyright', 'incorrect_info', 'incorrect_tags', 'inappropriate', 'duplicate', 'other'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    // Find the media
    const media = await Media.findOne({ 
      $or: [
        { _id: mongoose.Types.ObjectId.isValid(mediaId) ? mediaId : null },
        { uuid: mediaId }
      ]
    });

    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }

    // Check if user has already reported this media
    const existingReport = await Report.findOne({
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

// Get all reports (admin only)
router.get('/admin/reports', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status, category, limit = 50, skip = 0 } = req.query;

    const query = {};
    if (status) query.status = status;
    if (category) query.category = category;

    const reports = await Report.find(query)
      .populate('reportedBy', 'username email uuid profilePic')
      .populate('mediaId', 'title artist uuid coverArt')
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
     .populate('mediaId', 'title artist');

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    // Send email to reporter when resolved
    if ((status === 'resolved' || status === 'dismissed') && report.reportedBy?.email) {
      try {
        const emailHtml = `
          <h2>Report Update</h2>
          <p>Your report for "${report.mediaId.title}" has been ${status}.</p>
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

