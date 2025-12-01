import React from 'react';
import { X, Wallet, CreditCard, AlertCircle } from 'lucide-react';

interface TopUpConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onChangeAmount: () => void;
  topUpAmount: number;
  stripeFee: number;
  totalCharge: number;
  isLoading?: boolean;
}

const TopUpConfirmationModal: React.FC<TopUpConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  onChangeAmount,
  topUpAmount,
  stripeFee,
  totalCharge,
  isLoading = false
}) => {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/70 flex items-center justify-center p-4" 
      style={{ zIndex: 10000 }}
      onClick={onClose}
    >
      <div 
        className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl max-w-md w-full border border-purple-500/20"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-br from-gray-900 to-gray-800 border-b border-gray-700 p-6 flex items-center justify-between z-10">
          <div className="flex items-center space-x-3">
            <Wallet className="w-6 h-6 text-purple-400" />
            <h2 className="text-2xl font-bold text-white">Confirm Top-Up</h2>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="text-gray-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Amount Breakdown */}
          <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Wallet className="w-5 h-5 text-green-400" />
                  <span className="text-gray-300">Amount to add to wallet</span>
                </div>
                <span className="text-white font-semibold text-lg">£{topUpAmount.toFixed(2)}</span>
              </div>
              
              <div className="h-px bg-gray-700"></div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <CreditCard className="w-5 h-5 text-blue-400" />
                  <span className="text-gray-300">Stripe processing fees</span>
                </div>
                <span className="text-gray-400">£{stripeFee.toFixed(2)}</span>
              </div>
              
              <div className="h-px bg-gray-700"></div>
              
              <div className="flex items-center justify-between pt-2">
                <span className="text-white font-semibold">Total charge</span>
                <span className="text-white font-bold text-xl">£{totalCharge.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Info Note */}
          <div className="bg-blue-900/20 border border-blue-700/30 rounded-lg p-3 flex items-start space-x-2">
            <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-blue-200">
              You'll be charged <strong>£{totalCharge.toFixed(2)}</strong> by Stripe. 
              After processing fees, <strong>£{topUpAmount.toFixed(2)}</strong> will be added to your wallet.
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col space-y-3 pt-4 border-t border-gray-700">
            <button
              onClick={onConfirm}
              disabled={isLoading}
              className="w-full px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <CreditCard className="w-4 h-4" />
                  <span>Continue to Payment</span>
                </>
              )}
            </button>
            
            <button
              onClick={onChangeAmount}
              disabled={isLoading}
              className="w-full px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              Change Top-Up Amount
            </button>
            
            <button
              onClick={onClose}
              disabled={isLoading}
              className="w-full px-6 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TopUpConfirmationModal;

