import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Minus, Plus, X } from 'lucide-react';

export interface LibraryTipTarget {
  mediaId?: string;
  mediaUuid?: string;
  title: string;
  artist: string;
}

interface LibraryTipModalProps {
  item: LibraryTipTarget | null;
  defaultAmount?: number;
  minimumBid?: number;
  isSubmitting?: boolean;
  onClose: () => void;
  onConfirm: (amount: number) => void | Promise<void>;
}

const PRESET_AMOUNTS = [0.11, 0.5, 1.11, 2.22, 5.55];

const clampToMinimum = (amount: number, minimumBid: number) => {
  if (!Number.isFinite(amount)) {
    return minimumBid;
  }
  return Math.max(minimumBid, amount);
};

const LibraryTipModal: React.FC<LibraryTipModalProps> = ({
  item,
  defaultAmount = 0.11,
  minimumBid = 0.01,
  isSubmitting = false,
  onClose,
  onConfirm,
}) => {
  const effectiveMinimumBid = useMemo(
    () => clampToMinimum(minimumBid, 0.01),
    [minimumBid]
  );
  const initialAmount = useMemo(
    () => clampToMinimum(defaultAmount, effectiveMinimumBid),
    [defaultAmount, effectiveMinimumBid]
  );
  const [step, setStep] = useState<'amount' | 'confirm'>('amount');
  const [amount, setAmount] = useState(initialAmount.toFixed(2));

  useEffect(() => {
    if (!item) {
      return;
    }
    setStep('amount');
    setAmount(initialAmount.toFixed(2));
  }, [item, initialAmount]);

  if (!item) {
    return null;
  }

  const parsedAmount = parseFloat(amount);
  const isAmountValid =
    Number.isFinite(parsedAmount) && parsedAmount >= effectiveMinimumBid;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="card max-w-sm w-full">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-white">
            {step === 'amount' ? 'Increase tip' : 'Confirm tip'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {step === 'amount' ? (
          <>
            <p className="text-gray-300 text-sm mb-2 truncate" title={item.title}>
              {item.title}
            </p>
            <p className="text-gray-400 text-xs mb-4 truncate">{item.artist}</p>
            <div className="flex items-center gap-0 mb-2">
              <button
                type="button"
                onClick={() => {
                  const nextAmount = clampToMinimum(
                    (parseFloat(amount) || initialAmount) - 0.01,
                    effectiveMinimumBid
                  );
                  setAmount(nextAmount.toFixed(2));
                }}
                disabled={!isAmountValid || parsedAmount <= effectiveMinimumBid}
                className="px-3 py-2.5 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-l-lg transition-colors"
                aria-label="Decrease amount"
              >
                <Minus className="h-4 w-4 text-white" />
              </button>
              <div className="flex items-center flex-1 bg-gray-800 border-y border-gray-600">
                <span className="pl-3 text-gray-400">£</span>
                <input
                  type="number"
                  step="0.01"
                  min={effectiveMinimumBid.toFixed(2)}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="flex-1 bg-transparent px-2 py-2 text-white focus:outline-none w-24 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  const nextAmount = (parseFloat(amount) || 0) + 0.01;
                  setAmount(nextAmount.toFixed(2));
                }}
                className="px-3 py-2.5 bg-gray-600 hover:bg-gray-500 rounded-r-lg transition-colors"
                aria-label="Increase amount"
              >
                <Plus className="h-4 w-4 text-white" />
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Minimum tip: £{effectiveMinimumBid.toFixed(2)}
            </p>
            <div className="flex flex-wrap gap-2 mb-4">
              {PRESET_AMOUNTS.map((presetAmount) => {
                const displayAmount = Math.max(presetAmount, effectiveMinimumBid);
                return (
                  <button
                    key={presetAmount}
                    type="button"
                    onClick={() => setAmount(displayAmount.toFixed(2))}
                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
                  >
                    £{displayAmount.toFixed(2)}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => isAmountValid && setStep('confirm')}
                disabled={!isAmountValid}
                className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                Tip £{isAmountValid ? parsedAmount.toFixed(2) : '—'}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-gray-300 text-sm mb-2 truncate" title={item.title}>
              {item.title}
            </p>
            <p className="text-gray-400 text-xs mb-4">
              Add <span className="font-semibold text-green-400">£{parsedAmount.toFixed(2)}</span> to your tip?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStep('amount')}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => void onConfirm(parsedAmount)}
                disabled={isSubmitting}
                className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Confirm'
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default LibraryTipModal;
