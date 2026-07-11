/** Fee estimate matching web Wallet (conservative ~3.5% + £0.22). */
export function estimateStripeFee(amountPounds: number): number {
  return amountPounds * 0.035 + 0.22;
}

export function totalChargePounds(walletCreditPounds: number): number {
  const total = walletCreditPounds + estimateStripeFee(walletCreditPounds);
  return Math.ceil(total * 100) / 100;
}
