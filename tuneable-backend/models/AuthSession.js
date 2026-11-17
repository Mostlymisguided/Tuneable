const mongoose = require('mongoose');

/**
 * One device login. The refresh token is stored only as a hash.
 * Access JWTs carry this document's id and die when it is revoked.
 */
const authSessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  familyId: { type: String, required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null },
  revokeReason: { type: String, default: null },
  replacedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  exchangeCodeHash: { type: String, default: null },
  exchangeExpiresAt: { type: Date, default: null },
  heldRefreshToken: { type: String, default: null },
}, { timestamps: true });

authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
authSessionSchema.index({ exchangeCodeHash: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('AuthSession', authSessionSchema);
