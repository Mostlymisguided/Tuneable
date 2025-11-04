import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Settings, 
  Users, 
  Music, 
  BarChart3, 
  Shield, 
  Database,
  Youtube,
  AlertTriangle,
  Award,
  CheckCircle,
  XCircle,
  Clock,
  Mail,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Building
} from 'lucide-react';
import YouTubeLikedImport from '../components/YouTubeLikedImport';
import InviteRequestsAdmin from '../components/InviteRequestsAdmin';
import ReportsAdmin from '../components/ReportsAdmin';
import { authAPI, creatorAPI, claimAPI, userAPI, mediaAPI, partyAPI, searchAPI, labelAPI } from '../lib/api';
import { toast } from 'react-toastify';
import { penceToPounds } from '../utils/currency';
import { DEFAULT_PROFILE_PIC } from '../constants';

interface User {
  _id: string;
  username: string;
  email?: string;
  role: string[];
  balance: number;
  inviteCredits?: number;
  createdAt: string;
  lastLoginAt?: string;
  oauthVerified?: {
    instagram?: boolean;
    facebook?: boolean;
    soundcloud?: boolean;
    google?: boolean;
  };
}

const Admin: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [creatorApplications, setCreatorApplications] = useState<any[]>([]);
  const [claims, setClaims] = useState<any[]>([]);
  const [isLoadingApplications, setIsLoadingApplications] = useState(false);
  const [isLoadingClaims, setIsLoadingClaims] = useState(false);
  const [sortField, setSortField] = useState<string>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [mediaCount, setMediaCount] = useState<number>(0);
  const [activeParties, setActiveParties] = useState<number>(0);
  const [isLoadingOverview, setIsLoadingOverview] = useState(false);
  const [quotaStatus, setQuotaStatus] = useState<any>(null);
  const [isLoadingQuota, setIsLoadingQuota] = useState(false);
  const [labels, setLabels] = useState<any[]>([]);
  const [isLoadingLabels, setIsLoadingLabels] = useState(false);
  const [labelSortField, setLabelSortField] = useState<string>('createdAt');
  const [labelSortDirection, setLabelSortDirection] = useState<'asc' | 'desc'>('desc');
  const [labelFilterStatus, setLabelFilterStatus] = useState<string>('');
  const [labelSearchQuery, setLabelSearchQuery] = useState<string>('');
  const [vetoedBids, setVetoedBids] = useState<any[]>([]);
  const [isLoadingVetoedBids, setIsLoadingVetoedBids] = useState(false);
  const [vetoedBidsSortField, setVetoedBidsSortField] = useState<string>('vetoedAt');
  const [vetoedBidsSortDirection, setVetoedBidsSortDirection] = useState<'asc' | 'desc'>('desc');
  const [vetoedBidsPage, setVetoedBidsPage] = useState<number>(1);
  const [vetoedBidsTotal, setVetoedBidsTotal] = useState<number>(0);
  const [reportsSubTab, setReportsSubTab] = useState<'media' | 'user' | 'label'>('media');

  useEffect(() => {
    checkAdminStatus();
  }, []);

  const checkAdminStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        navigate('/login');
        return;
      }

      // Use authAPI instead of raw fetch to get correct base URL
      const data = await authAPI.getProfile();
      const userData = data.user || data;
      setUser(userData);
      
      if (userData.role && userData.role.includes('admin')) {
        setIsAdmin(true);
        loadUsers();
        loadCreatorApplications();
        loadClaims();
        loadOverviewStats();
        loadQuotaStatus();
        loadLabels();
      } else {
        setIsAdmin(false);
        navigate('/');
      }
    } catch (error) {
      console.error('Error checking admin status:', error);
      navigate('/login');
    } finally {
      setIsLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const data = await userAPI.getAllUsers();
      setUsers(data.users || []);
    } catch (error) {
      console.error('Error loading users:', error);
      toast.error('Failed to load users');
    }
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      // Toggle direction if clicking same field
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // New field, default to descending
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const getSortedUsers = () => {
    return [...users].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortField) {
        case 'username':
          aValue = a.username?.toLowerCase() || '';
          bValue = b.username?.toLowerCase() || '';
          break;
        case 'email':
          aValue = a.email?.toLowerCase() || '';
          bValue = b.email?.toLowerCase() || '';
          break;
        case 'role':
          aValue = a.role?.[0] || '';
          bValue = b.role?.[0] || '';
          break;
        case 'balance':
          aValue = a.balance || 0;
          bValue = b.balance || 0;
          break;
        case 'inviteCredits':
          aValue = a.inviteCredits ?? 10;
          bValue = b.inviteCredits ?? 10;
          break;
        case 'createdAt':
          aValue = new Date(a.createdAt).getTime();
          bValue = new Date(b.createdAt).getTime();
          break;
        case 'lastLoginAt':
          aValue = a.lastLoginAt ? new Date(a.lastLoginAt).getTime() : 0;
          bValue = b.lastLoginAt ? new Date(b.lastLoginAt).getTime() : 0;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const getSortIcon = (field: string) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-4 w-4 ml-1 text-gray-400" />;
    }
    return sortDirection === 'asc' 
      ? <ArrowUp className="h-4 w-4 ml-1 text-purple-400" />
      : <ArrowDown className="h-4 w-4 ml-1 text-purple-400" />;
  };

  const loadOverviewStats = async () => {
    try {
      setIsLoadingOverview(true);
      const [mediaStats, partyStats] = await Promise.all([
        mediaAPI.getStats(),
        partyAPI.getStats()
      ]);
      setMediaCount(mediaStats.totalMedia || 0);
      setActiveParties(partyStats.activeParties || 0);
    } catch (error) {
      console.error('Error loading overview stats:', error);
      toast.error('Failed to load overview statistics');
    } finally {
      setIsLoadingOverview(false);
    }
  };

  const loadQuotaStatus = async () => {
    try {
      setIsLoadingQuota(true);
      const status = await searchAPI.getQuotaStatus();
      setQuotaStatus(status);
    } catch (error) {
      console.error('Error loading quota status:', error);
      // Don't show error toast for quota status - it's not critical
    } finally {
      setIsLoadingQuota(false);
    }
  };


  const promoteToAdmin = async (userId: string) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/users/make-admin/${userId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        await loadUsers(); // Reload users list
        alert('User promoted to admin successfully!');
      } else {
        alert('Failed to promote user to admin');
      }
    } catch (error) {
      console.error('Error promoting user:', error);
      alert('Error promoting user to admin');
    }
  };

  const loadCreatorApplications = async () => {
    try {
      setIsLoadingApplications(true);
      const response = await creatorAPI.getAllApplications('pending');
      setCreatorApplications(response.applications || []);
    } catch (error) {
      console.error('Error loading creator applications:', error);
      toast.error('Failed to load creator applications');
    } finally {
      setIsLoadingApplications(false);
    }
  };

  const loadClaims = async () => {
    try {
      setIsLoadingClaims(true);
      const response = await claimAPI.getAllClaims('pending');
      setClaims(response.claims || []);
    } catch (error) {
      console.error('Error loading claims:', error);
      toast.error('Failed to load claims');
    } finally {
      setIsLoadingClaims(false);
    }
  };

  const reviewCreatorApplication = async (userId: string, status: 'verified' | 'rejected', reviewNotes?: string) => {
    try {
      await creatorAPI.reviewApplication(userId, status, reviewNotes);
      toast.success(`Application ${status}!`);
      loadCreatorApplications(); // Reload
    } catch (error: any) {
      console.error('Error reviewing application:', error);
      toast.error(error.response?.data?.error || 'Failed to review application');
    }
  };

  const reviewClaim = async (claimId: string, status: 'approved' | 'rejected', reviewNotes?: string) => {
    try {
      await claimAPI.reviewClaim(claimId, status, reviewNotes);
      toast.success(`Claim ${status}!`);
      loadClaims(); // Reload
    } catch (error: any) {
      console.error('Error reviewing claim:', error);
      toast.error(error.response?.data?.error || 'Failed to review claim');
    }
  };

  const handleReplenishCredits = async (userId: string, username: string) => {
    const creditsStr = prompt(`How many invite credits would you like to add to ${username}?`);
    if (!creditsStr) return;
    
    const credits = parseInt(creditsStr);
    if (isNaN(credits) || credits <= 0) {
      toast.error('Please enter a valid positive number');
      return;
    }
    
    try {
      await userAPI.replenishInviteCredits(userId, credits);
      toast.success(`Successfully added ${credits} invite credits to ${username}`);
      loadUsers(); // Reload users list
    } catch (error: any) {
      console.error('Error replenishing credits:', error);
      toast.error(error.response?.data?.error || 'Failed to replenish invite credits');
    }
  };

  const loadLabels = async () => {
    try {
      setIsLoadingLabels(true);
      const params: any = {
        sortBy: labelSortField,
        sortOrder: labelSortDirection,
        page: 1,
        limit: 100
      };
      if (labelFilterStatus) {
        params.verificationStatus = labelFilterStatus;
      }
      if (labelSearchQuery) {
        params.search = labelSearchQuery;
      }
      const data = await labelAPI.getAllLabels(params);
      setLabels(data.labels || []);
    } catch (error) {
      console.error('Error loading labels:', error);
      toast.error('Failed to load labels');
    } finally {
      setIsLoadingLabels(false);
    }
  };

  const handleLabelSort = (field: string) => {
    if (labelSortField === field) {
      setLabelSortDirection(labelSortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setLabelSortField(field);
      setLabelSortDirection('desc');
    }
  };

  useEffect(() => {
    if (activeTab === 'labels' && isAdmin) {
      loadLabels();
    }
  }, [labelSortField, labelSortDirection, labelFilterStatus, labelSearchQuery, activeTab]);

  const loadVetoedBids = async () => {
    try {
      setIsLoadingVetoedBids(true);
      const params: any = {
        page: vetoedBidsPage,
        limit: 50,
        sortBy: vetoedBidsSortField,
        sortOrder: vetoedBidsSortDirection
      };
      const data = await userAPI.getVetoedBids(params);
      setVetoedBids(data.bids || []);
      setVetoedBidsTotal(data.total || 0);
    } catch (error) {
      console.error('Error loading vetoed bids:', error);
      toast.error('Failed to load vetoed bids');
    } finally {
      setIsLoadingVetoedBids(false);
    }
  };

  const handleVetoedBidsSort = (field: string) => {
    if (vetoedBidsSortField === field) {
      setVetoedBidsSortDirection(vetoedBidsSortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setVetoedBidsSortField(field);
      setVetoedBidsSortDirection('desc');
    }
  };

  const getVetoedBidsSortIcon = (field: string) => {
    if (vetoedBidsSortField !== field) {
      return <ArrowUpDown className="h-4 w-4 text-gray-400" />;
    }
    return vetoedBidsSortDirection === 'asc' 
      ? <ArrowUp className="h-4 w-4 text-purple-400" />
      : <ArrowDown className="h-4 w-4 text-purple-400" />;
  };

  useEffect(() => {
    if (activeTab === 'vetoed-bids' && isAdmin) {
      loadVetoedBids();
    }
  }, [vetoedBidsSortField, vetoedBidsSortDirection, vetoedBidsPage, activeTab]);

  const getLabelSortIcon = (field: string) => {
    if (labelSortField !== field) {
      return <ArrowUpDown className="h-4 w-4 ml-1 text-gray-400" />;
    }
    return labelSortDirection === 'asc' 
      ? <ArrowUp className="h-4 w-4 ml-1 text-purple-400" />
      : <ArrowDown className="h-4 w-4 ml-1 text-purple-400" />;
  };

  const handleVerifyLabel = async (labelId: string) => {
    try {
      await labelAPI.verifyLabel(labelId);
      toast.success('Label verified successfully');
      loadLabels();
    } catch (error: any) {
      console.error('Error verifying label:', error);
      toast.error(error.response?.data?.error || 'Failed to verify label');
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  const getVerificationStatusBadge = (status: string) => {
    switch (status) {
      case 'verified':
        return <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs font-medium">Verified</span>;
      case 'pending':
        return <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded text-xs font-medium">Pending</span>;
      case 'rejected':
        return <span className="px-2 py-1 bg-red-500/20 text-red-400 rounded text-xs font-medium">Rejected</span>;
      default:
        return <span className="px-2 py-1 bg-gray-500/20 text-gray-400 rounded text-xs font-medium">Unverified</span>;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <Shield className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
          <p className="text-gray-400">You don't have admin privileges.</p>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'overview', name: 'Overview', icon: BarChart3 },
    { id: 'users', name: 'Users', icon: Users },
    { id: 'labels', name: 'Labels', icon: Building },
    { id: 'vetoed-bids', name: 'Vetoed Bids', icon: XCircle },
    { id: 'creators', name: 'Creator Applications', icon: Award },
    { id: 'claims', name: 'Tune Claims', icon: Music },
    { id: 'reports', name: 'Reports', icon: AlertTriangle },
    { id: 'invites', name: 'Invite Requests', icon: Mail },
    { id: 'media', name: 'Media Import', icon: Youtube },
    { id: 'settings', name: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <Shield className="h-8 w-8 text-purple-400 mr-3" />
              <h1 className="text-xl font-semibold text-white">Admin Panel</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-400">Welcome, {user?.username}</span>
              <button
                onClick={() => navigate('/')}
                className="text-gray-400 hover:text-white transition-colors"
              >
                Back to App
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === tab.id
                      ? 'border-purple-500 text-purple-400'
                      : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300'
                  }`}
                >
                  <Icon className="h-4 w-4 mr-2" />
                  {tab.name}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-white">System Overview</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-gray-800 rounded-lg p-6">
                <div className="flex items-center">
                  <Users className="h-8 w-8 text-blue-400" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-400">Total Users</p>
                    <p className="text-2xl font-bold text-white">{users.length}</p>
                  </div>
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-6">
                <div className="flex items-center">
                  <Music className="h-8 w-8 text-green-400" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-400">Media Items</p>
                    <p className="text-2xl font-bold text-white">
                      {isLoadingOverview ? (
                        <span className="text-gray-500">Loading...</span>
                      ) : (
                        mediaCount.toLocaleString()
                      )}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-6">
                <div className="flex items-center">
                  <Database className="h-8 w-8 text-purple-400" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-400">Active Parties</p>
                    <p className="text-2xl font-bold text-white">
                      {isLoadingOverview ? (
                        <span className="text-gray-500">Loading...</span>
                      ) : (
                        activeParties.toLocaleString()
                      )}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-6">
                <div className="flex items-center">
                  <Youtube className={`h-8 w-8 ${
                    quotaStatus?.status === 'critical' ? 'text-red-400' :
                    quotaStatus?.status === 'warning' ? 'text-yellow-400' :
                    quotaStatus?.status === 'caution' ? 'text-orange-400' :
                    'text-green-400'
                  }`} />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-400">YouTube API Quota</p>
                    <p className="text-2xl font-bold text-white">
                      {isLoadingQuota ? (
                        <span className="text-gray-500">Loading...</span>
                      ) : quotaStatus ? (
                        <>
                          {quotaStatus.usage.toLocaleString()} / {quotaStatus.limit.toLocaleString()}
                          <span className="text-sm ml-2 text-gray-400">
                            ({quotaStatus.percentage.toFixed(1)}%)
                          </span>
                        </>
                      ) : (
                        <span className="text-gray-500">N/A</span>
                      )}
                    </p>
                    {quotaStatus && (
                      <div className="mt-2 w-full bg-gray-700 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full transition-all ${
                            quotaStatus.status === 'critical' ? 'bg-red-500' :
                            quotaStatus.status === 'warning' ? 'bg-yellow-500' :
                            quotaStatus.status === 'caution' ? 'bg-orange-500' :
                            'bg-green-500'
                          }`}
                          style={{ width: `${Math.min(100, quotaStatus.percentage)}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Recent Activity</h3>
              <p className="text-gray-400">No recent activity to display.</p>
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-white">User Management</h2>
            
            <div className="bg-gray-800 rounded-lg overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-700">
                <h3 className="text-lg font-semibold text-white">All Users</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-700">
                  <thead className="bg-gray-700">
                    <tr>
                      <th 
                        className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-600 transition-colors"
                        onClick={() => handleSort('username')}
                      >
                        <div className="flex items-center">
                          User
                          {getSortIcon('username')}
                        </div>
                      </th>
                      <th 
                        className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-600 transition-colors"
                        onClick={() => handleSort('email')}
                      >
                        <div className="flex items-center">
                          Email
                          {getSortIcon('email')}
                        </div>
                      </th>
                      <th 
                        className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-600 transition-colors"
                        onClick={() => handleSort('role')}
                      >
                        <div className="flex items-center">
                          Role
                          {getSortIcon('role')}
                        </div>
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                        OAuth Verified
                      </th>
                      <th 
                        className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-600 transition-colors"
                        onClick={() => handleSort('balance')}
                      >
                        <div className="flex items-center">
                          Balance
                          {getSortIcon('balance')}
                        </div>
                      </th>
                      <th 
                        className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-600 transition-colors"
                        onClick={() => handleSort('inviteCredits')}
                      >
                        <div className="flex items-center">
                          Invite Credits
                          {getSortIcon('inviteCredits')}
                        </div>
                      </th>
                      <th 
                        className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-600 transition-colors"
                        onClick={() => handleSort('createdAt')}
                      >
                        <div className="flex items-center">
                          Joined
                          {getSortIcon('createdAt')}
                        </div>
                      </th>
                      <th 
                        className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-600 transition-colors"
                        onClick={() => handleSort('lastLoginAt')}
                      >
                        <div className="flex items-center">
                          Last Login
                          {getSortIcon('lastLoginAt')}
                        </div>
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-gray-800 divide-y divide-gray-700">
                    {getSortedUsers().map((user) => (
                      <tr key={user._id}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-white">{user.username}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-300">{user.email}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex space-x-1">
                            {user.role.map((role) => (
                              <span
                                key={role}
                                className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                  role === 'admin' 
                                    ? 'bg-red-900 text-red-200' 
                                    : 'bg-gray-600 text-gray-200'
                                }`}
                              >
                                {role}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex space-x-1">
                            {user.oauthVerified?.facebook && (
                              <span 
                                className="inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full bg-blue-900 text-blue-200"
                                title="Facebook verified"
                              >
                                FB
                              </span>
                            )}
                            {user.oauthVerified?.google && (
                              <span 
                                className="inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full bg-red-900 text-red-200"
                                title="Google verified"
                              >
                                G
                              </span>
                            )}
                            {user.oauthVerified?.instagram && (
                              <span 
                                className="inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full bg-pink-900 text-pink-200"
                                title="Instagram verified"
                              >
                                IG
                              </span>
                            )}
                            {user.oauthVerified?.soundcloud && (
                              <span 
                                className="inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full bg-orange-900 text-orange-200"
                                title="SoundCloud verified"
                              >
                                SC
                              </span>
                            )}
                            {(!user.oauthVerified?.facebook && !user.oauthVerified?.google && 
                              !user.oauthVerified?.instagram && !user.oauthVerified?.soundcloud) && (
                              <span className="text-xs text-gray-500">None</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-300">{penceToPounds(user.balance)}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div className={`text-sm font-semibold ${
                              (user.inviteCredits ?? 10) === 0 
                                ? 'text-red-400' 
                                : (user.inviteCredits ?? 10) <= 3 
                                ? 'text-yellow-400' 
                                : 'text-green-400'
                            }`}>
                              {user.inviteCredits ?? 10}
                            </div>
                            {!user.role.includes('admin') && (
                              <button
                                onClick={() => handleReplenishCredits(user._id, user.username)}
                                className="text-xs text-purple-400 hover:text-purple-300 underline"
                                title="Replenish invite credits"
                              >
                                +
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-300">
                            {new Date(user.createdAt).toLocaleDateString()}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-300">
                            {user.lastLoginAt 
                              ? new Date(user.lastLoginAt).toLocaleString()
                              : <span className="text-gray-500">Never</span>}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {!user.role.includes('admin') && (
                            <button
                              onClick={() => promoteToAdmin(user._id)}
                              className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded text-sm transition-colors"
                            >
                              Make Admin
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'labels' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">Label Management</h2>
              <button
                onClick={loadLabels}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
              >
                Refresh
              </button>
            </div>

            {/* Filters */}
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Search by Name
                  </label>
                  <input
                    type="text"
                    value={labelSearchQuery}
                    onChange={(e) => {
                      setLabelSearchQuery(e.target.value);
                      if (e.target.value.length === 0 || e.target.value.length >= 2) {
                        loadLabels();
                      }
                    }}
                    placeholder="Search labels..."
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Verification Status
                  </label>
                  <select
                    value={labelFilterStatus}
                    onChange={(e) => {
                      setLabelFilterStatus(e.target.value);
                      loadLabels();
                    }}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="">All Statuses</option>
                    <option value="unverified">Unverified</option>
                    <option value="pending">Pending</option>
                    <option value="verified">Verified</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
              </div>
            </div>

            {isLoadingLabels ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
              </div>
            ) : labels.length === 0 ? (
              <div className="bg-gray-800 rounded-lg p-8 text-center">
                <Building className="h-12 w-12 text-gray-500 mx-auto mb-4" />
                <p className="text-gray-400">No labels found</p>
              </div>
            ) : (
              <div className="bg-gray-800 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-700">
                    <thead className="bg-gray-700">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                          Label
                        </th>
                        <th 
                          className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-600 transition-colors"
                          onClick={() => handleLabelSort('verificationStatus')}
                        >
                          <div className="flex items-center">
                            Status
                            {getLabelSortIcon('verificationStatus')}
                          </div>
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                          Owner(s)
                        </th>
                        <th 
                          className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-600 transition-colors"
                          onClick={() => handleLabelSort('totalBidAmount')}
                        >
                          <div className="flex items-center">
                            Total Bids
                            {getLabelSortIcon('totalBidAmount')}
                          </div>
                        </th>
                        <th 
                          className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-600 transition-colors"
                          onClick={() => handleLabelSort('artistCount')}
                        >
                          <div className="flex items-center">
                            Artists
                            {getLabelSortIcon('artistCount')}
                          </div>
                        </th>
                        <th 
                          className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-600 transition-colors"
                          onClick={() => handleLabelSort('releaseCount')}
                        >
                          <div className="flex items-center">
                            Releases
                            {getLabelSortIcon('releaseCount')}
                          </div>
                        </th>
                        <th 
                          className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-600 transition-colors"
                          onClick={() => handleLabelSort('createdAt')}
                        >
                          <div className="flex items-center">
                            Created
                            {getLabelSortIcon('createdAt')}
                          </div>
                        </th>
                        <th 
                          className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-600 transition-colors"
                          onClick={() => handleLabelSort('lastBidAt')}
                        >
                          <div className="flex items-center">
                            Last Activity
                            {getLabelSortIcon('lastBidAt')}
                          </div>
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-gray-800 divide-y divide-gray-700">
                      {labels.map((label) => (
                        <tr key={label._id} className="hover:bg-gray-700/50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <img
                                src={label.profilePicture || DEFAULT_PROFILE_PIC}
                                alt={label.name}
                                className="h-10 w-10 rounded-full object-cover mr-3"
                                onError={(e) => {
                                  e.currentTarget.src = DEFAULT_PROFILE_PIC;
                                }}
                              />
                              <div>
                                <div className="text-sm font-medium text-white">{label.name}</div>
                                <div className="text-xs text-gray-400">{label.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {getVerificationStatusBadge(label.verificationStatus)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-300">
                              {label.owners && label.owners.length > 0 ? (
                                <div className="space-y-1">
                                  {label.owners.map((owner: any, idx: number) => (
                                    <div key={idx} className="flex items-center space-x-2">
                                      {owner.profilePic && (
                                        <img
                                          src={owner.profilePic}
                                          alt={owner.username}
                                          className="h-6 w-6 rounded-full object-cover"
                                        />
                                      )}
                                      <span>{owner.username}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-gray-500">No owners</span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-300">
                              {penceToPounds(label.stats?.totalBidAmount || 0)}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-300">
                              {label.stats?.artistCount || 0}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-300">
                              {label.stats?.releaseCount || 0}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-300">
                              {formatDate(label.createdAt)}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-300">
                              {label.stats?.lastBidAt ? formatDate(label.stats.lastBidAt) : 'N/A'}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center space-x-2">
                              {label.verificationStatus !== 'verified' && (
                                <button
                                  onClick={() => handleVerifyLabel(label._id)}
                                  className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded transition-colors"
                                  title="Verify label"
                                >
                                  Verify
                                </button>
                              )}
                              <button
                                onClick={() => navigate(`/label/${label.slug}`)}
                                className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded transition-colors"
                                title="View label"
                              >
                                View
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'vetoed-bids' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">Vetoed Bids</h2>
              <button
                onClick={loadVetoedBids}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
              >
                Refresh
              </button>
            </div>

            {isLoadingVetoedBids ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
              </div>
            ) : vetoedBids.length === 0 ? (
              <div className="bg-gray-800 rounded-lg p-8 text-center">
                <XCircle className="h-12 w-12 text-gray-500 mx-auto mb-4" />
                <p className="text-gray-400">No vetoed bids found</p>
              </div>
            ) : (
              <div className="bg-gray-800 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-700">
                    <thead className="bg-gray-700">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                          Media
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                          User
                        </th>
                        <th 
                          className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-600 transition-colors"
                          onClick={() => handleVetoedBidsSort('amount')}
                        >
                          <div className="flex items-center">
                            Bid Amount
                            {getVetoedBidsSortIcon('amount')}
                          </div>
                        </th>
                        <th 
                          className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-600 transition-colors"
                          onClick={() => handleVetoedBidsSort('createdAt')}
                        >
                          <div className="flex items-center">
                            Date Placed
                            {getVetoedBidsSortIcon('createdAt')}
                          </div>
                        </th>
                        <th 
                          className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-600 transition-colors"
                          onClick={() => handleVetoedBidsSort('vetoedAt')}
                        >
                          <div className="flex items-center">
                            Date Vetoed
                            {getVetoedBidsSortIcon('vetoedAt')}
                          </div>
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                          Vetoed By
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                          Reason
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                          Party
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                          Scope
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-gray-800 divide-y divide-gray-700">
                      {vetoedBids.map((bid) => (
                        <tr key={bid._id} className="hover:bg-gray-700/50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              {bid.media?.coverArt && (
                                <img
                                  src={bid.media.coverArt}
                                  alt={bid.media.title}
                                  className="h-10 w-10 rounded object-cover mr-3"
                                />
                              )}
                              <div>
                                <button
                                  onClick={() => navigate(`/tune/${bid.media._id}`)}
                                  className="text-sm font-medium text-white hover:text-purple-400 transition-colors text-left"
                                >
                                  {bid.media?.title || 'Unknown'}
                                </button>
                                <div className="text-xs text-gray-400">{bid.media?.artist || 'Unknown Artist'}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <button
                              onClick={() => bid.user?.uuid && navigate(`/user/${bid.user.uuid}`)}
                              className="text-sm text-gray-300 hover:text-purple-400 transition-colors"
                            >
                              {bid.user?.username || 'Unknown'}
                            </button>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-green-400">
                              {penceToPounds(bid.amount)}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-300">
                              {bid.createdAt ? new Date(bid.createdAt).toLocaleString() : 'N/A'}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-300">
                              {bid.vetoedAt ? new Date(bid.vetoedAt).toLocaleString() : 'N/A'}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-300">
                              {bid.vetoedBy?.username || 'Unknown'}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm text-gray-300 max-w-xs truncate" title={bid.vetoedReason || ''}>
                              {bid.vetoedReason || 'No reason provided'}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-300">
                              {bid.party?.name || 'Unknown'}
                            </div>
                            <div className="text-xs text-gray-500">
                              {bid.party?.type || 'unknown'}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-xs text-gray-400 uppercase">
                              {bid.bidScope || 'party'}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {vetoedBidsTotal > 50 && (
                  <div className="px-6 py-4 bg-gray-700 border-t border-gray-600 flex items-center justify-between">
                    <div className="text-sm text-gray-300">
                      Showing {((vetoedBidsPage - 1) * 50) + 1} - {Math.min(vetoedBidsPage * 50, vetoedBidsTotal)} of {vetoedBidsTotal}
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => setVetoedBidsPage(p => Math.max(1, p - 1))}
                        disabled={vetoedBidsPage === 1}
                        className="px-3 py-1 bg-gray-600 hover:bg-gray-500 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Previous
                      </button>
                      <button
                        onClick={() => setVetoedBidsPage(p => p + 1)}
                        disabled={vetoedBidsPage * 50 >= vetoedBidsTotal}
                        className="px-3 py-1 bg-gray-600 hover:bg-gray-500 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'creators' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">Creator Applications</h2>
              <button
                onClick={loadCreatorApplications}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
              >
                Refresh
              </button>
            </div>
            
            {isLoadingApplications ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
              </div>
            ) : creatorApplications.length === 0 ? (
              <div className="bg-gray-800 rounded-lg p-8 text-center">
                <Clock className="h-12 w-12 text-gray-500 mx-auto mb-4" />
                <p className="text-gray-400">No pending creator applications</p>
              </div>
            ) : (
              <div className="space-y-4">
                {creatorApplications.map((app) => (
                  <div key={app._id} className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center space-x-4">
                        {app.profilePic && (
                          <img
                            src={app.profilePic}
                            alt={app.username}
                            className="w-16 h-16 rounded-full object-cover"
                          />
                        )}
                        <div>
                          <h3 className="text-xl font-bold text-white">{app.creatorProfile?.artistName}</h3>
                          <p className="text-gray-400">@{app.username} • {app.email}</p>
                          <p className="text-sm text-gray-500">
                            Applied: {new Date(app.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      
                      <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                        app.creatorProfile?.verificationStatus === 'pending'
                          ? 'bg-yellow-900 text-yellow-200'
                          : app.creatorProfile?.verificationStatus === 'verified'
                          ? 'bg-green-900 text-green-200'
                          : 'bg-red-900 text-red-200'
                      }`}>
                        {app.creatorProfile?.verificationStatus?.toUpperCase()}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <p className="text-sm text-gray-400">Roles:</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {app.creatorProfile?.roles?.map((role: string) => (
                            <span key={role} className="px-2 py-1 bg-purple-900 text-purple-200 text-xs rounded-full">
                              {role}
                            </span>
                          ))}
                        </div>
                      </div>
                      
                      <div>
                        <p className="text-sm text-gray-400">Genres:</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {app.creatorProfile?.genres?.slice(0, 3).map((genre: string) => (
                            <span key={genre} className="px-2 py-1 bg-blue-900 text-blue-200 text-xs rounded-full">
                              {genre}
                            </span>
                          ))}
                          {app.creatorProfile?.genres?.length > 3 && (
                            <span className="px-2 py-1 bg-gray-700 text-gray-300 text-xs rounded-full">
                              +{app.creatorProfile.genres.length - 3}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mb-4">
                      <p className="text-sm text-gray-400 mb-2">Bio:</p>
                      <p className="text-gray-300 text-sm">{app.creatorProfile?.bio}</p>
                    </div>

                    {app.creatorProfile?.socialMedia && Object.entries(app.creatorProfile.socialMedia).some(([_, v]) => v) && (
                      <div className="mb-4">
                        <p className="text-sm text-gray-400 mb-2">Social Media:</p>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(app.creatorProfile.socialMedia).map(([platform, url]: [string, any]) => 
                            url ? (
                              <a
                                key={platform}
                                href={url as string}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-purple-400 hover:text-purple-300"
                              >
                                {platform}
                              </a>
                            ) : null
                          )}
                        </div>
                      </div>
                    )}

                    {app.creatorProfile?.proofFiles && app.creatorProfile.proofFiles.length > 0 && (
                      <div className="mb-4">
                        <p className="text-sm text-gray-400 mb-2">Proof Documents:</p>
                        <div className="flex flex-wrap gap-2">
                          {app.creatorProfile.proofFiles.map((file: any, idx: number) => (
                            <a
                              key={idx}
                              href={file.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded transition-colors"
                            >
                              Document {idx + 1}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex space-x-3 pt-4 border-t border-gray-700">
                      <button
                        onClick={() => {
                          const notes = prompt('Add review notes (optional):');
                          reviewCreatorApplication(app._id, 'verified', notes || '');
                        }}
                        className="flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Approve
                      </button>
                      <button
                        onClick={() => {
                          const notes = prompt('Add rejection reason:');
                          if (notes) {
                            reviewCreatorApplication(app._id, 'rejected', notes);
                          }
                        }}
                        className="flex items-center px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'claims' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">Tune Claims</h2>
              <button
                onClick={loadClaims}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
              >
                Refresh
              </button>
            </div>
            
            {isLoadingClaims ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
              </div>
            ) : claims.length === 0 ? (
              <div className="bg-gray-800 rounded-lg p-8 text-center">
                <Music className="h-12 w-12 text-gray-500 mx-auto mb-4" />
                <p className="text-gray-400">No pending tune claims</p>
              </div>
            ) : (
              <div className="space-y-4">
                {claims.map((claim) => (
                  <div key={claim._id} className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center space-x-4">
                        {claim.mediaId?.coverArt && (
                          <img
                            src={claim.mediaId.coverArt}
                            alt={claim.mediaId.title}
                            className="w-16 h-16 rounded object-cover"
                          />
                        )}
                        <div>
                          <h3 className="text-xl font-bold text-white">{claim.mediaId?.title}</h3>
                          <p className="text-gray-400">{claim.mediaId?.artist?.[0]?.name || claim.mediaId?.artist}</p>
                          <p className="text-sm text-gray-500">
                            Claimed by: @{claim.userId?.username} ({claim.userId?.email})
                          </p>
                          <p className="text-sm text-gray-500">
                            Submitted: {new Date(claim.submittedAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mb-4">
                      <p className="text-sm text-gray-400 mb-2">Proof:</p>
                      <p className="text-gray-300 text-sm">{claim.proofText}</p>
                    </div>

                    {claim.proofFiles && claim.proofFiles.length > 0 && (
                      <div className="mb-4">
                        <p className="text-sm text-gray-400 mb-2">Documents:</p>
                        <div className="flex flex-wrap gap-2">
                          {claim.proofFiles.map((file: any, idx: number) => (
                            <a
                              key={idx}
                              href={file.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded transition-colors"
                            >
                              Document {idx + 1}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex space-x-3 pt-4 border-t border-gray-700">
                      <button
                        onClick={() => {
                          const notes = prompt('Add review notes (optional):');
                          reviewClaim(claim._id, 'approved', notes || '');
                        }}
                        className="flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Approve
                      </button>
                      <button
                        onClick={() => {
                          const notes = prompt('Add rejection reason:');
                          if (notes) {
                            reviewClaim(claim._id, 'rejected', notes);
                          }
                        }}
                        className="flex items-center px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'reports' && (
          <div className="space-y-6">
            {/* Sub-tabs for Reports */}
            <div className="bg-gray-800 border-b border-gray-700">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <nav className="flex space-x-8">
                  <button
                    onClick={() => setReportsSubTab('media')}
                    className={`flex items-center py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                      reportsSubTab === 'media'
                        ? 'border-purple-500 text-purple-400'
                        : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300'
                    }`}
                  >
                    <Music className="h-4 w-4 mr-2" />
                    <span>Tune Reports</span>
                  </button>
                  <button
                    onClick={() => setReportsSubTab('user')}
                    className={`flex items-center py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                      reportsSubTab === 'user'
                        ? 'border-purple-500 text-purple-400'
                        : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300'
                    }`}
                  >
                    <Users className="h-4 w-4 mr-2" />
                    <span>User Reports</span>
                  </button>
                  <button
                    onClick={() => setReportsSubTab('label')}
                    className={`flex items-center py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                      reportsSubTab === 'label'
                        ? 'border-purple-500 text-purple-400'
                        : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300'
                    }`}
                  >
                    <Building className="h-4 w-4 mr-2" />
                    <span>Label Reports</span>
                  </button>
                </nav>
              </div>
            </div>
            
            {/* Reports Content */}
            <ReportsAdmin reportType={reportsSubTab} />
          </div>
        )}

        {activeTab === 'invites' && (
          <div>
            <InviteRequestsAdmin />
          </div>
        )}

        {activeTab === 'media' && (
          <div className="space-y-6">
            <div className="flex items-center mb-6">
              <Youtube className="h-8 w-8 text-red-500 mr-3" />
              <h2 className="text-2xl font-bold text-white">Media Import</h2>
            </div>
            
            <div className="bg-yellow-900 border border-yellow-700 rounded-lg p-4 mb-6">
              <div className="flex items-center">
                <AlertTriangle className="h-5 w-5 text-yellow-400 mr-2" />
                <span className="text-yellow-200">
                  <strong>Admin Only Feature:</strong> This tool allows bulk importing of YouTube liked videos. 
                  Use responsibly and monitor API quota usage.
                </span>
              </div>
            </div>

            <YouTubeLikedImport />
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-white">System Settings</h2>
            
            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Configuration</h3>
              <p className="text-gray-400">System settings and configuration options will be available here.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Admin;
