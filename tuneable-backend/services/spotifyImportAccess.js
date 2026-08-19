const SpotifyImportRequest = require('../models/SpotifyImportRequest');

function isSpotifyPublicImport(env = process.env) {
  const raw = String(env.SPOTIFY_PUBLIC_IMPORT || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

function isAdminUser(user) {
  return Array.isArray(user?.role) && user.role.includes('admin');
}

function serializeRequest(request) {
  if (!request) return null;
  return {
    id: request._id?.toString?.() || request.id || null,
    status: request.status,
    spotifyAccount: request.spotifyAccount || null,
    note: request.note || null,
    createdAt: request.createdAt || null,
    reviewedAt: request.reviewedAt || null,
    rejectedReason: request.rejectedReason || null,
  };
}

async function getSpotifyImportAccess(user) {
  const connected = Boolean(user?.spotifyId);
  const publicImport = isSpotifyPublicImport();
  const admin = isAdminUser(user);
  const request = user?._id
    ? await SpotifyImportRequest.findOne({ userId: user._id }).sort({ createdAt: -1 }).lean()
    : null;
  const allowlisted = request?.status === 'allowlisted';

  return {
    connected,
    publicImport,
    oauthAvailable: publicImport || connected || allowlisted || admin,
    request: serializeRequest(request),
  };
}

module.exports = {
  isSpotifyPublicImport,
  isAdminUser,
  serializeRequest,
  getSpotifyImportAccess,
};
