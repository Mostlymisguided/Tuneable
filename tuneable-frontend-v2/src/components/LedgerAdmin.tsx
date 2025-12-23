import React, { useState, useEffect } from 'react';
import { ledgerAPI } from '../lib/api';
import { toast } from 'react-toastify';
import { 
  Database, 
  Search, 
  Shield, 
  TrendingUp, 
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
  CheckCircle,
  XCircle,
  Eye,
  DollarSign,
  RefreshCw,
  Clock
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { penceToPounds } from '../utils/currency';

interface LedgerEntry {
  _id: string;
  uuid: string;
  sequence: number;
  userId: {
    _id: string;
    username: string;
    uuid: string;
    email?: string;
  };
  mediaId?: {
    _id: string;
    title: string;
    uuid: string;
  };
  partyId?: {
    _id: string;
    name: string;
  };
  transactionType: 'TIP' | 'REFUND' | 'TOP_UP' | 'PAY_OUT';
  amount: number;
  timestamp: string;
  userBalancePre: number;
  userBalancePost: number;
  userAggregatePre: number;
  userAggregatePost: number;
  userTuneBytesPre?: number | null;
  userTuneBytesPost?: number | null;
  mediaAggregatePre?: number;
  mediaAggregatePost?: number;
  transactionHash: string;
  status: string;
  description?: string;
  username?: string;
  mediaTitle?: string;
  integrityValid?: boolean;
}

interface LedgerStats {
  totalTransactions: number;
  byType: {
    tips: number;
    refunds: number;
    topUps: number;
    payouts: number;
  };
  totalVolume: number;
  totalVolumePounds: string;
  sequenceRange: {
    first: number;
    last: number;
    total: number;
  };
  last24Hours: number;
  recentEntries: any[];
}

const LedgerAdmin: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<LedgerStats | null>(null);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingStats, setLoadingStats] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<LedgerEntry | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<any>(null);

  // Filters
  const [transactionTypeFilter, setTransactionTypeFilter] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [minAmount, setMinAmount] = useState<string>('');
  const [maxAmount, setMaxAmount] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('sequence');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalEntries, setTotalEntries] = useState<number>(0);
  const limit = 50;

  useEffect(() => {
    loadStats();
    loadEntries();
  }, []);

  useEffect(() => {
    loadEntries();
  }, [transactionTypeFilter, startDate, endDate, minAmount, maxAmount, searchQuery, sortBy, sortDirection, page]);

  const loadStats = async () => {
    try {
      setLoadingStats(true);
      const response = await ledgerAPI.getStats();
      setStats(response.stats);
    } catch (error: any) {
      console.error('Error loading ledger stats:', error);
      toast.error('Failed to load ledger statistics');
    } finally {
      setLoadingStats(false);
    }
  };

  const loadEntries = async () => {
    try {
      setLoading(true);
      const params: any = {
        page,
        limit,
        sortBy,
        sortDirection
      };

      if (transactionTypeFilter) params.transactionType = transactionTypeFilter;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      if (minAmount) params.minAmount = Math.round(parseFloat(minAmount) * 100);
      if (maxAmount) params.maxAmount = Math.round(parseFloat(maxAmount) * 100);
      if (searchQuery) params.search = searchQuery;

      const response = await ledgerAPI.getEntries(params);
      setEntries(response.entries || []);
      setTotalPages(response.pagination?.pages || 1);
      setTotalEntries(response.pagination?.total || 0);
    } catch (error: any) {
      console.error('Error loading ledger entries:', error);
      toast.error('Failed to load ledger entries');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyIntegrity = async () => {
    try {
      setVerifying(true);
      setVerificationResult(null);
      const response = await ledgerAPI.verifyIntegrity(1000);
      setVerificationResult(response.verification);
      
      if (response.verification.invalidCount === 0) {
        toast.success('All entries verified successfully!');
      } else {
        toast.warning(`${response.verification.invalidCount} entries failed verification`);
      }
    } catch (error: any) {
      console.error('Error verifying integrity:', error);
      toast.error('Failed to verify ledger integrity');
    } finally {
      setVerifying(false);
    }
  };

  const handleViewEntry = async (entryId: string) => {
    try {
      const response = await ledgerAPI.getEntry(entryId);
      setSelectedEntry(response.entry);
      setShowDetailsModal(true);
    } catch (error: any) {
      console.error('Error loading entry details:', error);
      toast.error('Failed to load entry details');
    }
  };

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDirection('desc');
    }
  };

  const getSortIcon = (field: string) => {
    if (sortBy !== field) {
      return <ArrowUpDown className="h-4 w-4 ml-1 text-gray-400" />;
    }
    return sortDirection === 'asc' 
      ? <ArrowUp className="h-4 w-4 ml-1 text-purple-400" />
      : <ArrowDown className="h-4 w-4 ml-1 text-purple-400" />;
  };

  const getTransactionTypeColor = (type: string) => {
    switch (type) {
      case 'TIP': return 'bg-green-600';
      case 'REFUND': return 'bg-yellow-600';
      case 'TOP_UP': return 'bg-blue-600';
      case 'PAY_OUT': return 'bg-purple-600';
      default: return 'bg-gray-600';
    }
  };

  const formatHash = (hash: string) => {
    if (!hash) return 'N/A';
    return `${hash.substring(0, 8)}...${hash.substring(hash.length - 8)}`;
  };

  const exportToCSV = () => {
    const headers = ['Sequence', 'Timestamp', 'Type', 'User', 'Media', 'Amount', 'Balance Before', 'Balance After', 'Hash'];
    const rows = entries.map(entry => [
      entry.sequence,
      new Date(entry.timestamp).toISOString(),
      entry.transactionType,
      entry.username || entry.userId?.username || 'Unknown',
      entry.mediaTitle || entry.mediaId?.title || 'N/A',
      penceToPounds(entry.amount),
      penceToPounds(entry.userBalancePre),
      penceToPounds(entry.userBalancePost),
      entry.transactionHash
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ledger-export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast.success('Ledger exported to CSV');
  };

  return (
    <div className="space-y-6">
      {/* Dashboard Stats */}
      {!loadingStats && stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Total Transactions</p>
                <p className="text-2xl font-bold text-white mt-1">{stats.totalTransactions.toLocaleString()}</p>
              </div>
              <Database className="h-8 w-8 text-purple-400" />
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Total Volume</p>
                <p className="text-2xl font-bold text-white mt-1">£{stats.totalVolumePounds}</p>
              </div>
              <DollarSign className="h-8 w-8 text-green-400" />
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Sequence Range</p>
                <p className="text-sm font-semibold text-white mt-1">
                  {stats.sequenceRange.first} → {stats.sequenceRange.last}
                </p>
                <p className="text-xs text-gray-400 mt-1">{stats.sequenceRange.total} entries</p>
              </div>
              <TrendingUp className="h-8 w-8 text-blue-400" />
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Last 24 Hours</p>
                <p className="text-2xl font-bold text-white mt-1">{stats.last24Hours}</p>
              </div>
              <Clock className="h-8 w-8 text-yellow-400" />
            </div>
          </div>
        </div>
      )}

      {/* Transaction Type Breakdown */}
      {!loadingStats && stats && (
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Transactions by Type</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-400">{stats.byType.tips}</div>
              <div className="text-sm text-gray-400 mt-1">Tips</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-400">{stats.byType.refunds}</div>
              <div className="text-sm text-gray-400 mt-1">Refunds</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-400">{stats.byType.topUps}</div>
              <div className="text-sm text-gray-400 mt-1">Top-ups</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-400">{stats.byType.payouts}</div>
              <div className="text-sm text-gray-400 mt-1">Payouts</div>
            </div>
          </div>
        </div>
      )}

      {/* Integrity Verification */}
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <Shield className="h-6 w-6 text-purple-400 mr-2" />
            <h3 className="text-lg font-semibold text-white">Integrity Verification</h3>
          </div>
          <button
            onClick={handleVerifyIntegrity}
            disabled={verifying}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {verifying ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Verifying...
              </>
            ) : (
              <>
                <Shield className="h-4 w-4" />
                Verify Integrity
              </>
            )}
          </button>
        </div>

        {verificationResult && (
          <div className={`mt-4 p-4 rounded-lg ${
            verificationResult.invalidCount === 0 ? 'bg-green-900/30 border border-green-600' : 'bg-red-900/30 border border-red-600'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-white">Verification Results</span>
              <span className={`text-sm font-semibold ${
                verificationResult.invalidCount === 0 ? 'text-green-400' : 'text-red-400'
              }`}>
                {verificationResult.integrityPercentage}% Valid
              </span>
            </div>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-gray-400">Total Checked:</span>
                <span className="text-white ml-2 font-semibold">{verificationResult.totalChecked}</span>
              </div>
              <div>
                <span className="text-gray-400">Valid:</span>
                <span className="text-green-400 ml-2 font-semibold">{verificationResult.valid}</span>
              </div>
              <div>
                <span className="text-gray-400">Invalid:</span>
                <span className="text-red-400 ml-2 font-semibold">{verificationResult.invalidCount}</span>
              </div>
            </div>

            {verificationResult.invalidEntries && verificationResult.invalidEntries.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-medium text-red-400 mb-2">Invalid Entries:</p>
                <div className="space-y-1">
                  {verificationResult.invalidEntries.map((entry: any, idx: number) => (
                    <div key={idx} className="text-xs text-gray-300">
                      Sequence {entry.sequence} - {entry.transactionType} - {new Date(entry.timestamp).toLocaleString()}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Filters and Search */}
      <div className="bg-gray-800 rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Transaction Type</label>
            <select
              value={transactionTypeFilter}
              onChange={(e) => {
                setTransactionTypeFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
            >
              <option value="">All Types</option>
              <option value="TIP">Tips</option>
              <option value="REFUND">Refunds</option>
              <option value="TOP_UP">Top-ups</option>
              <option value="PAY_OUT">Payouts</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="User, media, description..."
                className="w-full pl-10 pr-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Min Amount (£)</label>
            <input
              type="number"
              step="0.01"
              value={minAmount}
              onChange={(e) => {
                setMinAmount(e.target.value);
                setPage(1);
              }}
              placeholder="0.00"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Max Amount (£)</label>
            <input
              type="number"
              step="0.01"
              value={maxAmount}
              onChange={(e) => {
                setMaxAmount(e.target.value);
                setPage(1);
              }}
              placeholder="0.00"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
            />
          </div>
        </div>

        <div className="flex items-center justify-between mt-4">
          <button
            onClick={() => {
              setTransactionTypeFilter('');
              setStartDate('');
              setEndDate('');
              setMinAmount('');
              setMaxAmount('');
              setSearchQuery('');
              setPage(1);
            }}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors text-sm"
          >
            Clear Filters
          </button>
          <button
            onClick={exportToCSV}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Entries Table */}
      <div className="bg-gray-800 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">
            Ledger Entries ({totalEntries.toLocaleString()})
          </h3>
          <button
            onClick={loadEntries}
            className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm transition-colors flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="text-center py-8">
            <RefreshCw className="h-8 w-8 animate-spin text-purple-400 mx-auto" />
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-8">
            <Database className="h-12 w-12 text-gray-500 mx-auto mb-4" />
            <p className="text-gray-400">No ledger entries found</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-700">
                <thead className="bg-gray-700">
                  <tr>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-600 transition-colors"
                      onClick={() => handleSort('sequence')}
                    >
                      <div className="flex items-center">
                        Sequence
                        {getSortIcon('sequence')}
                      </div>
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-600 transition-colors"
                      onClick={() => handleSort('timestamp')}
                    >
                      <div className="flex items-center">
                        Timestamp
                        {getSortIcon('timestamp')}
                      </div>
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-600 transition-colors"
                      onClick={() => handleSort('transactionType')}
                    >
                      <div className="flex items-center">
                        Type
                        {getSortIcon('transactionType')}
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Media
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-600 transition-colors"
                      onClick={() => handleSort('amount')}
                    >
                      <div className="flex items-center">
                        Amount
                        {getSortIcon('amount')}
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Balance
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Hash
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-gray-800 divide-y divide-gray-700">
                  {entries.map((entry) => (
                    <tr key={entry._id} className="hover:bg-gray-700/50 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-300">
                        {entry.sequence}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-300">
                        {new Date(entry.timestamp).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-semibold rounded ${getTransactionTypeColor(entry.transactionType)}`}>
                          {entry.transactionType}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <button
                          onClick={() => navigate(`/user/${entry.userId?._id || entry.userId}`)}
                          className="text-sm text-purple-400 hover:text-purple-300 hover:underline"
                        >
                          {entry.username || entry.userId?.username || 'Unknown'}
                        </button>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {entry.mediaTitle || entry.mediaId?.title ? (
                          <button
                            onClick={() => navigate(`/tune/${entry.mediaId?._id || entry.mediaId}`)}
                            className="text-sm text-purple-400 hover:text-purple-300 hover:underline"
                          >
                            {entry.mediaTitle || entry.mediaId?.title}
                          </button>
                        ) : (
                          <span className="text-sm text-gray-500">N/A</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-white">
                        {penceToPounds(entry.amount)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-300">
                        <div className="flex flex-col">
                          <span className="text-xs">Pre: {penceToPounds(entry.userBalancePre)}</span>
                          <span className="text-xs">Post: {penceToPounds(entry.userBalancePost)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-xs text-gray-400 font-mono" title={entry.transactionHash}>
                          {formatHash(entry.transactionHash)}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <button
                          onClick={() => handleViewEntry(entry._id)}
                          className="px-2 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded transition-colors flex items-center gap-1"
                        >
                          <Eye className="h-3 w-3" />
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-gray-700 flex items-center justify-between">
                <div className="text-sm text-gray-400">
                  Page {page} of {totalPages}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Entry Details Modal */}
      {showDetailsModal && selectedEntry && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" style={{ zIndex: 10000 }}>
          <div className="bg-gray-800 rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white">Ledger Entry Details</h3>
              <button
                onClick={() => {
                  setShowDetailsModal(false);
                  setSelectedEntry(null);
                }}
                className="text-gray-400 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-gray-400">Sequence</label>
                  <p className="text-white font-semibold">{selectedEntry.sequence}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-400">UUID</label>
                  <p className="text-white font-mono text-sm">{selectedEntry.uuid}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-400">Transaction Type</label>
                  <span className={`inline-block px-2 py-1 text-xs font-semibold rounded mt-1 ${getTransactionTypeColor(selectedEntry.transactionType)}`}>
                    {selectedEntry.transactionType}
                  </span>
                </div>
                <div>
                  <label className="text-sm text-gray-400">Timestamp</label>
                  <p className="text-white">{new Date(selectedEntry.timestamp).toLocaleString()}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-400">Amount</label>
                  <p className="text-white font-semibold text-lg">{penceToPounds(selectedEntry.amount)}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-400">Status</label>
                  <p className="text-white">{selectedEntry.status || 'confirmed'}</p>
                </div>
              </div>

              <div className="border-t border-gray-700 pt-4">
                <h4 className="text-sm font-semibold text-gray-300 mb-2">Balance Snapshots</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-400">User Balance</label>
                    <div className="text-sm text-white">
                      <div>Pre: {penceToPounds(selectedEntry.userBalancePre)}</div>
                      <div>Post: {penceToPounds(selectedEntry.userBalancePost)}</div>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">User Aggregate</label>
                    <div className="text-sm text-white">
                      <div>Pre: {penceToPounds(selectedEntry.userAggregatePre)}</div>
                      <div>Post: {penceToPounds(selectedEntry.userAggregatePost)}</div>
                    </div>
                  </div>
                  {selectedEntry.userTuneBytesPre !== undefined && selectedEntry.userTuneBytesPre !== null && (
                    <div>
                      <label className="text-xs text-gray-400">User TuneBytes</label>
                      <div className="text-sm text-white">
                        <div>Pre: {selectedEntry.userTuneBytesPre.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                        <div>Post: {selectedEntry.userTuneBytesPost !== null && selectedEntry.userTuneBytesPost !== undefined ? selectedEntry.userTuneBytesPost.toLocaleString(undefined, { maximumFractionDigits: 2 }) : 'N/A'}</div>
                      </div>
                    </div>
                  )}
                  {selectedEntry.mediaAggregatePre !== undefined && (
                    <>
                      <div>
                        <label className="text-xs text-gray-400">Media Aggregate</label>
                        <div className="text-sm text-white">
                          <div>Pre: {penceToPounds(selectedEntry.mediaAggregatePre || 0)}</div>
                          <div>Post: {penceToPounds(selectedEntry.mediaAggregatePost || 0)}</div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="border-t border-gray-700 pt-4">
                <h4 className="text-sm font-semibold text-gray-300 mb-2">Transaction Hash</h4>
                <div className="bg-gray-900 p-3 rounded">
                  <p className="text-xs font-mono text-gray-300 break-all">{selectedEntry.transactionHash}</p>
                  {selectedEntry.integrityValid !== undefined && (
                    <div className="mt-2 flex items-center gap-2">
                      {selectedEntry.integrityValid ? (
                        <>
                          <CheckCircle className="h-4 w-4 text-green-400" />
                          <span className="text-xs text-green-400">Hash verified</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="h-4 w-4 text-red-400" />
                          <span className="text-xs text-red-400">Hash verification failed</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {selectedEntry.description && (
                <div className="border-t border-gray-700 pt-4">
                  <label className="text-sm text-gray-400">Description</label>
                  <p className="text-white">{selectedEntry.description}</p>
                </div>
              )}

              <div className="border-t border-gray-700 pt-4 flex gap-2">
                {selectedEntry.userId && (
                  <button
                    onClick={() => {
                      setShowDetailsModal(false);
                      navigate(`/user/${selectedEntry.userId._id}`);
                    }}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors text-sm"
                  >
                    View User Profile
                  </button>
                )}
                {selectedEntry.mediaId && selectedEntry.mediaId._id && (
                  <button
                    onClick={() => {
                      setShowDetailsModal(false);
                      navigate(`/tune/${selectedEntry.mediaId!._id}`);
                    }}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors text-sm"
                  >
                    View Media
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LedgerAdmin;

