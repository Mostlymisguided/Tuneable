/**
 * Permission record for admin "permitted" uploads (artist gave off-platform
 * permission but is not on Tuneable yet).
 *
 * The note is stored on ownershipHistory and on a rights case so
 * auditPermittedHosted.js keeps the track playable, and so outreach and the
 * eventual claim have the artist's contact details.
 */

const { isStockNote } = require('./permittedAudit');
const { normalizeInstagramHandle } = require('./rightsCaseHelpers');

const MIN_NOTE_LENGTH = 10;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function trimmed(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * @returns {{ error: string } | { permission: { fromName, email, instagram, note, recordNote } }}
 */
function parsePermittedPermission(body = {}) {
  const fromName = trimmed(body.permissionFromName);
  const note = trimmed(body.permissionNote);
  const email = trimmed(body.permissionFromEmail).toLowerCase();
  const instagram = normalizeInstagramHandle(trimmed(body.permissionFromInstagram));

  if (!fromName) {
    return { error: 'Permitted uploads need the name of the person who gave permission' };
  }
  if (note.length < MIN_NOTE_LENGTH) {
    return { error: 'Permitted uploads need a note describing how and when permission was given' };
  }
  if (email && !EMAIL_RE.test(email)) {
    return { error: 'Permission contact email is not valid' };
  }

  const recordNote = `Off-platform permission from ${fromName}: ${note}`;
  if (isStockNote(recordNote)) {
    return { error: 'Permission note must describe the permission itself, not that the track is awaiting a claim' };
  }

  return {
    permission: {
      fromName,
      email: email || null,
      instagram: instagram || null,
      note,
      recordNote,
    },
  };
}

function permittedHistoryEntry(permission, actorId, fromStatus = null) {
  return {
    action: 'rights_status_permitted',
    timestamp: new Date(),
    actor: actorId,
    note: permission.recordNote,
    diff: [{ field: 'rightsStatus', from: fromStatus, to: 'permitted' }],
  };
}

/**
 * Open (or update) a rights case for the permitting artist. Failures are
 * logged, not thrown — the ownershipHistory note already satisfies the audit.
 */
async function openPermittedRightsCase(media, permission, actorId) {
  try {
    const rightsCaseService = require('../services/rightsCaseService');
    const contacts = [];
    if (permission.email) contacts.push({ type: 'email', value: permission.email });
    if (permission.instagram) contacts.push({ type: 'instagram', value: permission.instagram });
    const { rightsCase } = await rightsCaseService.createCase({
      mediaId: media._id,
      party: { displayName: permission.fromName, role: 'artist', contacts },
      source: 'manual',
      notes: permission.recordNote,
      createdBy: actorId,
    });
    return rightsCase;
  } catch (error) {
    console.error(`Failed to open rights case for permitted media ${media._id}:`, error.message);
    return null;
  }
}

module.exports = {
  parsePermittedPermission,
  permittedHistoryEntry,
  openPermittedRightsCase,
};
