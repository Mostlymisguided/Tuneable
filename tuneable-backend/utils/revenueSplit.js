/**
 * Tip split after payment-processor fees have already been taken off the wallet.
 *
 * 80% of each tip is the artist's. Tuneable keeps 20%.
 * A creator may earmark 0–80% of a future tip for their perk fund. Until fan
 * perks can be redeemed, that choice is only a preference: the full 80% stays
 * withdrawable escrow. Welcome credit never goes into the fund.
 */

const ARTIST_SHARE_PERCENTAGE = 0.80;
const PLATFORM_SHARE_PERCENTAGE = 0.20;
const ARTIST_SHARE_PERCENT = 80;
const PLATFORM_SHARE_PERCENT = 20;
const ARTIST_SHARE_TARGET_PERCENT = 90;
const PLATFORM_TAKE_TARGET_PERCENT = 10;

function normalizePerkFundTipPercent(value) {
  if (value == null || value === '') return 0;
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n) || Math.round(n) !== n || n < 0 || n > ARTIST_SHARE_PERCENT) {
    const err = new Error(
      `Perk fund share must be a whole number from 0 to ${ARTIST_SHARE_PERCENT}.`
    );
    err.status = 400;
    throw err;
  }
  return n;
}

/**
 * How a tip would split once perks can be redeemed.
 * `perkFundTipPercent` is a percent of the tip (0–80), not of the artist share.
 * The fund is capped at the paid (non-welcome) portion of the artist share.
 * Callers must not move escrow with this until a perk can actually be bought.
 */
function planPerkFundSplit({
  bidAmountPence,
  artistSharePence,
  perkFundTipPercent = 0,
  paidArtistSharePence,
} = {}) {
  const artist = Math.max(0, Math.round(Number(artistSharePence) || 0));
  const tip = Math.max(0, Math.round(Number(bidAmountPence) || 0));
  const paid = paidArtistSharePence == null
    ? artist
    : Math.max(0, Math.min(artist, Math.round(Number(paidArtistSharePence) || 0)));
  const percent = normalizePerkFundTipPercent(perkFundTipPercent);
  const requested = Math.round(tip * (percent / 100));
  const fundPence = Math.min(paid, requested);
  return {
    perkFundTipPercent: percent,
    fundPence,
    cashPence: artist - fundPence,
  };
}

module.exports = {
  ARTIST_SHARE_PERCENTAGE,
  PLATFORM_SHARE_PERCENTAGE,
  ARTIST_SHARE_PERCENT,
  PLATFORM_SHARE_PERCENT,
  ARTIST_SHARE_TARGET_PERCENT,
  PLATFORM_TAKE_TARGET_PERCENT,
  normalizePerkFundTipPercent,
  planPerkFundSplit,
};
