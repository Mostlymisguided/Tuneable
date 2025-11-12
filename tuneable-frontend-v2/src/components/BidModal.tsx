import React, { useState } from 'react';
import { X, PoundSterling, AlertCircle, Minus, Plus } from 'lucide-react';
import BetaWarningBanner from './BetaWarningBanner';

interface BidModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (bidAmount: number) => void;
  songTitle: string;
  songArtist: string;
  currentBid: number;
  userBalance?: number;
  isLoading?: boolean;
}

const BidModal: React.FC<BidModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  songTitle,
  songArtist,
  currentBid,
  userBalance = 0,
  isLoading = false,
}) => {
  const [bidAmount, setBidAmount] = useState('');
  const [error, setError] = useState('');

  const adjustBidAmount = (delta: number) => {
    const current = parseFloat(bidAmount) || 0;
    const newAmount = Math.max(0.01, current + delta);
    const maxAmount = userBalance || 999999;
    const finalAmount = Math.min(newAmount, maxAmount);
    setBidAmount(finalAmount.toFixed(2));
    setError('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const amount = parseFloat(bidAmount);
    
    if (isNaN(amount) || amount <= 0) {
      setError('Please enter a valid bid amount greater than £0');
      return;
    }
    
    if (amount < 0.01) {
      setError('Minimum bid amount is £0.01');
      return;
    }
    
    if (amount > userBalance) {
      setError(`Insufficient funds. You have £${userBalance.toFixed(2)} but need £${amount.toFixed(2)}`);
      return;
    }
    
    setError('');
    onConfirm(amount);
  };

  const handleClose = () => {
    setBidAmount('');
    setError('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Place a Bid</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={isLoading}
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="mb-4">
          <h3 className="font-medium text-gray-900">{songTitle}</h3>
          <p className="text-sm text-gray-600">{songArtist}</p>
          <p className="text-sm text-gray-500 mt-1">
            Current bid: <span className="font-medium">£{currentBid.toFixed(2)}</span>
          </p>
        </div>

        {/* Beta Warning */}
        <BetaWarningBanner variant="compact" className="mb-4" />

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="bidAmount" className="block text-sm font-medium text-gray-700 mb-2">
              Your Bid Amount
            </label>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => adjustBidAmount(-0.01)}
                disabled={isLoading || parseFloat(bidAmount) <= 0.01}
                className="px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
              >
                <Minus className="h-4 w-4 text-gray-600" />
              </button>
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <PoundSterling className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="number"
                  id="bidAmount"
                  step="0.01"
                  min="0.01"
                  value={bidAmount}
                  onChange={(e) => {
                    setBidAmount(e.target.value);
                    setError('');
                  }}
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="0.00"
                  disabled={isLoading}
                  autoFocus
                />
              </div>
              <button
                type="button"
                onClick={() => adjustBidAmount(0.01)}
                disabled={isLoading || (userBalance > 0 && parseFloat(bidAmount) >= userBalance)}
                className="px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
              >
                <Plus className="h-4 w-4 text-gray-600" />
              </button>
            </div>
            {error && (
              <div className="mt-2 flex items-center text-sm text-red-600">
                <AlertCircle className="h-4 w-4 mr-1" />
                {error}
              </div>
            )}
          </div>

          <div className="flex space-x-3">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading || !bidAmount}
            >
              {isLoading ? 'Placing Bid...' : 'Place Bid'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BidModal;
