/**
 * Welcome-credit artist escrow helpers (pure).
 *
 * Welcome-funded artist share (70% of the welcome portion) is provisional until
 * the tipper completes a real Stripe / Apple / Google top-up. Tips themselves
 * stay on charts; only artist-withdrawable cash is gated.
 */

const ARTIST_SHARE_PERCENTAGE = 0.70;
const PROMO_ESCROW_EXPIRY_DAYS = 90;
const PAID_TOPUP_METHODS = ['stripe', 'apple_iap', 'google_play'];

const PROMO_ESCROW_STATUS = {
  NONE: 'none',
  PENDING: 'pending',
  CONVERTED: 'converted',
  EXPIRED: 'expired',
  REVERSED: 'reversed',
};

function computePromoEscrowExpiryDate(fromDate = new Date()) {
  const expires = new Date(fromDate);
  expires.setDate(expires.getDate() + PROMO_ESCROW_EXPIRY_DAYS);
  return expires;
}

function isPaidTopUpMethod(paymentMethod) {
  return PAID_TOPUP_METHODS.includes(paymentMethod);
}

/**
 * Split a tip's artist share (70%) into paid vs provisional promo pence.
 *
 * @param {{ bidAmountPence: number, welcomeCreditAppliedPence?: number, treatWelcomeAsPaid?: boolean }} opts
 */
function splitArtistShare({
  bidAmountPence,
  welcomeCreditAppliedPence = 0,
  treatWelcomeAsPaid = false,
} = {}) {
  const amount = Math.max(0, Math.round(Number(bidAmountPence) || 0));
  const welcome = Math.max(0, Math.min(amount, Math.round(Number(welcomeCreditAppliedPence) || 0)));
  const artistSharePence = Math.round(amount * ARTIST_SHARE_PERCENTAGE);

  const usePromo = welcome > 0 && amount > 0 && !treatWelcomeAsPaid;
  const promoArtistSharePence = usePromo
    ? Math.round(artistSharePence * (welcome / amount))
    : 0;
  const paidArtistSharePence = artistSharePence - promoArtistSharePence;

  return {
    bidAmountPence: amount,
    welcomeCreditAppliedPence: welcome,
    artistSharePence,
    paidArtistSharePence,
    promoArtistSharePence,
    promoEscrowStatus:
      promoArtistSharePence > 0 ? PROMO_ESCROW_STATUS.PENDING : PROMO_ESCROW_STATUS.NONE,
    promoEscrowExpiresAt:
      promoArtistSharePence > 0 ? computePromoEscrowExpiryDate() : null,
  };
}

/**
 * Split one owner's artist share using the already-rounded bid-level promo/paid split.
 */
function splitOwnerShare(ownerSharePence, bidSplit) {
  const ownerShare = Math.max(0, Math.round(Number(ownerSharePence) || 0));
  const artistShare = bidSplit?.artistSharePence || 0;
  const promoTotal = bidSplit?.promoArtistSharePence || 0;

  if (ownerShare <= 0 || artistShare <= 0 || promoTotal <= 0) {
    return { paidPence: ownerShare, promoPence: 0 };
  }

  const promoPence = Math.round(ownerShare * (promoTotal / artistShare));
  return {
    paidPence: ownerShare - promoPence,
    promoPence,
  };
}

module.exports = {
  ARTIST_SHARE_PERCENTAGE,
  PROMO_ESCROW_EXPIRY_DAYS,
  PAID_TOPUP_METHODS,
  PROMO_ESCROW_STATUS,
  computePromoEscrowExpiryDate,
  isPaidTopUpMethod,
  splitArtistShare,
  splitOwnerShare,
};
