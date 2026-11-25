import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from '../utils/toast';
import { useAuth } from '../contexts/AuthContext';
import { userAPI } from '../lib/api';
import WelcomeCreditClaimCard from './WelcomeCreditClaimCard';

function normalizeCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
}

const InviteCodeRedeem: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const savedCode = (user?.parentInviteCode || '').trim().toUpperCase();
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const applyCode = async () => {
    const next = normalizeCode(code);
    if (next.length !== 5 || submitting) return;
    setSubmitting(true);
    try {
      const result = await userAPI.attachFoundingInvite(next);
      const refreshed = await refreshUser();
      setCode('');
      const status = refreshed?.welcomeCreditOffer?.status;
      if (status === 'eligible' || status === 'needs_verification') {
        toast.success('Invite code saved.');
      } else {
        toast.success(result.message || 'Invite code saved.');
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Could not apply that invite code');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-black/30 border border-purple-500/20 rounded-lg p-4 mb-4">
      {savedCode ? (
        <p className="text-sm text-gray-300">
          Invite code on this account:{' '}
          <span className="font-mono text-purple-300">{savedCode}</span>
        </p>
      ) : (
        <>
          <h3 className="text-base font-semibold text-white">Have an invite code?</h3>
          <p className="text-xs text-gray-400 mt-1">
            Enter a code from someone on Tuneable to apply it to this account.
          </p>
          <form
            className="mt-3 flex flex-col sm:flex-row gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void applyCode();
            }}
          >
            <input
              id="redeem-invite-code"
              type="text"
              value={code}
              maxLength={5}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              onChange={(event) => setCode(normalizeCode(event.target.value))}
              className="w-full sm:max-w-[12rem] bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 tracking-[0.3em] uppercase"
              placeholder="ABCDE"
              aria-label="Invite code"
            />
            <button
              type="submit"
              disabled={code.length !== 5 || submitting}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {submitting ? 'Applying…' : 'Apply code'}
            </button>
          </form>
        </>
      )}
      <WelcomeCreditClaimCard variant="embedded" />
    </div>
  );
};

export default InviteCodeRedeem;
