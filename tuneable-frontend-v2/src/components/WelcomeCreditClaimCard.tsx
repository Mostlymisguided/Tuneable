import React, { useState } from 'react';
import { Gift, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';
import { emailAPI, userAPI } from '../lib/api';
import { penceToPounds } from '../utils/currency';

type Variant = 'default' | 'compact';

function offerPounds(amountPence?: number): string {
  return penceToPounds(amountPence || 1111);
}

const WelcomeCreditClaimCard: React.FC<{ variant?: Variant }> = ({ variant = 'default' }) => {
  const { user, refreshUser, updateBalance } = useAuth();
  const offer = user?.welcomeCreditOffer;
  const [accepted, setAccepted] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  if (!offer || (offer.status !== 'eligible' && offer.status !== 'needs_verification')) {
    return null;
  }

  const amountLabel = offerPounds(offer.amountPence);
  const compact = variant === 'compact';

  const handleClaim = async () => {
    if (!accepted || claiming) return;
    setClaiming(true);
    try {
      const result = await userAPI.claimWelcomeCredit();
      if (typeof result.user?.balance === 'number') {
        updateBalance(result.user.balance);
      }
      await refreshUser();
      if (result.alreadyClaimed) {
        toast.info('Welcome credit was already on your account.');
      } else {
        toast.success(`${amountLabel} welcome credit added to your wallet.`);
      }
    } catch (error: any) {
      const code = error?.response?.data?.code;
      const message = error?.response?.data?.error || 'Could not claim welcome credit';
      if (code === 'NEEDS_VERIFICATION') {
        toast.error('Verify your email to claim welcome credit.');
      } else {
        toast.error(message);
      }
      await refreshUser().catch(() => undefined);
    } finally {
      setClaiming(false);
    }
  };

  const handleVerify = async () => {
    if (sendingEmail) return;
    setSendingEmail(true);
    try {
      await emailAPI.resendVerification();
      toast.success('Verification email sent — check your inbox.');
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to send verification email');
    } finally {
      setSendingEmail(false);
    }
  };

  return (
    <div
      className={`rounded-lg border border-purple-500/40 bg-gray-900 ${
        compact ? 'p-3 mb-4' : 'p-5 mb-6'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`rounded-lg bg-purple-600/20 ${compact ? 'p-2' : 'p-2.5'}`}>
          <Gift className={compact ? 'h-5 w-5 text-purple-400' : 'h-6 w-6 text-purple-400'} />
        </div>
        <div className="min-w-0 flex-1">
          {offer.status === 'needs_verification' ? (
            <>
              <h3 className={`font-semibold text-white ${compact ? 'text-sm' : 'text-lg'}`}>
                Verify your email to claim {amountLabel}
              </h3>
              <p className={`text-gray-400 mt-1 ${compact ? 'text-xs' : 'text-sm'}`}>
                Confirm your email so we can add promotional welcome credit to your wallet.
              </p>
              <button
                type="button"
                onClick={handleVerify}
                disabled={sendingEmail}
                className="mt-3 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
              >
                {sendingEmail ? 'Sending…' : 'Send verification email'}
              </button>
            </>
          ) : (
            <>
              <h3 className={`font-semibold text-white ${compact ? 'text-sm' : 'text-lg'}`}>
                Claim your {amountLabel} welcome credit
              </h3>
              <ul className={`text-gray-400 mt-2 space-y-1 ${compact ? 'text-xs' : 'text-sm'}`}>
                <li>Promotional credit — not cash, and it can’t be withdrawn.</li>
                <li>Unused credit can be revoked and expires 12 months after you claim it.</li>
                {!compact && (
                  <>
                    <li>Spent tips are not clawed back.</li>
                    <li>Welcome tips: max £1.11 per tip, £3.33 / 3 songs per artist, and you can’t tip media you own.</li>
                  </>
                )}
              </ul>
              <p className={`mt-2 ${compact ? 'text-xs' : 'text-sm'}`}>
                <Link
                  to="/terms-of-service#welcome-credit"
                  className="text-purple-400 underline hover:text-purple-300"
                >
                  Read the full welcome credit terms
                </Link>
              </p>
              <label className={`mt-3 flex items-start gap-2 text-gray-300 ${compact ? 'text-xs' : 'text-sm'}`}>
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-600 bg-gray-800 text-purple-600 focus:ring-purple-500"
                />
                <span>I understand this is promotional credit</span>
              </label>
              <button
                type="button"
                onClick={handleClaim}
                disabled={!accepted || claiming}
                className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
              >
                {claiming ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {claiming ? 'Claiming…' : `Claim ${amountLabel}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default WelcomeCreditClaimCard;
