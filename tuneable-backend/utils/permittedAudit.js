/**
 * Decide whether a permitted, hosted track has a permission note App Review
 * can be pointed at. Stock attach stamps are not a permission trail.
 * Uncertain rows should go back to pending (listing and escrow stay).
 */

const STOCK_NOTES = new Set([
  'admin attach with off-platform permission - awaiting artist claim',
  'audio attached to existing catalog entry',
  'operator attach - rights pending artist claim',
  'third-party upload with rights disclaimer',
  'library import - rights pending artist claim. tips held in escrow until verified.',
  'attached from local library (manual approval)',
  'verification notes',
]);

/** Notes that say permission is still missing, or that only record a file attach. */
const NOT_A_GRANT = /rights pending|awaiting artist claim|awaiting claim/;

const PERMISSION_LANGUAGE = /\b(permission|permitted|licence|license|licensed|consent|consented|authoris\w*|authoriz\w*)\b/i;

function normalizeNote(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[—–]/g, '-')
    .replace(/\s+/g, ' ');
}

function isStockNote(value) {
  const normalized = normalizeNote(value);
  if (!normalized) return true;
  if (STOCK_NOTES.has(normalized)) return true;
  if (normalized.startsWith('third-party upload with rights disclaimer')) return true;
  if (NOT_A_GRANT.test(normalized)) return true;
  return false;
}

function collectOwnerNotes(media) {
  const notes = [];
  for (const owner of media?.mediaOwners || []) {
    if (owner?.verificationNotes) notes.push(owner.verificationNotes);
  }
  for (const entry of media?.ownershipHistory || []) {
    if (entry?.note) notes.push(entry.note);
  }
  return notes;
}

function collectCasePermissionNotes(rightsCases) {
  const notes = [];
  for (const rightsCase of rightsCases || []) {
    if (rightsCase?.notes && PERMISSION_LANGUAGE.test(rightsCase.notes)) {
      notes.push(rightsCase.notes);
    }
    for (const event of rightsCase?.outreach || []) {
      const body = event?.body || '';
      if ((event?.direction === 'inbound' || event?.direction === 'note') && PERMISSION_LANGUAGE.test(body)) {
        notes.push(body);
      }
    }
  }
  return notes;
}

/**
 * @returns {{ documented: boolean, permissionNote: string | null }}
 */
function describePermittedPermission(media, rightsCases = []) {
  const customOwnerNotes = collectOwnerNotes(media)
    .filter((note) => !isStockNote(note))
    .filter((note) => PERMISSION_LANGUAGE.test(note));
  const caseNotes = collectCasePermissionNotes(rightsCases).filter((note) => !isStockNote(note));
  const permissionNote = customOwnerNotes[0] || caseNotes[0] || null;
  return {
    documented: Boolean(permissionNote),
    permissionNote,
  };
}

module.exports = {
  STOCK_NOTES,
  describePermittedPermission,
  isStockNote,
  normalizeNote,
};
