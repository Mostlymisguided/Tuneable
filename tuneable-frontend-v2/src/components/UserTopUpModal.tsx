import React, { useState } from 'react';
import { X, DollarSign, Gift, Loader2 } from 'lucide-react';
import { userAPI } from '../lib/api';
import { toast } from 'react-toastify';
import { penceToPounds } from '../utils/currency';

interface UserTopUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  username: string;
  currentBalance?: number; // in pence
  currentTunebytes?: number;
  onTopUpComplete?: () => void;
}

const UserTopUpModal: React.FC<UserTopUpModalProps> = ({
  isOpen,
  onClose,
  userId,
  username,
  currentBalance,
  currentTunebytes,
  onTopUpComplete
}) => {
  const [activeTab, setActiveTab] = useState<'balance' | 'tunebytes'>('balance');
  const [balanceAmount, setBalanceAmount] = useState<string>('');
  const [tunebytesAmount, setTunebytesAmount] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleBalanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const amount = parseFloat(balanceAmount);
    if (!balanceAmount || isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid amount greater than 0');
      return;
    }

    setIsSubmitting(true);
    try {
      await userAPI.topUpBalance(userId, amount, description.trim() || undefined);
      toast.success(`Successfully topped up £${amount.toFixed(2)} for ${username}`);
      
      // Reset form
      setBalanceAmount('');
      setDescription('');
      
      if (onTopUpComplete) {
        onTopUpComplete();
      }
      
      onClose();
    } catch (error: any) {
      console.error('Error topping up balance:', error);
      toast.error(error.response?.data?.error || 'Failed to top up balance');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTunebytesSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const amount = parseFloat(tunebytesAmount);
    if (!tunebytesAmount || isNaN(amount) || amount <= 0 || !Number.isInteger(amount)) {
      toast.error('Please enter a valid whole number greater than 0');
      return;
    }

    setIsSubmitting(true);
    try {
      await userAPI.topUpTunebytes(userId, amount, description.trim() || undefined);
      toast.success(`Successfully topped up ${amount} tunebytes for ${username}`);
      
      // Reset form
      setTunebytesAmount('');
      setDescription('');
      
      if (onTopUpComplete) {
        onTopUpComplete();
      }
      
      onClose();
    } catch (error: any) {
      console.error('Error topping up tunebytes:', error);
      toast.error(error.response?.data?.error || 'Failed to top up tunebytes');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setBalanceAmount('');
      setTunebytesAmount('');
      setDescription('');
      setActiveTab('balance');
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">Top Up Account</h2>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="text-gray-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User Info */}
        <div className="p-6 border-b border-gray-700">
          <p className="text-sm text-gray-300">
            User: <span className="font-semibold text-white">{username}</span>
          </p>
          <div className="mt-2 flex gap-4 text-sm">
            <div>
              <span className="text-gray-400">Balance: </span>
              <span className="text-white font-semibold">
                {currentBalance !== undefined ? penceToPounds(currentBalance) : 'N/A'}
              </span>
            </div>
            <div>
              <span className="text-gray-400">TuneBytes: </span>
              <span className="text-white font-semibold">
                {currentTunebytes !== undefined ? currentTunebytes.toLocaleString() : 'N/A'}
              </span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700">
          <button
            onClick={() => setActiveTab('balance')}
            disabled={isSubmitting}
            className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === 'balance'
                ? 'text-purple-400 border-b-2 border-purple-400 bg-gray-750'
                : 'text-gray-400 hover:text-white hover:bg-gray-750'
            } disabled:opacity-50`}
          >
            <div className="flex items-center justify-center gap-2">
              <DollarSign className="w-4 h-4" />
              Balance (£)
            </div>
          </button>
          <button
            onClick={() => setActiveTab('tunebytes')}
            disabled={isSubmitting}
            className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === 'tunebytes'
                ? 'text-purple-400 border-b-2 border-purple-400 bg-gray-750'
                : 'text-gray-400 hover:text-white hover:bg-gray-750'
            } disabled:opacity-50`}
          >
            <div className="flex items-center justify-center gap-2">
              <Gift className="w-4 h-4" />
              TuneBytes
            </div>
          </button>
        </div>

        {/* Form Content */}
        <div className="p-6">
          {activeTab === 'balance' ? (
            <form onSubmit={handleBalanceSubmit} className="space-y-4">
              <div>
                <label htmlFor="balanceAmount" className="block text-sm font-medium text-gray-300 mb-2">
                  Amount (£)
                </label>
                <input
                  type="number"
                  id="balanceAmount"
                  step="0.01"
                  min="0.01"
                  value={balanceAmount}
                  onChange={(e) => setBalanceAmount(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
                  placeholder="0.00"
                  required
                />
                {balanceAmount && !isNaN(parseFloat(balanceAmount)) && parseFloat(balanceAmount) > 0 && (
                  <p className="mt-1 text-xs text-gray-400">
                    New balance: {penceToPounds((currentBalance || 0) + Math.round(parseFloat(balanceAmount) * 100))}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-300 mb-2">
                  Description (optional)
                </label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={isSubmitting}
                  rows={3}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 resize-none"
                  placeholder="Reason for top-up..."
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !balanceAmount}
                  className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    'Top Up Balance'
                  )}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleTunebytesSubmit} className="space-y-4">
              <div>
                <label htmlFor="tunebytesAmount" className="block text-sm font-medium text-gray-300 mb-2">
                  Amount (TuneBytes)
                </label>
                <input
                  type="number"
                  id="tunebytesAmount"
                  step="1"
                  min="1"
                  value={tunebytesAmount}
                  onChange={(e) => setTunebytesAmount(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
                  placeholder="0"
                  required
                />
                {tunebytesAmount && !isNaN(parseFloat(tunebytesAmount)) && parseFloat(tunebytesAmount) > 0 && (
                  <p className="mt-1 text-xs text-gray-400">
                    New TuneBytes: {((currentTunebytes || 0) + parseInt(tunebytesAmount)).toLocaleString()}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-300 mb-2">
                  Description (optional)
                </label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={isSubmitting}
                  rows={3}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 resize-none"
                  placeholder="Reason for top-up..."
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !tunebytesAmount}
                  className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    'Top Up TuneBytes'
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserTopUpModal;

