const User = require('../models/User');
const { foundingInviteEligibilityFields } = require('./foundingCreators');

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
 * Fields to stamp on a new User so affiliate attribution survives code edits.
 */
function inviteAttributionFields(invite) {
  if (!invite || !invite.ok || !invite.inviter) return {};
  return {
    parentInviteCode: invite.code || undefined,
    parentInviteCodeId: invite.inviteCodeObj && invite.inviteCodeObj._id
      ? invite.inviteCodeObj._id
      : undefined,
    invitedByUserId: invite.inviter._id,
    ...foundingInviteEligibilityFields(),
  };
}

/**
 * Attach a valid invite to an existing account and mark them eligible for a founding seat.
 * Same code is idempotent and does not spend another invite credit.
 */
async function attachInviteForFounding(user, rawCode) {
  if (!user) return { ok: false, status: 404, error: 'User not found' };

  const invite = await resolveInviteForSignup(rawCode);
  if (!invite.ok || !invite.inviter) {
    return { ok: false, status: 400, error: invite.error || 'Invalid invite code' };
  }
  if (String(invite.inviter._id) === String(user._id)) {
    return { ok: false, status: 400, error: 'You cannot use your own invite code' };
  }

  const existing = typeof user.parentInviteCode === 'string'
    ? user.parentInviteCode.toUpperCase()
    : '';
  if (existing && existing !== invite.code) {
    return { ok: false, status: 400, error: 'This account already used a different invite code' };
  }

  const alreadyAttached = existing === invite.code;
  if (!alreadyAttached) {
    user.parentInviteCode = invite.code;
    user.parentInviteCodeId = invite.inviteCodeObj && invite.inviteCodeObj._id
      ? invite.inviteCodeObj._id
      : undefined;
    user.invitedByUserId = invite.inviter._id;
  }

  if (!user.foundingEligible) {
    Object.assign(user, foundingInviteEligibilityFields());
  } else if (!user.foundingEligibilitySource) {
    user.foundingEligibilitySource = 'invite';
  }

  await user.save();

  if (!alreadyAttached) {
    await applyInviteUsage({
      inviter: invite.inviter,
      inviteCodeObj: invite.inviteCodeObj,
      code: invite.code,
      isInviterAdmin: invite.isInviterAdmin,
    });
  }

  return {
    ok: true,
    code: invite.code,
    inviterUsername: invite.inviter.username || null,
    foundingEligible: true,
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
  inviteAttributionFields,
  attachInviteForFounding,
};
