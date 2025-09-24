import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { paymentAPI } from '../lib/api';
import { toast } from 'react-toastify';
import { ArrowLeft, Wallet as WalletIcon, Zap, ChevronUp, ChevronDown, Loader } from 'lucide-react';

const Wallet: React.FC = () => {
  const navigate = useNavigate();
  const { user, refreshUser, updateBalance } = useAuth();
  const [customAmount, setCustomAmount] = useState('0.30');
  const [autoTopUp, setAutoTopUp] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const quickTopUpAmounts = [5, 10, 20, 50];

  // Check for payment success/cancel in URL params
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const success = urlParams.get('success');
    const canceled = urlParams.get('canceled');
    const amount = urlParams.get('amount');

    if (success === 'true' && amount) {
      // Manually update balance since webhook might not work in development
      const updateUserBalance = async () => {
        try {
          const response = await paymentAPI.updateBalance(parseFloat(amount));
          toast.success(`Successfully added £${amount} to your wallet!`);
          // Update balance in context
          if (response.balance !== undefined) {
            updateBalance(response.balance);
          } else {
            // Fallback: refresh user data
            if (refreshUser) {
              refreshUser();
            }
          }
        } catch (error) {
          console.error('Failed to update balance:', error);
          toast.error('Payment successful but failed to update balance. Please refresh the page.');
        }
      };
      
      updateUserBalance();
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (canceled === 'true') {
      toast.info('Payment was canceled');
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [refreshUser, updateBalance]);

  const handleTopUp = async (amount: number) => {
    if (isLoading) return;
    
    setIsLoading(true);
    try {
      const response = await paymentAPI.createCheckoutSession(amount, 'gbp');
      
      if (response.url) {
        // Redirect to Stripe Checkout
        window.location.href = response.url;
      } else {
        throw new Error('No checkout URL received');
      }
    } catch (error: any) {
      console.error('Payment error:', error);
      toast.error(error.response?.data?.error || 'Failed to create payment session');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickTopUp = (amount: number) => {
    handleTopUp(amount);
  };

  const handleCustomTopUp = () => {
    const amount = parseFloat(customAmount);
    if (isNaN(amount) || amount < 0.30) {
      toast.error('Please enter a valid amount (minimum £0.30)');
      return;
    }
    handleTopUp(amount);
  };

  const adjustAmount = (increment: boolean) => {
    const currentAmount = parseFloat(customAmount);
    const newAmount = increment ? currentAmount + 0.10 : Math.max(0.30, currentAmount - 0.10);
    setCustomAmount(newAmount.toFixed(2));
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center mb-8">
        <button 
          onClick={() => navigate(-1)}
          className="p-2 rounded-full bg-gray-600 hover:bg-gray-500 transition-colors mr-4"
        >
          <ArrowLeft className="h-5 w-5 text-white" />
        </button>
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Top Up Wallet</h1>
          <p className="text-gray-400">Add funds to your Tuneable wallet</p>
        </div>
      </div>

      {/* Current Balance Card */}
      <div className="card mb-6">
        <div className="flex items-center mb-4">
          <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center mr-4">
            <WalletIcon className="h-6 w-6 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Current Balance</h3>
            <p className="text-3xl font-bold text-green-500">£{user?.balance?.toFixed(2) || '0.00'}</p>
          </div>
        </div>
      </div>

      {/* Quick Top-Up Section */}
      <div className="card mb-6">
        <div className="flex items-center mb-6">
          <WalletIcon className="h-5 w-5 text-white mr-2" />
          <h2 className="text-xl font-semibold text-white">Quick Top-Up</h2>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          {quickTopUpAmounts.map((amount) => (
            <button
              key={amount}
              onClick={() => handleQuickTopUp(amount)}
              disabled={isLoading}
              className="bg-gradient-button text-white font-semibold py-4 px-6 rounded-lg hover:opacity-90 transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center"
            >
              {isLoading ? (
                <Loader className="h-5 w-5 animate-spin" />
              ) : (
                `£${amount}`
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Custom Amount Section */}
      <div className="card mb-6">
        <h2 className="text-xl font-semibold text-white mb-6">Custom Amount</h2>
        
        <div className="flex items-center space-x-4 mb-4">
          <div className="flex-1 relative">
            <input
              type="number"
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              className="w-full bg-gray-700 text-white px-4 py-3 rounded-lg border border-gray-600 focus:border-purple-400 focus:outline-none"
              placeholder="0.00"
              min="0.30"
              step="0.10"
            />
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex flex-col">
              <button
                onClick={() => adjustAmount(true)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <ChevronUp className="h-4 w-4" />
              </button>
              <button
                onClick={() => adjustAmount(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
          </div>
          <button
            onClick={handleCustomTopUp}
            disabled={isLoading}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[100px]"
          >
            {isLoading ? (
              <Loader className="h-4 w-4 animate-spin" />
            ) : (
              'Top Up'
            )}
          </button>
        </div>
        
        <p className="text-gray-400 text-sm">Minimum £0.30</p>
      </div>

      {/* Auto Top-Up Settings */}
      <div className="card">
        <div className="flex items-center mb-4">
          <Zap className="h-5 w-5 text-white mr-2" />
          <h2 className="text-xl font-semibold text-white">Auto Top-Up Settings</h2>
        </div>
        
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-white font-medium mb-1">Enable Auto Top-Up</h3>
            <p className="text-gray-400 text-sm">Automatically top up when balance is low</p>
          </div>
          
          <button
            onClick={() => setAutoTopUp(!autoTopUp)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              autoTopUp ? 'bg-purple-600' : 'bg-gray-600'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                autoTopUp ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Wallet;
