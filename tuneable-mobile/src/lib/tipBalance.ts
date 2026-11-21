import { router } from 'expo-router';
import { getApiErrorMessage } from '@/src/lib/apiError';
import { showToast } from '@/src/stores/toastStore';

export const TIP_TOP_UP_MESSAGE =
  'Insufficient balance. Please top up your wallet.';

export function isInsufficientBalanceError(err: unknown): boolean {
  return getApiErrorMessage(err, '')
    .toLowerCase()
    .includes('insufficient balance');
}

export function openWalletForTipTopUp(): void {
  showToast(TIP_TOP_UP_MESSAGE, 'error');
  router.push('/wallet');
}

type BalanceUser = { balance?: number } | null | undefined;

/** Re-read the server wallet when the cached session balance is short. */
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
