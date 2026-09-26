const mongoose = require('mongoose');

/**
 * Singleton counter for Founding Creator seats.
 * claimSeat() increments atomically while under the configured cap.
 */
const foundingProgramSchema = new mongoose.Schema({
  _id: { type: String, default: 'founding-creators' },
  claimedSeats: { type: Number, default: 0, min: 0 },
  updatedAt: { type: Date, default: Date.now },
}, {
  timestamps: true,
});

foundingProgramSchema.statics.getState = async function getState() {
  let doc = await this.findById('founding-creators');
  if (!doc) {
    doc = await this.create({ _id: 'founding-creators', claimedSeats: 0 });
  }
  return doc;
};

/**
 * Atomically reserve the next seat number if under cap.
 * Ensures the singleton exists first (avoids upsert+cap race duplicates).
 * @returns {Promise<number|null>} seat number (1-based) or null if full
 */
foundingProgramSchema.statics.claimSeat = async function claimSeat(cap) {
  const limit = Math.max(0, Number(cap) || 0);
  if (limit <= 0) return null;

  await this.getState();

  const doc = await this.findOneAndUpdate(
    { _id: 'founding-creators', claimedSeats: { $lt: limit } },
    {
      $inc: { claimedSeats: 1 },
      $set: { updatedAt: new Date() },
    },
    { new: true }
  );

  if (!doc) return null;
  return doc.claimedSeats;
};

foundingProgramSchema.statics.releaseSeat = async function releaseSeat() {
  await this.findOneAndUpdate(
    { _id: 'founding-creators', claimedSeats: { $gt: 0 } },
    {
      $inc: { claimedSeats: -1 },
      $set: { updatedAt: new Date() },
    }
  );
};

module.exports = mongoose.models.FoundingProgram
  || mongoose.model('FoundingProgram', foundingProgramSchema);
