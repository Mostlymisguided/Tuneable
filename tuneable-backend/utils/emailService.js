const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = process.env.EMAIL_FROM || 'onboarding@resend.dev'; // Use onboarding@resend.dev for testing, then notifications@tuneable.stream after domain verification
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'mostlymisguided@icloud.com';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Send creator application notification
async function sendCreatorApplicationNotification(user) {
  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: ADMIN_EMAIL,
      subject: `🎵 New Creator Application: ${user.creatorProfile.artistName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #9333ea;">🎵 New Creator Application Received</h2>
          
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #1f2937;">Artist Information</h3>
            <p><strong>Artist Name:</strong> ${user.creatorProfile.artistName}</p>
            <p><strong>Username:</strong> @${user.username}</p>
            <p><strong>Email:</strong> ${user.email}</p>
            <p><strong>Applied:</strong> ${new Date(user.createdAt).toLocaleString()}</p>
          </div>

          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #1f2937;">Bio</h3>
            <p style="white-space: pre-wrap;">${user.creatorProfile.bio}</p>
          </div>

          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #1f2937;">Details</h3>
            <p><strong>Roles:</strong> ${user.creatorProfile.roles?.join(', ') || 'Not specified'}</p>
            <p><strong>Genres:</strong> ${user.creatorProfile.genres?.join(', ') || 'Not specified'}</p>
            ${user.creatorProfile.label ? `<p><strong>Label:</strong> ${user.creatorProfile.label}</p>` : ''}
            ${user.creatorProfile.management ? `<p><strong>Management:</strong> ${user.creatorProfile.management}</p>` : ''}
            ${user.creatorProfile.distributor ? `<p><strong>Distributor:</strong> ${user.creatorProfile.distributor}</p>` : ''}
            ${user.creatorProfile.proofFiles?.length ? `<p><strong>Proof Files:</strong> ${user.creatorProfile.proofFiles.length} document(s) uploaded</p>` : ''}
          </div>

          ${user.socialMedia && Object.values(user.socialMedia).some(v => v) ? `
            <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #1f2937;">Social Media</h3>
              ${Object.entries(user.socialMedia)
                .filter(([_, url]) => url)
                .map(([platform, url]) => `<p><strong>${platform}:</strong> <a href="${url}">${url}</a></p>`)
                .join('')}
            </div>
          ` : ''}

          <div style="margin: 30px 0; text-align: center;">
            <a href="${FRONTEND_URL}/admin" 
               style="background: #9333ea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
              Review Application in Admin Panel
            </a>
          </div>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="color: #6b7280; font-size: 12px;">
            This is an automated notification from Tuneable. 
            To manage your notifications, visit the admin panel.
          </p>
        </div>
      `
    });

    if (error) {
      console.error('❌ Error sending creator application email:', error);
      return false;
    }

    console.log('✅ Creator application notification sent:', data.id);
    return true;
  } catch (error) {
    console.error('❌ Error sending creator application email:', error.message);
    return false;
  }
}

// Send claim submission notification
async function sendClaimNotification(claim, media, user) {
  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: ADMIN_EMAIL,
      subject: `🎵 New Tune Claim: ${media.title}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #9333ea;">🎵 New Tune Claim Submitted</h2>
          
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #1f2937;">Tune Information</h3>
            ${media.coverArt ? `<img src="${media.coverArt}" alt="${media.title}" style="width: 100px; height: 100px; border-radius: 8px; object-fit: cover;">` : ''}
            <p><strong>Title:</strong> ${media.title}</p>
            <p><strong>Artist:</strong> ${media.artist?.[0]?.name || media.artist || 'Unknown'}</p>
            ${media.album ? `<p><strong>Album:</strong> ${media.album}</p>` : ''}
            ${media.releaseDate ? `<p><strong>Release Date:</strong> ${new Date(media.releaseDate).toLocaleDateString()}</p>` : ''}
          </div>

          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #1f2937;">Claimant Information</h3>
            <p><strong>Username:</strong> @${user.username}</p>
            <p><strong>Email:</strong> ${user.email || 'Not provided'}</p>
            <p><strong>Submitted:</strong> ${new Date(claim.submittedAt).toLocaleString()}</p>
            ${user.creatorProfile?.artistName ? `<p><strong>Artist Name:</strong> ${user.creatorProfile.artistName}</p>` : ''}
            ${user.creatorProfile?.verificationStatus ? `<p><strong>Creator Status:</strong> ${user.creatorProfile.verificationStatus}</p>` : ''}
          </div>

          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #1f2937;">Proof Provided</h3>
            <p style="white-space: pre-wrap;">${claim.proofText}</p>
            ${claim.proofFiles?.length ? `<p><strong>Documents:</strong> ${claim.proofFiles.length} file(s) uploaded</p>` : ''}
          </div>

          <div style="margin: 30px 0; text-align: center;">
            <a href="${FRONTEND_URL}/admin" 
               style="background: #9333ea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
              Review Claim in Admin Panel
            </a>
          </div>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="color: #6b7280; font-size: 12px;">
            This is an automated notification from Tuneable. 
            To manage your notifications, visit the admin panel.
          </p>
        </div>
      `
    });

    if (error) {
      console.error('❌ Error sending claim email:', error);
      return false;
    }

    console.log('✅ Claim notification sent:', data.id);
    return true;
  } catch (error) {
    console.error('❌ Error sending claim email:', error.message);
    return false;
  }
}

// Send user registration notification
async function sendUserRegistrationNotification(user) {
  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: ADMIN_EMAIL,
      subject: `👋 New User Registration: ${user.username}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #9333ea;">👋 New User Registered</h2>
          
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #1f2937;">User Information</h3>
            ${user.profilePic ? `<img src="${user.profilePic}" alt="${user.username}" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; margin-bottom: 10px;">` : ''}
            <p><strong>Username:</strong> @${user.username}</p>
            <p><strong>Email:</strong> ${user.email || 'Not provided'}</p>
            <p><strong>Name:</strong> ${user.givenName || ''} ${user.familyName || ''}</p>
            <p><strong>Phone:</strong> ${user.cellPhone || 'Not provided'}</p>
            <p><strong>Location:</strong> ${user.homeLocation?.city || ''}, ${user.homeLocation?.country || 'Unknown'}</p>
            <p><strong>Invite Code:</strong> ${user.personalInviteCode}</p>
            <p><strong>Joined:</strong> ${new Date(user.createdAt).toLocaleString()}</p>
          </div>

          <div style="margin: 30px 0; text-align: center;">
            <a href="${FRONTEND_URL}/admin" 
               style="background: #9333ea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
              View in Admin Panel
            </a>
          </div>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="color: #6b7280; font-size: 12px;">
            This is an automated notification from Tuneable.
          </p>
        </div>
      `
    });

    if (error) {
      console.error('❌ Error sending registration email:', error);
      return false;
    }

    console.log('✅ User registration notification sent:', data.id);
    return true;
  } catch (error) {
    console.error('❌ Error sending registration email:', error.message);
    return false;
  }
}

// Send party creation notification
async function sendPartyCreationNotification(party, host) {
  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: ADMIN_EMAIL,
      subject: `🎉 New Party Created: ${party.name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #9333ea;">🎉 New Party Created</h2>
          
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #1f2937;">Party Details</h3>
            <p><strong>Name:</strong> ${party.name}</p>
            <p><strong>Location:</strong> ${party.location}</p>
            <p><strong>Type:</strong> ${party.type}</p>
            <p><strong>Privacy:</strong> ${party.privacy}</p>
            <p><strong>Status:</strong> ${party.status}</p>
            <p><strong>Party Code:</strong> ${party.partyCode}</p>
            <p><strong>Start Time:</strong> ${new Date(party.startTime).toLocaleString()}</p>
            ${party.endTime ? `<p><strong>End Time:</strong> ${new Date(party.endTime).toLocaleString()}</p>` : ''}
            <p><strong>Watershed:</strong> ${party.watershed ? 'Yes' : 'No'}</p>
          </div>

          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #1f2937;">Host Information</h3>
            <p><strong>Username:</strong> @${host.username}</p>
            <p><strong>Email:</strong> ${host.email || 'Not provided'}</p>
          </div>

          <div style="margin: 30px 0; text-align: center;">
            <a href="${FRONTEND_URL}/party/${party._id}" 
               style="background: #9333ea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
              View Party
            </a>
          </div>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="color: #6b7280; font-size: 12px;">
            This is an automated notification from Tuneable.
          </p>
        </div>
      `
    });

    if (error) {
      console.error('❌ Error sending party creation email:', error);
      return false;
    }

    console.log('✅ Party creation notification sent:', data.id);
    return true;
  } catch (error) {
    console.error('❌ Error sending party creation email:', error.message);
    return false;
  }
}

// Send payment notification
async function sendPaymentNotification(user, amount, currency = 'gbp') {
  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: ADMIN_EMAIL,
      subject: `💰 Payment Received: £${amount.toFixed(2)}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #9333ea;">💰 Payment Received</h2>
          
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #1f2937;">Payment Details</h3>
            <p><strong>Amount:</strong> £${amount.toFixed(2)} ${currency.toUpperCase()}</p>
            <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
          </div>

          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #1f2937;">User Information</h3>
            <p><strong>Username:</strong> @${user.username}</p>
            <p><strong>Email:</strong> ${user.email || 'Not provided'}</p>
            <p><strong>New Balance:</strong> £${user.balance.toFixed(2)}</p>
          </div>

          <div style="margin: 30px 0; text-align: center;">
            <a href="${FRONTEND_URL}/admin" 
               style="background: #9333ea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
              View in Admin Panel
            </a>
          </div>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="color: #6b7280; font-size: 12px;">
            This is an automated notification from Tuneable.
          </p>
        </div>
      `
    });

    if (error) {
      console.error('❌ Error sending payment email:', error);
      return false;
    }

    console.log('✅ Payment notification sent:', data.id);
    return true;
  } catch (error) {
    console.error('❌ Error sending payment email:', error.message);
    return false;
  }
}

// Send high-value bid notification
async function sendHighValueBidNotification(bid, media, user, threshold = 10) {
  if (bid.amount < threshold) return false; // Only send for high-value bids

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: ADMIN_EMAIL,
      subject: `🔥 High-Value Bid: £${bid.amount.toFixed(2)} on ${media.title}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #9333ea;">🔥 High-Value Bid Placed</h2>
          
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #1f2937;">Bid Details</h3>
            <p><strong>Amount:</strong> £${bid.amount.toFixed(2)}</p>
            <p><strong>Placed:</strong> ${new Date(bid.createdAt).toLocaleString()}</p>
          </div>

          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #1f2937;">Tune Information</h3>
            ${media.coverArt ? `<img src="${media.coverArt}" alt="${media.title}" style="width: 100px; height: 100px; border-radius: 8px; object-fit: cover; margin-bottom: 10px;">` : ''}
            <p><strong>Title:</strong> ${media.title}</p>
            <p><strong>Artist:</strong> ${media.artist?.[0]?.name || media.artist || 'Unknown'}</p>
          </div>

          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #1f2937;">User Information</h3>
            <p><strong>Username:</strong> @${user.username}</p>
            <p><strong>Email:</strong> ${user.email || 'Not provided'}</p>
          </div>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="color: #6b7280; font-size: 12px;">
            This is an automated notification from Tuneable. 
            High-value bid threshold: £${threshold}
          </p>
        </div>
      `
    });

    if (error) {
      console.error('❌ Error sending high-value bid email:', error);
      return false;
    }

    console.log('✅ High-value bid notification sent:', data.id);
    return true;
  } catch (error) {
    console.error('❌ Error sending high-value bid email:', error.message);
    return false;
  }
}

// Send email verification to user
async function sendEmailVerification(user, verificationToken) {
  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: user.email,
      subject: '🎵 Verify Your Tuneable Account',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #9333ea;">🎵 Welcome to Tuneable!</h2>
          
          <p>Hi ${user.username},</p>
          
          <p>Thanks for joining Tuneable! To complete your account setup, please verify your email address.</p>
          
          <div style="margin: 30px 0; text-align: center;">
            <a href="${FRONTEND_URL}/verify-email?token=${verificationToken}" 
               style="background: #9333ea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
              Verify Email Address
            </a>
          </div>
          
          <p>If the button doesn't work, copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #6b7280; font-size: 12px;">
            ${FRONTEND_URL}/verify-email?token=${verificationToken}
          </p>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="color: #6b7280; font-size: 12px;">
            This verification link will expire in 24 hours. If you didn't create a Tuneable account, you can safely ignore this email.
          </p>
        </div>
      `
    });

    if (error) {
      console.error('❌ Error sending verification email:', error);
      return false;
    }

    console.log('✅ Email verification sent:', data.id);
    return true;
  } catch (error) {
    console.error('❌ Error sending verification email:', error.message);
    return false;
  }
}

// Send password reset email
async function sendPasswordReset(user, resetToken) {
  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: user.email,
      subject: '🔐 Reset Your Tuneable Password',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #9333ea;">🔐 Password Reset Request</h2>
          
          <p>Hi ${user.username},</p>
          
          <p>We received a request to reset your Tuneable password. Click the button below to create a new password:</p>
          
          <div style="margin: 30px 0; text-align: center;">
            <a href="${FRONTEND_URL}/reset-password?token=${resetToken}" 
               style="background: #9333ea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
              Reset Password
            </a>
          </div>
          
          <p>If the button doesn't work, copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #6b7280; font-size: 12px;">
            ${FRONTEND_URL}/reset-password?token=${resetToken}
          </p>
          
          <p><strong>This link will expire in 1 hour for security reasons.</strong></p>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="color: #6b7280; font-size: 12px;">
            If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.
          </p>
        </div>
      `
    });

    if (error) {
      console.error('❌ Error sending password reset email:', error);
      return false;
    }

    console.log('✅ Password reset email sent:', data.id);
    return true;
  } catch (error) {
    console.error('❌ Error sending password reset email:', error.message);
    return false;
  }
}

// Send welcome email to new users
async function sendWelcomeEmail(user) {
  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: user.email,
      subject: '🎉 Welcome to Tuneable!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #9333ea;">🎉 Welcome to Tuneable!</h2>
          
          <p>Hi ${user.username},</p>
          
          <p>Welcome to Tuneable! You're now part of the community where music lovers discover, share, and bid on amazing tunes.</p>
          
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #1f2937;">Get Started</h3>
            <ul style="margin: 0; padding-left: 20px;">
              <li>🎵 <strong>Discover Music:</strong> Browse trending tunes and find your next favorite song</li>
              <li>🎉 <strong>Join Parties:</strong> Create or join music parties with friends</li>
              <li>💰 <strong>Bid on Tunes:</strong> Place bids on songs you love during parties</li>
              <li>👤 <strong>Build Your Profile:</strong> Add your music preferences and social links</li>
            </ul>
          </div>
          
          <div style="margin: 30px 0; text-align: center;">
            <a href="${FRONTEND_URL}/dashboard" 
               style="background: #9333ea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
              Go to Dashboard
            </a>
          </div>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="color: #6b7280; font-size: 12px;">
            Thanks for joining Tuneable! If you have any questions, feel free to reach out to our support team.
          </p>
        </div>
      `
    });

    if (error) {
      console.error('❌ Error sending welcome email:', error);
      return false;
    }

    console.log('✅ Welcome email sent:', data.id);
    return true;
  } catch (error) {
    console.error('❌ Error sending welcome email:', error.message);
    return false;
  }
}

// Send ownership notification email
async function sendOwnershipNotification(user, media, ownershipPercentage, addedBy) {
  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: user.email,
      subject: `🎵 You've been added as ${ownershipPercentage}% owner of "${media.title}"`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #9333ea;">🎵 New Media Ownership</h2>
          
          <p>Hi ${user.username},</p>
          
          <p>You've been added as a <strong>${ownershipPercentage}% owner</strong> of the following tune:</p>
          
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #1f2937;">Tune Details</h3>
            ${media.coverArt ? `<img src="${media.coverArt}" alt="${media.title}" style="width: 100px; height: 100px; border-radius: 8px; object-fit: cover; margin-bottom: 10px;">` : ''}
            <p><strong>Title:</strong> ${media.title}</p>
            <p><strong>Artist:</strong> ${media.artist?.[0]?.name || media.artist || 'Unknown'}</p>
            ${media.album ? `<p><strong>Album:</strong> ${media.album}</p>` : ''}
            <p><strong>Your Ownership:</strong> ${ownershipPercentage}%</p>
            <p><strong>Added by:</strong> ${addedBy.username}</p>
          </div>
          
          <div style="background: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #0369a1;">What This Means</h3>
            <ul style="margin: 0; padding-left: 20px;">
              <li>You can now edit this tune's information</li>
              <li>You'll receive ${ownershipPercentage}% of any revenue generated</li>
              <li>You can manage other owners and their percentages</li>
              <li>You'll be notified of any changes to this tune</li>
            </ul>
          </div>
          
          <div style="margin: 30px 0; text-align: center;">
            <a href="${FRONTEND_URL}/media/${media._id}" 
               style="background: #9333ea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
              View Tune
            </a>
          </div>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="color: #6b7280; font-size: 12px;">
            This is an automated notification from Tuneable. You can manage your media ownership in your dashboard.
          </p>
        </div>
      `
    });

    if (error) {
      console.error('❌ Error sending ownership notification:', error);
      return false;
    }

    console.log('✅ Ownership notification sent:', data.id);
    return true;
  } catch (error) {
    console.error('❌ Error sending ownership notification:', error.message);
    return false;
  }
}

// Send claim approval/rejection notification
async function sendClaimStatusNotification(user, claim, media, status, adminMessage = '') {
  try {
    const isApproved = status === 'approved';
    const subject = isApproved 
      ? `✅ Tune Claim Approved: "${media.title}"`
      : `❌ Tune Claim Rejected: "${media.title}"`;
    
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: user.email,
      subject: subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: ${isApproved ? '#10b981' : '#ef4444'};">
            ${isApproved ? '✅' : '❌'} Tune Claim ${isApproved ? 'Approved' : 'Rejected'}
          </h2>
          
          <p>Hi ${user.username},</p>
          
          <p>Your claim for the tune <strong>"${media.title}"</strong> has been <strong>${status}</strong>.</p>
          
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #1f2937;">Tune Details</h3>
            ${media.coverArt ? `<img src="${media.coverArt}" alt="${media.title}" style="width: 100px; height: 100px; border-radius: 8px; object-fit: cover; margin-bottom: 10px;">` : ''}
            <p><strong>Title:</strong> ${media.title}</p>
            <p><strong>Artist:</strong> ${media.artist?.[0]?.name || media.artist || 'Unknown'}</p>
            <p><strong>Claimed:</strong> ${new Date(claim.submittedAt).toLocaleDateString()}</p>
            <p><strong>Status:</strong> ${status.charAt(0).toUpperCase() + status.slice(1)}</p>
          </div>
          
          ${isApproved ? `
            <div style="background: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
              <h3 style="margin-top: 0; color: #059669;">🎉 Congratulations!</h3>
              <p>You are now a verified owner of this tune and can:</p>
              <ul style="margin: 0; padding-left: 20px;">
                <li>Edit tune information and metadata</li>
                <li>Manage other owners and their percentages</li>
                <li>Receive revenue from this tune</li>
                <li>Control how this tune is used on the platform</li>
              </ul>
            </div>
          ` : `
            <div style="background: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ef4444;">
              <h3 style="margin-top: 0; color: #dc2626;">Claim Not Approved</h3>
              <p>Unfortunately, we couldn't verify your ownership of this tune. This could be because:</p>
              <ul style="margin: 0; padding-left: 20px;">
                <li>Insufficient proof of ownership provided</li>
                <li>Another user already has verified ownership</li>
                <li>The tune information doesn't match your claim</li>
              </ul>
              ${adminMessage ? `<p><strong>Admin Note:</strong> ${adminMessage}</p>` : ''}
            </div>
          `}
          
          <div style="margin: 30px 0; text-align: center;">
            <a href="${FRONTEND_URL}/media/${media._id}" 
               style="background: #9333ea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
              View Tune
            </a>
          </div>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="color: #6b7280; font-size: 12px;">
            This is an automated notification from Tuneable. If you have questions about this decision, please contact our support team.
          </p>
        </div>
      `
    });

    if (error) {
      console.error('❌ Error sending claim status notification:', error);
      return false;
    }

    console.log(`✅ Claim ${status} notification sent:`, data.id);
    return true;
  } catch (error) {
    console.error('❌ Error sending claim status notification:', error.message);
    return false;
  }
}

// Send invite request approval email
async function sendInviteApprovalEmail(request, inviteCode) {
  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: request.email,
      subject: '🎵 Welcome to Tuneable - Your Invite Code',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #9333ea;">🎵 Your Invite to Tuneable Has Been Approved!</h2>
          
          <p>Hi ${request.name},</p>
          
          <p>Great news! Your request to join Tuneable has been approved. We're excited to have you as part of our community!</p>
          
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
            <h3 style="margin-top: 0; color: #1f2937;">Your Invite Code</h3>
            <div style="background: white; padding: 20px; border-radius: 8px; display: inline-block; border: 2px solid #9333ea;">
              <span style="font-size: 32px; font-weight: bold; color: #9333ea; font-family: monospace; letter-spacing: 5px;">${inviteCode}</span>
            </div>
          </div>
          
          <div style="margin: 30px 0; text-align: center;">
            <a href="${FRONTEND_URL}/register?invite=${inviteCode}" 
               style="background: #9333ea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block; font-size: 16px; font-weight: bold;">
              Create Your Account
            </a>
          </div>
          
          <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; color: #856404;"><strong>Important:</strong> This invite code is single-use. Please use it within 30 days.</p>
          </div>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="color: #6b7280; font-size: 12px;">
            This is an automated email from Tuneable. If you have any questions, feel free to reach out to our support team.
          </p>
        </div>
      `
    });

    if (error) {
      console.error('❌ Error sending invite approval email:', error);
      return false;
    }

    console.log('✅ Invite approval email sent:', data.id);
    return true;
  } catch (error) {
    console.error('❌ Error sending invite approval email:', error.message);
    return false;
  }
}

// Send invite request rejection email
async function sendInviteRejectionEmail(request, reason) {
  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: request.email,
      subject: 'Update on Your Tuneable Invite Request',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #9333ea;">Thank You for Your Interest in Tuneable</h2>
          
          <p>Hi ${request.name},</p>
          
          <p>Thank you for your interest in joining Tuneable. We've reviewed your request, and unfortunately we're unable to provide you with an invite at this time.</p>
          
          ${reason ? `
            <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #1f2937;">Feedback</h3>
              <p style="white-space: pre-wrap; color: #4b5563;">${reason}</p>
            </div>
          ` : ''}
          
          <p>We appreciate your understanding. If you'd like to request an invite again in the future, please feel free to submit a new request through our website.</p>
          
          <div style="margin: 30px 0; text-align: center;">
            <a href="${FRONTEND_URL}/request-invite" 
               style="background: #9333ea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
              Submit New Request
            </a>
          </div>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="color: #6b7280; font-size: 12px;">
            This is an automated email from Tuneable. If you have any questions, feel free to reach out to our support team.
          </p>
        </div>
      `
    });

    if (error) {
      console.error('❌ Error sending invite rejection email:', error);
      return false;
    }

    console.log('✅ Invite rejection email sent:', data.id);
    return true;
  } catch (error) {
    console.error('❌ Error sending invite rejection email:', error.message);
    return false;
  }
}

// Send invite email to recipients
async function sendInviteEmail(recipientEmail, inviterUsername, inviteCode, inviteLink) {
  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: recipientEmail,
      subject: `${inviterUsername} invited you to join Tuneable`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #9333ea;">🎵 You've been invited to Tuneable!</h2>
          
          <p>Hi there,</p>
          
          <p><strong>${inviterUsername}</strong> has invited you to join Tuneable, the social music platform for bidding on beats.</p>
          
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #1f2937;">What is Tuneable?</h3>
            <p style="color: #4b5563; margin-bottom: 0;">
              Tuneable is a platform where you can discover new music, bid on beats, and connect with artists and music lovers. Join the community and start exploring amazing tracks!
            </p>
          </div>
          
          <div style="margin: 30px 0; text-align: center;">
            <a href="${inviteLink}" 
               style="background: #9333ea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold;">
              Join Tuneable Now
            </a>
          </div>
          
          <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
            <strong>Your invite code:</strong> <span style="font-family: monospace; background: #f3f4f6; padding: 4px 8px; border-radius: 4px;">${inviteCode}</span>
          </p>
          
          <p style="color: #6b7280; font-size: 14px;">
            The invite code will be automatically filled when you click the button above, or you can enter it manually when you sign up.
          </p>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          <p style="color: #6b7280; font-size: 12px;">
            This invite was sent by ${inviterUsername}. If you didn't expect this invitation, you can safely ignore this email.
          </p>
        </div>
      `
    });

    if (error) {
      console.error('❌ Error sending invite email:', error);
      return false;
    }

    console.log('✅ Invite email sent:', data.id);
    return true;
  } catch (error) {
    console.error('❌ Error sending invite email:', error.message);
    return false;
  }
}

module.exports = {
  sendCreatorApplicationNotification,
  sendClaimNotification,
  sendUserRegistrationNotification,
  sendPartyCreationNotification,
  sendPaymentNotification,
  sendHighValueBidNotification,
  sendEmailVerification,
  sendPasswordReset,
  sendWelcomeEmail,
  sendOwnershipNotification,
  sendClaimStatusNotification,
  sendInviteApprovalEmail,
  sendInviteRejectionEmail,
  sendInviteEmail
};
