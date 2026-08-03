const User = require('../models/User');

/**
 * Resolve an optional invite code for signup.
 * - No code → open signup (no parent attribution)
 * - Code present → must be valid, active, and have credits (admins unlimited)
 *
 * @param {string|null|undefined} rawCode
 * @returns {Promise<{ ok: true, code: string|null, inviter: object|null, inviteCodeObj: object|null, isInviterAdmin: boolean } | { ok: false, error: string }>}
 */
async function resolveInviteForSignup(rawCode) {
  const code =
    typeof rawCode === 'string' && rawCode.trim()
      ? rawCode.trim().toUpperCase()
      : null;

  if (!code) {
    return {
      ok: true,
      code: null,
      inviter: null,
      inviteCodeObj: null,
      isInviterAdmin: false,
    };
  }

  if (code.length !== 5) {
    return { ok: false, error: 'Invalid invite code' };
  }

  const inviter = await User.findByInviteCode(code);
  if (!inviter) {
    return { ok: false, error: 'Invalid invite code' };
  }

  const inviteCodeObj = inviter.findInviteCodeObject(code);
  if (inviteCodeObj && !inviteCodeObj.isActive) {
    return { ok: false, error: 'This invite code has been deactivated' };
  }

  const isInviterAdmin = Boolean(inviter.role && inviter.role.includes('admin'));
  if (!isInviterAdmin && (!inviter.inviteCredits || inviter.inviteCredits <= 0)) {
    return { ok: false, error: 'This invite code has no remaining invites' };
  }

  return {
    ok: true,
    code,
    inviter,
    inviteCodeObj: inviteCodeObj || null,
    isInviterAdmin,
  };
}

/**
 * Increment usageCount and decrement inviteCredits after a successful signup.
 * No-op when there was no inviter.
 */
async function applyInviteUsage({ inviter, inviteCodeObj, code, isInviterAdmin }) {
  if (!inviter || !code) return;

  if (inviteCodeObj && inviteCodeObj._id && inviter.personalInviteCodes) {
    const codeIndex = inviter.personalInviteCodes.findIndex(
      (ic) => ic._id && ic._id.toString() === inviteCodeObj._id.toString()
    );
    if (codeIndex !== -1) {
      inviter.personalInviteCodes[codeIndex].usageCount =
        (inviter.personalInviteCodes[codeIndex].usageCount || 0) + 1;
      await inviter.save();
    }
  } else if (inviter.personalInviteCode === code) {
    if (!inviter.personalInviteCodes || inviter.personalInviteCodes.length === 0) {
      inviter.personalInviteCodes = [
        {
          code: inviter.personalInviteCode,
          isActive: true,
          label: 'Primary',
          createdAt: inviter.createdAt || new Date(),
          usageCount: 1,
        },
      ];
    } else {
      const codeIndex = inviter.personalInviteCodes.findIndex((ic) => ic.code === code);
      if (codeIndex !== -1) {
        inviter.personalInviteCodes[codeIndex].usageCount =
          (inviter.personalInviteCodes[codeIndex].usageCount || 0) + 1;
      }
    }
    await inviter.save();
  }

  if (!isInviterAdmin && inviter.inviteCredits > 0) {
    inviter.inviteCredits -= 1;
    await inviter.save();
    console.log(
      `✅ Decremented invite credits for ${inviter.username}. Remaining: ${inviter.inviteCredits}`
    );
  }
}

module.exports = {
  resolveInviteForSignup,
  applyInviteUsage,
};
