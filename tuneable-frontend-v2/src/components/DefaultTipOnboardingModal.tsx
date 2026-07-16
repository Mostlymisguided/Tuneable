import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Coins, X } from 'lucide-react';
import { toast } from 'react-toastify';
import { authAPI } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { needsOnboarding } from '../utils/authHelpers';

const PROMPT_DELAY_AFTER_SIGNUP_MS = 60 * 1000;

const shouldShowPrompt = (user: ReturnType<typeof useAuth>['user']) => {
  if (!user) return false;
  if (needsOnboarding(user)) return false;
  if (user.onboarding?.defaultTipPromptSeenAt) return false;
  if (!user.createdAt || !user.lastLoginAt) return false;

  const createdAtMs = Date.parse(user.createdAt);
  const lastLoginAtMs = Date.parse(user.lastLoginAt);

  if (Number.isNaN(createdAtMs) || Number.isNaN(lastLoginAtMs)) {
    return false;
  }

  return lastLoginAtMs - createdAtMs > PROMPT_DELAY_AFTER_SIGNUP_MS;
};

const DefaultTipOnboardingModal: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const [defaultTip, setDefaultTip] = useState('1.11');
  const [isSaving, setIsSaving] = useState(false);

  const isOpen = useMemo(() => shouldShowPrompt(user), [user]);

  useEffect(() => {
    if (!user) return;
    const nextValue = user.preferences?.defaultTip ?? 1.11;
    setDefaultTip(nextValue.toFixed(2));
  }, [user]);

  const markPromptSeen = async (tipAmount?: number) => {
    setIsSaving(true);

    try {
      const payload: Record<string, unknown> = {
        onboarding: {
          defaultTipPromptSeenAt: new Date().toISOString(),
        },
      };

      if (tipAmount !== undefined) {
        payload.preferences = {
          defaultTip: tipAmount,
        };
      }

      await authAPI.updateProfile(payload);
      await refreshUser();
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    const parsedTip = parseFloat(defaultTip);
    if (Number.isNaN(parsedTip) || parsedTip < 0.01) {
      toast.error('Default tip must be at least £0.01');
      return;
    }

    try {
      await markPromptSeen(parsedTip);
      toast.success(`Default tip set to £${parsedTip.toFixed(2)}`);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to save default tip');
    }
  };

  const handleKeepCurrent = async () => {
    try {
      await markPromptSeen();
      toast.success('Tip setup saved. You can change it any time in settings.');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to save tip setup');
    }
  };

  if (!isOpen || !user) return null;

  const currentTip = user.preferences?.defaultTip ?? 1.11;

  return (
    <div className="fixed inset-0 z-[11000] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-gray-700 bg-gray-900 text-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-800 p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-purple-600/20 text-purple-300">
              <Coins className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">Set Your Default Tip</h2>
              <p className="mt-1 text-sm text-gray-400">
                Adding a tune to your Library requires a tip, so choose the amount you want to use by default.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleKeepCurrent}
            disabled={isSaving}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Close tip onboarding"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 p-6">
          <div className="rounded-xl bg-black/30 p-4 text-sm text-gray-300">
            <p>The minimum default tip is <strong className="text-white">£0.01</strong>.</p>
            <p className="mt-2">There is no maximum cap enforced right now, and you can change this setting later.</p>
          </div>

          <div>
            <label htmlFor="first-login-default-tip" className="mb-2 block text-sm font-medium text-white">
              Default tip amount (£)
            </label>
            <input
              id="first-login-default-tip"
              type="number"
              step="0.01"
              min="0.01"
              inputMode="decimal"
              value={defaultTip}
              onChange={(e) => setDefaultTip(e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/40"
              placeholder="1.11"
              disabled={isSaving}
            />
            <p className="mt-2 text-sm text-gray-400">
              Your current default is £{currentTip.toFixed(2)}. Party or tune minimums can still override lower amounts.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex flex-1 items-center justify-center rounded-lg bg-purple-600 px-4 py-2 font-medium text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Default Tip'}
            </button>
            <button
              type="button"
              onClick={handleKeepCurrent}
              disabled={isSaving}
              className="inline-flex flex-1 items-center justify-center rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 font-medium text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : `Keep £${currentTip.toFixed(2)} For Now`}
            </button>
          </div>

          <p className="text-sm text-gray-400">
            You can update this later in your <Link to="/profile?settings=true&tab=notifications" className="text-purple-300 hover:text-purple-200 hover:underline">Tip Settings</Link>.
          </p>
        </div>
      </div>
    </div>
  );
};

export default DefaultTipOnboardingModal;
