import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { paymentAPI } from '../lib/api';
import { toast } from 'react-toastify';
import { ArrowLeft, Wallet as WalletIcon, Loader, AlertTriangle, Copy, Check } from 'lucide-react';
import { penceToPounds } from '../utils/currency';
import TopUpConfirmationModal from '../components/TopUpConfirmationModal';

const Wallet: React.FC = () => {
  const navigate = useNavigate();
  const { user, refreshUser, updateBalance } = useAuth();
  const [customAmount, setCustomAmount] = useState('0.30');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedCard, setCopiedCard] = useState<string | null>(null);
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  const [pendingTopUpAmount, setPendingTopUpAmount] = useState<number | null>(null);

  const quickTopUpAmounts = [5, 10, 20, 50];

  // Calculate estimated Stripe fees for display purposes
  // Note: This is an ESTIMATE for user display - actual fees are determined by Stripe
  // and the exact net amount is retrieved from Stripe API in the backend
  // 
  // Current Stripe fee structure (as of 2024):
  // - UK cards: 2.5% + €0.25
  // - EEA standard cards: 1.5% + €0.25  
  // - EEA premium cards: 1.9% + €0.25
  // - International cards: 3.25% + €0.25
  // - +2% if currency conversion required (e.g., customer pays in EUR, you receive GBP)
  //
  // Based on actual transaction data, fees average ~3.5-4% + £0.22 due to:
  // - Currency conversion fees (common when customer pays in different currency)
  // - Mix of card types (UK, EEA, international)
  // - Payment method variations
  // €0.25 ≈ £0.22 (approximate, actual conversion rate may vary)
  const calculateStripeFee = (amount: number): number => {
    // Conservative estimate based on actual transaction data: 3.5% + £0.22
    // This accounts for currency conversion and different card types
    // Actual fees may be slightly lower for pure UK card transactions
    const percentageFee = amount * 0.035; // 3.5% (accounts for conversion fees)
    const fixedFee = 0.22; // £0.22 (€0.25 converted, approximate)
    return percentageFee + fixedFee;
  };

  // Calculate total charge (amount + fees)
  const calculateTotalCharge = (amount: number): number => {
    return amount + calculateStripeFee(amount);
  };

  // Check for payment success/cancel in URL params
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const success = urlParams.get('success');
    const canceled = urlParams.get('canceled');
    const amount = urlParams.get('amount');

    if (success === 'true' && amount) {
      // Wait a moment for webhook to process, then use fallback if needed
      // The backend will check if webhook already processed it and avoid duplicates
      const checkAndUpdateBalance = async () => {
        try {
          // Wait longer for webhook to process (5 seconds) to reduce race conditions
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          // Refresh user data first to get latest balance
          if (refreshUser) {
            await refreshUser();
          }
          
          // Call update-balance endpoint - it will check for existing webhook transaction
          const response = await paymentAPI.updateBalance(parseFloat(amount));
          
          if (response.message === 'Payment already processed by webhook') {
            // Webhook already handled it
            toast.success(`Successfully added £${amount} to your wallet!`);
          } else {
            // Fallback was used (or webhook hadn't processed yet)
            toast.success(`Successfully added £${amount} to your wallet!`);
          }
          
          // Update balance in context
          if (response.balance !== undefined) {
            updateBalance(response.balance);
          } else if (refreshUser) {
            refreshUser();
          }
        } catch (error) {
          console.error('Failed to update balance:', error);
          toast.error('Payment successful but failed to update balance. Please refresh the page.');
        }
      };
      
      checkAndUpdateBalance();
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (canceled === 'true') {
      toast.info('Payment was canceled');
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [refreshUser, updateBalance]);

  const handleTopUpClick = (amount: number) => {
    // Show confirmation modal instead of directly proceeding
    setPendingTopUpAmount(amount);
    setShowConfirmationModal(true);
  };

  const handleConfirmTopUp = async () => {
    if (!pendingTopUpAmount || isLoading) return;
    
    // Check if user is logged in
    if (!user) {
      toast.error('Please log in to top up your wallet');
      navigate('/login');
      return;
    }
    
    const topUpAmount = pendingTopUpAmount;
    const totalCharge = calculateTotalCharge(topUpAmount);
    
    setIsLoading(true);
    setShowConfirmationModal(false);
    
    try {
      // Verify token exists before making request
      const token = localStorage.getItem('token');
      if (!token) {
        toast.error('Please log in to top up your wallet');
        navigate('/login');
        setIsLoading(false);
        return;
      }
      
      // Send both amount (wallet credit) and totalCharge (Stripe charge) to backend
      const response = await paymentAPI.createCheckoutSession(topUpAmount, 'gbp', totalCharge);
      
      if (response.url) {
        // Redirect to Stripe Checkout
        window.location.href = response.url;
      } else {
        throw new Error('No checkout URL received');
      }
    } catch (error: any) {
      console.error('Payment error:', error);
      if (error.response?.status === 401) {
        toast.error('Your session has expired. Please log in again.');
        // Clear invalid token
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/login');
      } else {
        toast.error(error.response?.data?.error || 'Failed to create payment session');
      }
      setIsLoading(false);
    }
    // Note: Don't set isLoading to false here - it will be reset after redirect
  };

  const handleChangeAmount = () => {
    setShowConfirmationModal(false);
    setPendingTopUpAmount(null);
  };

  const handleQuickTopUp = (amount: number) => {
    handleTopUpClick(amount);
  };

  const handleCustomTopUp = () => {
    const amount = parseFloat(customAmount);
    if (isNaN(amount) || amount < 0.30) {
      toast.error('Please enter a valid amount (minimum £0.30)');
      return;
    }
    handleTopUpClick(amount);
  };

  const copyToClipboard = async (text: string, cardType: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCard(cardType);
      toast.success('Card number copied to clipboard!');
      setTimeout(() => setCopiedCard(null), 2000);
    } catch (err) {
      toast.error('Failed to copy card number');
    }
  };


  // Check if beta mode is enabled
  const isBetaMode = import.meta.env.VITE_BETA_MODE === 'true' || import.meta.env.VITE_BETA_MODE === true;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Beta Warning Banner - Commented out for live mode */}
      {/* <BetaWarningBanner variant="full" className="mb-6" /> */}

      {/* Test Card Instructions - Beta Mode Only */}
      {isBetaMode && (
        <div className="card mb-6 border-2 border-yellow-500/50 bg-yellow-500/5">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-yellow-200 mb-2">
                Using Stripe Test Cards
              </h3>
              <p className="text-sm text-yellow-100/90 mb-4">
                When you click "Top Up", you'll be redirected to Stripe Checkout. Use these test card details:
              </p>
              
              <div className="space-y-3">
                {/* Success Card */}
                <div className="bg-black/30 rounded-lg p-4 border border-green-500/30">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-medium text-green-300">✓ Successful Payment</span>
                    </div>
                    <button
                      onClick={() => copyToClipboard('4242 4242 4242 4242', 'success')}
                      className="flex items-center space-x-1 text-xs text-yellow-300 hover:text-yellow-100 transition-colors"
                    >
                      {copiedCard === 'success' ? (
                        <>
                          <Check className="h-3 w-3" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div className="font-mono text-base text-white bg-black/50 p-3 rounded mb-2 select-all">
                    4242 4242 4242 4242
                  </div>
                  <p className="text-xs text-gray-300">
                    Use any future expiry date (e.g., <span className="font-mono">12/34</span>) and any 3-digit CVC (e.g., <span className="font-mono">123</span>)
                  </p>
                </div>

                {/* Other test scenarios */}
                <details className="bg-black/20 rounded-lg p-3 border border-yellow-500/20">
                  <summary className="text-sm font-medium text-yellow-200 cursor-pointer hover:text-yellow-100 transition-colors">
                    Other Test Scenarios
                  </summary>
                  <div className="mt-3 space-y-3">
                    <div className="bg-black/30 rounded p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-red-300">✗ Payment Declined</span>
                        <button
                          onClick={() => copyToClipboard('4000 0000 0000 0002', 'decline')}
                          className="flex items-center space-x-1 text-xs text-yellow-300 hover:text-yellow-100 transition-colors"
                        >
                          {copiedCard === 'decline' ? (
                            <>
                              <Check className="h-3 w-3" />
                              <span>Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                      <div className="font-mono text-sm text-white bg-black/50 p-2 rounded select-all">
                        4000 0000 0000 0002
                      </div>
                    </div>
                    
                    <div className="bg-black/30 rounded p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-blue-300">🔒 3D Secure Authentication</span>
                        <button
                          onClick={() => copyToClipboard('4000 0025 0000 3155', '3ds')}
                          className="flex items-center space-x-1 text-xs text-yellow-300 hover:text-yellow-100 transition-colors"
                        >
                          {copiedCard === '3ds' ? (
                            <>
                              <Check className="h-3 w-3" />
                              <span>Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                      <div className="font-mono text-sm text-white bg-black/50 p-2 rounded select-all">
                        4000 0025 0000 3155
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        Requires additional authentication step
                      </p>
                    </div>
                  </div>
                </details>
              </div>
            </div>
          </div>
        </div>
      )}

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
            <div className="flex items-center space-x-2">
              <p className="text-3xl font-bold text-green-500">{penceToPounds(user?.balance)}</p>
              {isBetaMode && (
                <span className="px-2 py-1 text-xs font-semibold bg-yellow-500/20 text-yellow-300 border border-yellow-500/50 rounded">
                  BETA
                </span>
              )}
            </div>
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
              className="bg-gradient-button text-white font-semibold text-xl py-8 px-12 rounded-lg hover:opacity-90 transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex flex-col items-center justify-center"
              style={{ padding: '2rem 3rem' }}
            >
              {isLoading ? (
                <Loader className="h-5 w-5 animate-spin" />
              ) : (
                <span>£{amount}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Custom Amount Section */}
      <div className="card mb-6">
        <h2 className="text-xl font-semibold text-white mb-6">Custom Amount</h2>
        
        {/* Value Display */}
        <div className="text-center mb-4">
          <div className="text-3xl font-bold text-white mb-2">
            £{parseFloat(customAmount).toFixed(2)}
          </div>
        </div>

        {/* Slider */}
        <div className="mb-6">
          <input
            type="range"
            min="0.30"
            max="1111"
            step="0.10"
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
            style={{
              background: `linear-gradient(to right, #9333ea 0%, #9333ea ${((parseFloat(customAmount) - 0.30) / (1111 - 0.30)) * 100}%, #e5e7eb ${((parseFloat(customAmount) - 0.30) / (1111 - 0.30)) * 100}%, #e5e7eb 100%)`
            }}
          />
          
          {/* Slider Labels */}
          <div className="flex justify-between text-xs text-gray-500 mt-2 mb-4">
            <span>£0.30</span>
            <span>£555</span>
            <span>£1111.00</span>
          </div>
        </div>

        {/* Quick Preset Buttons */}
        <div className="flex flex-wrap justify-center gap-2 mb-8">
          {[5, 10, 25, 50, 100, 500].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setCustomAmount(value.toString())}
              className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                Math.abs(parseFloat(customAmount) - value) < 0.01
                  ? 'bg-purple-100 border-purple-300 text-purple-700'
                  : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
              }`}
            >
              £{value}
            </button>
          ))}
        </div>

        {/* Top Up Button */}
        <div className="flex justify-center mb-4">
          <button
            onClick={handleCustomTopUp}
            disabled={isLoading}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[120px]"
            style={{ padding: '1rem 2.5rem' }}
          >
            {isLoading ? (
              <Loader className="h-4 w-4 animate-spin" />
            ) : (
              'Top Up'
            )}
          </button>
        </div>
        
        <p className="text-gray-400 text-sm text-center">Minimum £0.30 • Maximum £1111.00</p>
      </div>

      {/* Auto Top-Up Settings - Commented out for now */}
      {/* 
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
      */}

      {/* Top-Up Confirmation Modal */}
      {pendingTopUpAmount !== null && (
        <TopUpConfirmationModal
          isOpen={showConfirmationModal}
          onClose={() => {
            setShowConfirmationModal(false);
            setPendingTopUpAmount(null);
          }}
          onConfirm={handleConfirmTopUp}
          onChangeAmount={handleChangeAmount}
          topUpAmount={pendingTopUpAmount}
          stripeFee={calculateStripeFee(pendingTopUpAmount)}
          totalCharge={calculateTotalCharge(pendingTopUpAmount)}
          isLoading={isLoading}
        />
      )}
    </div>
  );
};

export default Wallet;
