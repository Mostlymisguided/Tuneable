import React, { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { userAPI } from '../lib/api';
import { toast } from '../utils/toast';
import { penceToPounds } from '../utils/currency';

interface EditBidAmountModalProps {
  bid: {
    _id: string;
    amount: number;
    user?: { username?: string };
    media?: { title?: string };
  };
  onClose: () => void;
  onSaved: () => void;
}

function poundsInputToPence(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const [whole, fraction = ''] = trimmed.split('.');
  return parseInt(whole, 10) * 100 + parseInt((fraction + '00').slice(0, 2), 10);
}

const EditBidAmountModal: React.FC<EditBidAmountModalProps> = ({ bid, onClose, onSaved }) => {
  const [amountInput, setAmountInput] = useState((bid.amount / 100).toFixed(2));
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const amountPence = poundsInputToPence(amountInput);
    if (amountPence === null || amountPence < 1) {
      toast.error('Enter an amount of at least £0.01, with at most two decimal places.');
      return;
    }
    if (amountPence === bid.amount) {
      toast.error('That is already the tip amount.');
      return;
    }
    if (reason.trim().length < 3) {
      toast.error('Add a short reason for the edit.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await userAPI.adjustBidAmount(bid._id, amountPence, reason.trim());
      toast.success(result.message || `Tip updated to ${penceToPounds(amountPence)}.`);
      onSaved();
      onClose();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to update tip amount');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-lg bg-gray-800 border border-gray-700 shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <h3 className="text-lg font-semibold text-white">Edit tip amount</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <p className="text-sm text-gray-300">
            {bid.user?.username || 'This tipper'} on {bid.media?.title || 'this tune'}.
            Current amount {penceToPounds(bid.amount)}.
          </p>
          <p className="text-xs text-gray-400">
            The tip stays on the same bid, so the place and the original ledger row stay put.
            This writes a separate adjustment for the difference and moves the wallet and artist escrow by that amount.
            Use Veto to remove a tip.
          </p>
          <div>
            <label htmlFor="tip-amount" className="block text-sm font-medium text-gray-300 mb-1">
              New amount (£)
            </label>
            <input
              id="tip-amount"
              type="text"
              inputMode="decimal"
              value={amountInput}
              onChange={(event) => setAmountInput(event.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
              autoFocus
            />
          </div>
          <div>
            <label htmlFor="tip-reason" className="block text-sm font-medium text-gray-300 mb-1">
              Reason
            </label>
            <textarea
              id="tip-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Promotional tidy-up"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-sm text-gray-300 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm rounded transition-colors inline-flex items-center"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save amount
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditBidAmountModal;
