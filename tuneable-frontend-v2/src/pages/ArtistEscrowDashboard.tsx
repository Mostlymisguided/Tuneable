import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { 
  Coins, 
  Clock, 
  AlertCircle, 
  CheckCircle, 
  Loader2,
  History,
  Search,
  RefreshCw,
  Info,
  X,
  CreditCard,
  Building2,
  Mail,
  Globe
} from 'lucide-react';
import { artistEscrowAPI } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { penceToPounds } from '../utils/currency';

interface EscrowInfo {
  balance: number;
  balancePounds: number;
  totalEscrowEarned?: number;
  totalEscrowEarnedPounds?: number;
  lastPayoutTotalEarned?: number;
  lastPayoutTotalEarnedPounds?: number;
  isFirstPayout?: boolean;
  payoutEligible?: boolean;
  payoutEligibilityReason?: string;
  remainingToEligible?: number;
  remainingToEligiblePounds?: number;
  history: Array<{
    mediaId: string | { _id: string; title: string; coverArt?: string };
    bidId: string | { _id: string; amount: number; createdAt: string };
    amount: number;
    allocatedAt: string;
    claimedAt?: string;
    status: 'pending' | 'claimed';
  }>;
  unclaimedAllocations: Array<{
    _id: string;
    mediaId: string | { _id: string; title: string; coverArt?: string };
    bidId: string | { _id: string; amount: number; createdAt: string };
    amount: number;
    allocatedAt: string;
    artistName: string;
  }>;
}

type PayoutMethod = 'paypal' | 'bank_transfer' | 'wise' | 'stripe' | 'other';

interface PayoutFormData {
  payoutMethod: PayoutMethod;
  amount: string; // Optional, empty means full balance
  // PayPal fields
  paypalEmail: string;
  // Bank Transfer fields
  accountName: string;
  accountNumber: string;
  sortCode: string;
  iban: string;
  swiftCode: string;
  bankName: string;
  // Wise fields
  wiseEmail: string;
  wiseAccountId: string;
  // Other fields
  otherDetails: string;
}

const ArtistEscrowDashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [escrowInfo, setEscrowInfo] = useState<EscrowInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMatching, setIsMatching] = useState(false);
  const [isRequestingPayout, setIsRequestingPayout] = useState(false);
  const [artistName, setArtistName] = useState('');
  const [youtubeChannelId, setYoutubeChannelId] = useState('');
  const [showMatchForm, setShowMatchForm] = useState(false);
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  
  const [payoutForm, setPayoutForm] = useState<PayoutFormData>({
    payoutMethod: 'paypal',
    amount: '',
    paypalEmail: '',
    accountName: '',
    accountNumber: '',
    sortCode: '',
    iban: '',
    swiftCode: '',
    bankName: '',
    wiseEmail: '',
    wiseAccountId: '',
    otherDetails: ''
  });

  useEffect(() => {
    if (user) {
      fetchEscrowInfo();
    }
  }, [user]);

  const fetchEscrowInfo = async () => {
    try {
      setIsLoading(true);
      const response = await artistEscrowAPI.getInfo();
      if (response.success) {
        setEscrowInfo(response.escrow);
        // Pre-fill artist name from creator profile if available
        if (user?.creatorProfile?.artistName && !artistName) {
          setArtistName(user.creatorProfile.artistName);
        }
      }
    } catch (error: any) {
      console.error('Error fetching escrow info:', error);
      toast.error(error.response?.data?.error || 'Failed to load escrow information');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMatch = async () => {
    if (!artistName.trim()) {
      toast.error('Please enter your artist name');
      return;
    }

    try {
      setIsMatching(true);
      const response = await artistEscrowAPI.match(
        artistName.trim(),
        youtubeChannelId.trim() || undefined
      );

      if (response.success) {
        if (response.matched) {
          toast.success(
            `Matched ${response.count} allocation(s) totaling ${penceToPounds(response.totalAmount)}`
          );
          setShowMatchForm(false);
          fetchEscrowInfo(); // Refresh data
        } else {
          toast.info('No matching allocations found');
        }
      }
    } catch (error: any) {
      console.error('Error matching allocations:', error);
      toast.error(error.response?.data?.error || 'Failed to match allocations');
    } finally {
      setIsMatching(false);
    }
  };

  const validatePayoutForm = (): boolean => {
    const { payoutMethod, amount, paypalEmail, accountName, accountNumber, sortCode, iban, wiseEmail, wiseAccountId, otherDetails } = payoutForm;
    
    // Validate amount if provided
    if (amount) {
      const amountNum = parseFloat(amount);
      if (isNaN(amountNum) || amountNum <= 0) {
        toast.error('Please enter a valid amount');
        return false;
      }
      if (amountNum < 1) {
        toast.error('Minimum payout amount is £1.00');
        return false;
      }
      if (escrowInfo && amountNum > escrowInfo.balancePounds) {
        toast.error(`Amount exceeds available balance of ${penceToPounds(escrowInfo.balance)}`);
        return false;
      }
    }

    // Validate method-specific fields
    switch (payoutMethod) {
      case 'paypal':
        if (!paypalEmail.trim()) {
          toast.error('Please enter your PayPal email address');
          return false;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(paypalEmail)) {
          toast.error('Please enter a valid email address');
          return false;
        }
        break;
      
      case 'bank_transfer':
        if (!accountName.trim()) {
          toast.error('Please enter the account holder name');
          return false;
        }
        // Require either UK details (account number + sort code) OR international (IBAN)
        const hasUKDetails = accountNumber.trim() && sortCode.trim();
        const hasInternational = iban.trim();
        if (!hasUKDetails && !hasInternational) {
          toast.error('Please enter either UK bank details (Account Number + Sort Code) or International details (IBAN)');
          return false;
        }
        if (hasUKDetails && (!accountNumber.trim() || !sortCode.trim())) {
          toast.error('Please enter both Account Number and Sort Code for UK transfers');
          return false;
        }
        break;
      
      case 'wise':
        if (!wiseEmail.trim() && !wiseAccountId.trim()) {
          toast.error('Please enter either your Wise email or Wise account ID');
          return false;
        }
        if (wiseEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(wiseEmail)) {
          toast.error('Please enter a valid email address');
          return false;
        }
        break;
      
      case 'other':
        if (!otherDetails.trim()) {
          toast.error('Please provide payment details');
          return false;
        }
        break;
    }

    return true;
  };

  const buildPayoutDetails = (): Record<string, any> => {
    const { payoutMethod, paypalEmail, accountName, accountNumber, sortCode, iban, swiftCode, bankName, wiseEmail, wiseAccountId, otherDetails } = payoutForm;
    
    const details: Record<string, any> = {};

    switch (payoutMethod) {
      case 'paypal':
        details.email = paypalEmail.trim();
        break;
      
      case 'bank_transfer':
        details.accountName = accountName.trim();
        if (accountNumber.trim()) details.accountNumber = accountNumber.trim();
        if (sortCode.trim()) details.sortCode = sortCode.trim();
        if (iban.trim()) details.iban = iban.trim();
        if (swiftCode.trim()) details.swiftCode = swiftCode.trim();
        if (bankName.trim()) details.bankName = bankName.trim();
        break;
      
      case 'wise':
        if (wiseEmail.trim()) details.email = wiseEmail.trim();
        if (wiseAccountId.trim()) details.accountId = wiseAccountId.trim();
        break;
      
      case 'other':
        details.details = otherDetails.trim();
        break;
    }

    return details;
  };

  const handleRequestPayout = async () => {
    if (!escrowInfo || escrowInfo.balance <= 0) {
      toast.error('No escrow balance available for payout');
      return;
    }

    if (!validatePayoutForm()) {
      return;
    }

    try {
      setIsRequestingPayout(true);
      
      const amount = payoutForm.amount ? parseFloat(payoutForm.amount) : undefined;
      const payoutDetails = buildPayoutDetails();
      
      const response = await artistEscrowAPI.requestPayout(
        amount,
        payoutForm.payoutMethod,
        payoutDetails
      );
      
      if (response.success) {
        toast.success(response.message || 'Payout request submitted successfully');
        setShowPayoutModal(false);
        // Reset form
        setPayoutForm({
          payoutMethod: 'paypal',
          amount: '',
          paypalEmail: '',
          accountName: '',
          accountNumber: '',
          sortCode: '',
          iban: '',
          swiftCode: '',
          bankName: '',
          wiseEmail: '',
          wiseAccountId: '',
          otherDetails: ''
        });
        fetchEscrowInfo(); // Refresh data
      }
    } catch (error: any) {
      console.error('Error requesting payout:', error);
      toast.error(error.response?.data?.error || 'Failed to request payout');
    } finally {
      setIsRequestingPayout(false);
    }
  };

  const handlePayoutFormChange = (field: keyof PayoutFormData, value: string) => {
    setPayoutForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
      </div>
    );
  }

  if (!escrowInfo) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-white">Failed to load escrow information</p>
          <button
            onClick={fetchEscrowInfo}
            className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const hasUnclaimed = escrowInfo.unclaimedAllocations.length > 0;
  const hasBalance = escrowInfo.balance > 0;

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Artist Escrow Dashboard</h1>
          <p className="text-gray-400">
            View your escrow balance, allocation history, and request payouts
          </p>
        </div>

        {/* Balance Card */}
        <div className="bg-purple-800/50 rounded-lg p-6 mb-6 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center space-x-2 mb-2">
                <Coins className="h-6 w-6 text-yellow-400" />
                <h2 className="text-xl font-semibold">Escrow Balance</h2>
              </div>
              <p className="text-3xl font-bold text-yellow-400">
                {penceToPounds(escrowInfo.balance)}
              </p>
              <p className="text-sm text-gray-300 mt-2">
                {escrowInfo.history.length} allocation{escrowInfo.history.length !== 1 ? 's' : ''} in history
              </p>
              {escrowInfo.totalEscrowEarned !== undefined && (
                <p className="text-sm text-gray-400 mt-1">
                  Total earned: {penceToPounds(escrowInfo.totalEscrowEarned)}
                </p>
              )}
            </div>
            {hasBalance && (
              <div className="flex flex-col items-end space-y-2">
                <button
                  onClick={() => setShowPayoutModal(true)}
                  disabled={isRequestingPayout || !escrowInfo.payoutEligible}
                  className="px-6 py-3 bg-yellow-500 text-gray-900 font-semibold rounded-lg hover:bg-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                >
                  {isRequestingPayout ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span>Processing...</span>
                    </>
                  ) : (
                    <>
                      <Coins className="h-5 w-5" />
                      <span>Request Payout</span>
                    </>
                  )}
                </button>
                {!escrowInfo.payoutEligible && escrowInfo.payoutEligibilityReason && (
                  <p className="text-xs text-yellow-300 max-w-xs text-right">
                    {escrowInfo.payoutEligibilityReason}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Payout Eligibility Banner */}
        {escrowInfo.payoutEligible !== undefined && (
          <div className={`rounded-lg p-4 mb-6 backdrop-blur-sm ${
            escrowInfo.payoutEligible 
              ? 'bg-green-900/50 border border-green-500' 
              : 'bg-yellow-900/50 border border-yellow-500'
          }`}>
            <div className="flex items-start space-x-3">
              {escrowInfo.payoutEligible ? (
                <CheckCircle className="h-5 w-5 text-green-400 mt-0.5 flex-shrink-0" />
              ) : (
                <AlertCircle className="h-5 w-5 text-yellow-400 mt-0.5 flex-shrink-0" />
              )}
              <div className="flex-1">
                <h3 className={`font-semibold mb-1 ${
                  escrowInfo.payoutEligible ? 'text-green-300' : 'text-yellow-300'
                }`}>
                  {escrowInfo.payoutEligible ? 'Payout Eligible' : 'Payout Not Yet Eligible'}
                </h3>
                <p className="text-sm text-gray-300 mb-2">
                  {escrowInfo.payoutEligibilityReason}
                </p>
                {!escrowInfo.payoutEligible && escrowInfo.remainingToEligible !== undefined && escrowInfo.remainingToEligible > 0 && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-gray-400">Progress to eligibility:</span>
                      <span className="text-yellow-400 font-semibold">
                        {penceToPounds(escrowInfo.remainingToEligible)} remaining
                      </span>
                    </div>
                    {escrowInfo.isFirstPayout ? (
                      <div className="w-full bg-gray-700 rounded-full h-2">
                        <div 
                          className="bg-yellow-500 h-2 rounded-full transition-all"
                          style={{ 
                            width: `${Math.min(100, ((escrowInfo.totalEscrowEarned || 0) / 3300) * 100)}%` 
                          }}
                        />
                      </div>
                    ) : (
                      <div className="w-full bg-gray-700 rounded-full h-2">
                        <div 
                          className="bg-yellow-500 h-2 rounded-full transition-all"
                          style={{ 
                            width: `${Math.min(100, (((escrowInfo.totalEscrowEarned || 0) - (escrowInfo.lastPayoutTotalEarned || 0)) / 1000) * 100)}%` 
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Payout Request Modal */}
        {showPayoutModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[10000] p-4">
            <div className="bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-700">
              <div className="sticky top-0 bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
                <h2 className="text-2xl font-bold text-white">Request Payout</h2>
                <button
                  onClick={() => setShowPayoutModal(false)}
                  className="text-gray-400 hover:text-white transition-colors"
                  disabled={isRequestingPayout}
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                {/* Available Balance Info */}
                <div className="bg-purple-900/30 border border-purple-700 rounded-lg p-4">
                  <p className="text-sm text-gray-300 mb-1">Available Balance</p>
                  <p className="text-2xl font-bold text-yellow-400">
                    {penceToPounds(escrowInfo.balance)}
                  </p>
                </div>

                {/* Amount (Optional) */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Payout Amount (optional)
                  </label>
                  <p className="text-xs text-gray-400 mb-2">
                    Leave empty to request your full balance
                  </p>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">£</span>
                    <input
                      type="number"
                      step="0.01"
                      min="1"
                      max={escrowInfo.balancePounds}
                      value={payoutForm.amount}
                      onChange={(e) => handlePayoutFormChange('amount', e.target.value)}
                      placeholder={escrowInfo.balancePounds.toFixed(2)}
                      className="w-full pl-8 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                      disabled={isRequestingPayout}
                    />
                  </div>
                </div>

                {/* Payout Method */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Payout Method *
                  </label>
                  <select
                    value={payoutForm.payoutMethod}
                    onChange={(e) => handlePayoutFormChange('payoutMethod', e.target.value as PayoutMethod)}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    disabled={isRequestingPayout}
                  >
                    <option value="paypal">PayPal</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="wise">Wise (formerly TransferWise)</option>
                    <option value="stripe">Stripe</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                {/* PayPal Fields */}
                {payoutForm.payoutMethod === 'paypal' && (
                  <div className="space-y-4 bg-blue-900/20 border border-blue-700 rounded-lg p-4">
                    <div className="flex items-center space-x-2 mb-3">
                      <Mail className="h-5 w-5 text-blue-400" />
                      <h3 className="font-semibold text-blue-300">PayPal Details</h3>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        PayPal Email Address *
                      </label>
                      <input
                        type="email"
                        value={payoutForm.paypalEmail}
                        onChange={(e) => handlePayoutFormChange('paypalEmail', e.target.value)}
                        placeholder="your.email@example.com"
                        className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        disabled={isRequestingPayout}
                      />
                    </div>
                  </div>
                )}

                {/* Bank Transfer Fields */}
                {payoutForm.payoutMethod === 'bank_transfer' && (
                  <div className="space-y-4 bg-green-900/20 border border-green-700 rounded-lg p-4">
                    <div className="flex items-center space-x-2 mb-3">
                      <Building2 className="h-5 w-5 text-green-400" />
                      <h3 className="font-semibold text-green-300">Bank Account Details</h3>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Account Holder Name *
                      </label>
                      <input
                        type="text"
                        value={payoutForm.accountName}
                        onChange={(e) => handlePayoutFormChange('accountName', e.target.value)}
                        placeholder="John Doe"
                        className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                        disabled={isRequestingPayout}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          Account Number (UK)
                        </label>
                        <input
                          type="text"
                          value={payoutForm.accountNumber}
                          onChange={(e) => handlePayoutFormChange('accountNumber', e.target.value)}
                          placeholder="12345678"
                          className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                          disabled={isRequestingPayout}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          Sort Code (UK)
                        </label>
                        <input
                          type="text"
                          value={payoutForm.sortCode}
                          onChange={(e) => handlePayoutFormChange('sortCode', e.target.value)}
                          placeholder="12-34-56"
                          className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                          disabled={isRequestingPayout}
                        />
                      </div>
                    </div>
                    <div className="pt-2 border-t border-gray-700">
                      <p className="text-sm text-gray-400 mb-3">Or International Bank Details:</p>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          IBAN
                        </label>
                        <input
                          type="text"
                          value={payoutForm.iban}
                          onChange={(e) => handlePayoutFormChange('iban', e.target.value)}
                          placeholder="GB82 WEST 1234 5698 7654 32"
                          className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                          disabled={isRequestingPayout}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4 mt-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-2">
                            SWIFT/BIC Code
                          </label>
                          <input
                            type="text"
                            value={payoutForm.swiftCode}
                            onChange={(e) => handlePayoutFormChange('swiftCode', e.target.value)}
                            placeholder="NWBKGB2L"
                            className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                            disabled={isRequestingPayout}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-2">
                            Bank Name
                          </label>
                          <input
                            type="text"
                            value={payoutForm.bankName}
                            onChange={(e) => handlePayoutFormChange('bankName', e.target.value)}
                            placeholder="Bank Name"
                            className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                            disabled={isRequestingPayout}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Wise Fields */}
                {payoutForm.payoutMethod === 'wise' && (
                  <div className="space-y-4 bg-purple-900/20 border border-purple-700 rounded-lg p-4">
                    <div className="flex items-center space-x-2 mb-3">
                      <Globe className="h-5 w-5 text-purple-400" />
                      <h3 className="font-semibold text-purple-300">Wise Details</h3>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Wise Email Address
                      </label>
                      <input
                        type="email"
                        value={payoutForm.wiseEmail}
                        onChange={(e) => handlePayoutFormChange('wiseEmail', e.target.value)}
                        placeholder="your.email@example.com"
                        className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                        disabled={isRequestingPayout}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Wise Account ID (optional)
                      </label>
                      <input
                        type="text"
                        value={payoutForm.wiseAccountId}
                        onChange={(e) => handlePayoutFormChange('wiseAccountId', e.target.value)}
                        placeholder="Wise account ID"
                        className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                        disabled={isRequestingPayout}
                      />
                      <p className="text-xs text-gray-400 mt-1">
                        Provide either email or account ID
                      </p>
                    </div>
                  </div>
                )}

                {/* Other Fields */}
                {payoutForm.payoutMethod === 'other' && (
                  <div className="space-y-4 bg-gray-700/50 border border-gray-600 rounded-lg p-4">
                    <div className="flex items-center space-x-2 mb-3">
                      <CreditCard className="h-5 w-5 text-gray-400" />
                      <h3 className="font-semibold text-gray-300">Payment Details</h3>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Payment Details *
                      </label>
                      <textarea
                        value={payoutForm.otherDetails}
                        onChange={(e) => handlePayoutFormChange('otherDetails', e.target.value)}
                        placeholder="Please provide your payment details (e.g., account information, payment method, etc.)"
                        rows={4}
                        className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                        disabled={isRequestingPayout}
                      />
                    </div>
                  </div>
                )}

                {/* Info Note */}
                <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4">
                  <div className="flex items-start space-x-2">
                    <Info className="h-5 w-5 text-blue-400 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-gray-300">
                      <p className="mb-1">
                        <strong className="text-white">Processing Time:</strong> Payouts are processed manually by our team, typically within 3-5 business days.
                      </p>
                      <p>
                        <strong className="text-white">Security:</strong> Your payment details are encrypted and securely stored. We will only use this information to process your payout.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex space-x-3 pt-4">
                  <button
                    onClick={() => setShowPayoutModal(false)}
                    disabled={isRequestingPayout}
                    className="flex-1 px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleRequestPayout}
                    disabled={isRequestingPayout}
                    className="flex-1 px-4 py-3 bg-yellow-500 hover:bg-yellow-400 text-gray-900 font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                  >
                    {isRequestingPayout ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        <span>Submitting...</span>
                      </>
                    ) : (
                      <>
                        <Coins className="h-5 w-5" />
                        <span>Submit Payout Request</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Unclaimed Allocations Alert */}
        {hasUnclaimed && (
          <div className="bg-blue-900/50 border border-blue-500 rounded-lg p-4 mb-6 backdrop-blur-sm">
            <div className="flex items-start space-x-3">
              <AlertCircle className="h-5 w-5 text-blue-400 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-blue-300 mb-1">
                  Unclaimed Allocations Found
                </h3>
                <p className="text-sm text-gray-300 mb-3">
                  We found {escrowInfo.unclaimedAllocations.length} allocation(s) that may belong to you.
                  Match them to add {penceToPounds(
                    escrowInfo.unclaimedAllocations.reduce((sum, a) => sum + a.amount, 0)
                  )} to your escrow balance.
                </p>
                {!showMatchForm ? (
                  <button
                    onClick={() => setShowMatchForm(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                  >
                    Match Allocations
                  </button>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">
                        Artist Name
                      </label>
                      <input
                        type="text"
                        value={artistName}
                        onChange={(e) => setArtistName(e.target.value)}
                        placeholder="Enter your artist name"
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">
                        YouTube Channel ID (optional)
                      </label>
                      <input
                        type="text"
                        value={youtubeChannelId}
                        onChange={(e) => setYoutubeChannelId(e.target.value)}
                        placeholder="e.g., UC..."
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={handleMatch}
                        disabled={isMatching || !artistName.trim()}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                      >
                        {isMatching ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Matching...</span>
                          </>
                        ) : (
                          <>
                            <Search className="h-4 w-4" />
                            <span>Match</span>
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => setShowMatchForm(false)}
                        className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Info Banner */}
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 mb-6 backdrop-blur-sm">
          <div className="flex items-start space-x-3">
            <Info className="h-5 w-5 text-blue-400 mt-0.5" />
            <div className="flex-1 text-sm text-gray-300">
              <p className="mb-2">
                <strong className="text-white">How it works:</strong> When users tip on your media, 70% of the tip amount is allocated to your escrow balance. 
                You can request payouts which are processed manually by our team.
              </p>
              <p>
                <strong className="text-white">Unclaimed allocations:</strong> If you weren't registered when your media received tips, 
                those allocations are stored separately. Match them using your artist name to add them to your balance.
              </p>
            </div>
          </div>
        </div>

        {/* History Section */}
        <div className="bg-gray-800/50 rounded-lg p-6 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <History className="h-5 w-5 text-purple-400" />
              <h2 className="text-xl font-semibold">Allocation History</h2>
            </div>
            <button
              onClick={fetchEscrowInfo}
              className="p-2 text-gray-400 hover:text-white transition-colors"
              title="Refresh"
            >
              <RefreshCw className="h-5 w-5" />
            </button>
          </div>

          {escrowInfo.history.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No allocation history yet</p>
              <p className="text-sm mt-2">Allocations will appear here when users tip on your media</p>
            </div>
          ) : (
            <div className="space-y-3">
              {escrowInfo.history.map((entry, index) => {
                const media = typeof entry.mediaId === 'object' ? entry.mediaId : null;
                
                return (
                  <div
                    key={index}
                    className="bg-gray-700/50 rounded-lg p-4 hover:bg-gray-700/70 transition-colors"
                  >
                    <div className="flex items-start space-x-4">
                      {media?.coverArt && (
                        <img
                          src={media.coverArt}
                          alt={media.title}
                          className="w-16 h-16 rounded-lg object-cover"
                        />
                      )}
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <h3 className="font-semibold text-white">
                            {media?.title || 'Unknown Media'}
                          </h3>
                          <span className="text-lg font-bold text-yellow-400">
                            +{penceToPounds(entry.amount)}
                          </span>
                        </div>
                        <div className="flex items-center space-x-4 text-sm text-gray-400">
                          <span className="flex items-center space-x-1">
                            <Clock className="h-4 w-4" />
                            <span>
                              {new Date(entry.allocatedAt).toLocaleDateString()}
                            </span>
                          </span>
                          <span className={`flex items-center space-x-1 ${
                            entry.status === 'claimed' ? 'text-green-400' : 'text-yellow-400'
                          }`}>
                            {entry.status === 'claimed' ? (
                              <CheckCircle className="h-4 w-4" />
                            ) : (
                              <AlertCircle className="h-4 w-4" />
                            )}
                            <span className="capitalize">{entry.status}</span>
                          </span>
                        </div>
                        {media && (
                          <button
                            onClick={() => navigate(`/tune/${media._id || entry.mediaId}`)}
                            className="mt-2 text-sm text-purple-400 hover:text-purple-300"
                          >
                            View Media →
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ArtistEscrowDashboard;

