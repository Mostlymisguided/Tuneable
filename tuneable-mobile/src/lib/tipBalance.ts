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
