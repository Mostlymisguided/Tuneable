import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpCircle, Loader2, X } from 'lucide-react';
import { userAPI } from '../lib/api';
import { toast } from '../utils/toast';

type RaiseLine = {
  mediaId: string;
  title: string;
  artist: string;
  currentPence: number;
  gapPence: number;
  nextPence?: number;
  message?: string;
};

type TipRaisePreview = {
  applied?: boolean;
  partial?: boolean;
  error?: string | null;
  targetPounds: number;
  balancePence: number;
  balanceAfterPence: number;
  projectedBalancePence: number;
  shortfallPence: number;
  canAfford: boolean;
  chargePence: number;
  counts: {
    raise: number;
    already: number;
    skipped: number;
  };
  willRaise: RaiseLine[];
  willRaiseHasMore: boolean;
  skipped: RaiseLine[];
  skippedHasMore: boolean;
};

function pounds(pence: number) {
  return `£${(pence / 100).toFixed(2)}`;
}

function presetAmounts(defaultTip: number) {
  const amounts = [0.11, 1.11, defaultTip];
  const unique: number[] = [];
  for (const amount of amounts) {
    if (!Number.isFinite(amount) || amount < 0.01) continue;
    const rounded = Math.round(amount * 100) / 100;
    if (!unique.some((value) => Math.abs(value - rounded) < 0.001)) unique.push(rounded);
  }
  return unique;
}

interface BringTipsUpControlProps {
  defaultTipPounds?: number;
  disabled?: boolean;
  onCompleted?: (balanceAfterPence: number) => void;
}

const BringTipsUpControl: React.FC<BringTipsUpControlProps> = ({
  defaultTipPounds = 1.11,
  disabled = false,
  onCompleted,
}) => {
  const presets = useMemo(() => presetAmounts(defaultTipPounds), [defaultTipPounds]);
  const [isOpen, setIsOpen] = useState(false);
  const [amountInput, setAmountInput] = useState(defaultTipPounds.toFixed(2));
  const [preview, setPreview] = useState<TipRaisePreview | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  useEffect(() => {
    if (!isOpen) return undefined;

    const poundsValue = Number(amountInput);
    if (!Number.isFinite(poundsValue) || poundsValue < 0.01) {
      setPreview(null);
      setPreviewError('Enter at least £0.01');
      setIsPreviewing(false);
      return undefined;
    }

    let cancelled = false;
    setIsPreviewing(true);
    setPreviewError('');
    const timer = window.setTimeout(async () => {
      try {
        const data = await userAPI.previewTipRaise(poundsValue);
        if (!cancelled) setPreview(data);
      } catch (error: any) {
        if (!cancelled) {
          setPreview(null);
          setPreviewError(error?.response?.data?.error || 'Could not price this raise');
        }
      } finally {
        if (!cancelled) setIsPreviewing(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [amountInput, isOpen]);

  const close = () => {
    if (isConfirming) return;
    setIsOpen(false);
    setPreview(null);
    setPreviewError('');
  };

  const open = () => {
    setAmountInput((defaultTipPounds || 1.11).toFixed(2));
    setPreview(null);
    setPreviewError('');
    setIsOpen(true);
  };

  const confirm = async () => {
    const poundsValue = Number(amountInput);
    if (!preview || !preview.canAfford || preview.counts.raise === 0) return;
    setIsConfirming(true);
    try {
      const result = await userAPI.confirmTipRaise({
        targetPounds: poundsValue,
        idempotencyKey: crypto.randomUUID(),
      });
      if (result.partial) {
        toast.error(result.error || `Raised ${result.raised?.length || 0} tips, then stopped. Try again for the rest.`);
      } else if (!result.applied) {
        toast.error(result.error || 'Nothing was charged.');
        setPreview(result);
        return;
      } else {
        toast.success(
          `Brought ${result.counts.raise} ${result.counts.raise === 1 ? 'tip' : 'tips'} up to £${Number(result.targetPounds).toFixed(2)}`
        );
      }
      onCompleted?.(result.balanceAfterPence);
      setIsOpen(false);
      setPreview(null);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to raise tips');
    } finally {
      setIsConfirming(false);
    }
  };

  const raiseCount = preview?.counts.raise || 0;
  const canConfirm = Boolean(preview && preview.canAfford && raiseCount > 0 && !isPreviewing && !previewError);

  return (
    <>
      <button
        type="button"
        onClick={open}
        disabled={disabled}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:bg-gray-900 disabled:cursor-not-allowed text-gray-100 font-medium transition-colors"
      >
        <ArrowUpCircle className="h-4 w-4 text-purple-300" />
        <span className="hidden sm:inline">Bring tips up to</span>
        <span className="sm:hidden">Raise tips</span>
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center p-4"
          style={{ zIndex: 10000 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="bring-tips-up-title"
          onClick={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div className="bg-gray-800 border border-gray-700 rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 id="bring-tips-up-title" className="text-xl font-semibold text-white">
                  Bring tips up to
                </h2>
                <p className="text-sm text-gray-400 mt-1">
                  Each tune below this amount gets one new tip for the difference.
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                disabled={isConfirming}
                className="text-gray-400 hover:text-gray-200"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex flex-wrap gap-2 mb-3">
              {presets.map((amount) => (
                <button
                  key={amount}
                  type="button"
                  onClick={() => setAmountInput(amount.toFixed(2))}
                  className={`px-3 py-1 rounded-full text-sm border ${
                    Math.abs(Number(amountInput) - amount) < 0.001
                      ? 'bg-purple-700 border-purple-500 text-white'
                      : 'bg-gray-900 border-gray-600 text-gray-200 hover:border-gray-400'
                  }`}
                >
                  £{amount.toFixed(2)}
                </button>
              ))}
            </div>

            <label htmlFor="tip-raise-amount" className="block text-sm text-gray-300 mb-1">
              Target amount
            </label>
            <div className="relative mb-4">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">£</span>
              <input
                id="tip-raise-amount"
                type="number"
                min="0.01"
                step="0.01"
                value={amountInput}
                onChange={(event) => setAmountInput(event.target.value)}
                className="w-full bg-gray-900 border border-gray-600 rounded-md py-2 pl-8 pr-3 text-white"
              />
            </div>

            {isPreviewing && (
              <div className="flex items-center gap-2 text-gray-300 text-sm mb-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                Pricing your tips…
              </div>
            )}

            {previewError && !isPreviewing && (
              <p className="text-sm text-red-300 mb-4">{previewError}</p>
            )}

            {preview && !isPreviewing && (
              <div className="space-y-3 mb-4 text-sm">
                <div className="rounded-md bg-gray-900 border border-gray-700 p-3 space-y-1">
                  <p className="text-white">
                    <span className="font-semibold">{raiseCount}</span>
                    {raiseCount === 1 ? ' tune' : ' tunes'} will rise to {pounds(Math.round(preview.targetPounds * 100))}
                  </p>
                  <p className="text-gray-300">Charge {pounds(preview.chargePence)}</p>
                  {preview.canAfford ? (
                    <p className="text-gray-300">
                      Balance afterwards {pounds(preview.projectedBalancePence)}
                    </p>
                  ) : (
                    <p className="text-amber-200">
                      You need {pounds(preview.shortfallPence)} more.{' '}
                      <Link to="/wallet" className="underline">
                        Top up your wallet
                      </Link>
                    </p>
                  )}
                  {preview.counts.already > 0 && (
                    <p className="text-gray-400">
                      {preview.counts.already} already at or above this amount
                    </p>
                  )}
                  {preview.counts.skipped > 0 && (
                    <p className="text-gray-400">
                      {preview.counts.skipped} skipped by tip limits
                    </p>
                  )}
                </div>

                {preview.willRaise.length > 0 && (
                  <ul className="space-y-1 text-gray-300">
                    {preview.willRaise.map((item) => (
                      <li key={item.mediaId} className="flex justify-between gap-3">
                        <span className="truncate">
                          {item.title}
                          <span className="text-gray-500"> · {item.artist}</span>
                        </span>
                        <span className="shrink-0">+{pounds(item.gapPence)}</span>
                      </li>
                    ))}
                    {preview.willRaiseHasMore && (
                      <li className="text-gray-500">And more tunes in this raise.</li>
                    )}
                  </ul>
                )}

                {preview.skipped.length > 0 && (
                  <div>
                    <p className="text-gray-400 mb-1">Skipped</p>
                    <ul className="space-y-1 text-gray-400">
                      {preview.skipped.slice(0, 5).map((item) => (
                        <li key={`${item.mediaId}-${item.message}`}>
                          <span className="text-gray-300">{item.title}</span>
                          {item.message ? ` — ${item.message}` : ''}
                        </li>
                      ))}
                      {preview.skippedHasMore && <li>And more skipped tunes.</li>}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                disabled={isConfirming}
                className="px-4 py-2 rounded-lg text-gray-300 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={!canConfirm || isConfirming}
                className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-400 text-white font-medium"
              >
                {isConfirming ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Raising…
                  </span>
                ) : raiseCount > 0 ? (
                  `Bring ${raiseCount} ${raiseCount === 1 ? 'tip' : 'tips'} up`
                ) : (
                  'Nothing to raise'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default BringTipsUpControl;
