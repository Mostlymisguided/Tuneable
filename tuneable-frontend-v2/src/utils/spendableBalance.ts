type BalanceUser = { balance?: number } | null | undefined;

/**
 * Cached wallet balance is whatever the session last loaded. An admin credit
 * (or any other top-up) can land while that session is still open, so a short
 * cache must be checked against the server before a tip is refused.
 */
export async function ensureSpendableBalance(
  cachedPence: number | null | undefined,
  neededPence: number,
  refreshUser: () => Promise<BalanceUser>
): Promise<boolean> {
  if (!Number.isFinite(neededPence) || neededPence <= 0) return true;
  if ((cachedPence ?? 0) >= neededPence) return true;
  const fresh = await refreshUser().catch(() => null);
  return (fresh?.balance ?? 0) >= neededPence;
}
