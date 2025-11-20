import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { 
  Coins, 
  Clock, 
  TrendingUp, 
  AlertCircle, 
  CheckCircle, 
  Loader2,
  DollarSign,
  History,
  Search,
  RefreshCw,
  Info
} from 'lucide-react';
import { artistEscrowAPI } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { penceToPounds } from '../utils/currency';

interface EscrowInfo {
  balance: number;
  balancePounds: number;
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

  const handleRequestPayout = async () => {
    if (!escrowInfo || escrowInfo.balance <= 0) {
      toast.error('No escrow balance available for payout');
      return;
    }

    try {
      setIsRequestingPayout(true);
      const response = await artistEscrowAPI.requestPayout();
      
      if (response.success) {
        toast.success(response.message || 'Payout request submitted successfully');
        fetchEscrowInfo(); // Refresh data
      }
    } catch (error: any) {
      console.error('Error requesting payout:', error);
      toast.error(error.response?.data?.error || 'Failed to request payout');
    } finally {
      setIsRequestingPayout(false);
    }
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
            <div>
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
            </div>
            {hasBalance && (
              <button
                onClick={handleRequestPayout}
                disabled={isRequestingPayout}
                className="px-6 py-3 bg-yellow-500 text-gray-900 font-semibold rounded-lg hover:bg-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                {isRequestingPayout ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <DollarSign className="h-5 w-5" />
                    <span>Request Payout</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

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
                const bid = typeof entry.bidId === 'object' ? entry.bidId : null;
                
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

