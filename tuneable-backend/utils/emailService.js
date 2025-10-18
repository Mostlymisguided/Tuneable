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

          ${user.creatorProfile.socialMedia && Object.values(user.creatorProfile.socialMedia).some(v => v) ? `
            <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #1f2937;">Social Media</h3>
              ${Object.entries(user.creatorProfile.socialMedia)
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

module.exports = {
  sendCreatorApplicationNotification,
  sendClaimNotification,
  sendUserRegistrationNotification,
  sendPartyCreationNotification,
  sendPaymentNotification,
  sendHighValueBidNotification
};
