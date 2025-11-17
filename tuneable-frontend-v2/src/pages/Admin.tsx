import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  Building,
  Bell,
  DollarSign
} from 'lucide-react';
import YouTubeLikedImport from '../components/YouTubeLikedImport';
import InviteRequestsAdmin from '../components/InviteRequestsAdmin';
import ReportsAdmin from '../components/ReportsAdmin';
import NotificationsManager from '../components/NotificationsManager';
import IssueWarningModal from '../components/IssueWarningModal';
import { authAPI, creatorAPI, claimAPI, userAPI, mediaAPI, partyAPI, searchAPI, labelAPI, reportAPI } from '../lib/api';
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
  const [, setAdminSettings] = useState<any>(null);
  const [threshold, setThreshold] = useState(95);
  const [thresholdEnabled, setThresholdEnabled] = useState(true);
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
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
  const [bids, setBids] = useState<any[]>([]);
  const [isLoadingBids, setIsLoadingBids] = useState(false);
  const [bidsSortField, setBidsSortField] = useState<string>('createdAt');
  const [bidsSortDirection, setBidsSortDirection] = useState<'asc' | 'desc'>('desc');
  const [bidsPage, setBidsPage] = useState<number>(1);
  const [bidsTotal, setBidsTotal] = useState<number>(0);
  const [bidsStatusFilter, setBidsStatusFilter] = useState<string>('');
  const [bidsSearchQuery, setBidsSearchQuery] = useState<string>('');
  const [bidsScopeFilter, setBidsScopeFilter] = useState<string>('');
  const [mediaList, setMediaList] = useState<any[]>([]);
  const [isLoadingMedia, setIsLoadingMedia] = useState(false);
  const [mediaSortField, setMediaSortField] = useState<string>('uploadedAt');
  const [mediaSortDirection, setMediaSortDirection] = useState<'asc' | 'desc'>('desc');
  const [mediaPage, setMediaPage] = useState<number>(1);
  const [mediaTotal, setMediaTotal] = useState<number>(0);
  const [mediaContentTypeFilter, setMediaContentTypeFilter] = useState<string>('');
  const [mediaContentFormFilter, setMediaContentFormFilter] = useState<string>('');
  const [mediaSearchQuery, setMediaSearchQuery] = useState<string>('');
  const [mediaRightsFilter, setMediaRightsFilter] = useState<string>('');
  const [editingMediaId, setEditingMediaId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<'title' | 'artist' | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');
  const [reportsSubTab, setReportsSubTab] = useState<'media' | 'user' | 'label' | 'collective' | 'claims' | 'invites' | 'applications'>('media');
  const [reportsSummary, setReportsSummary] = useState<Record<'media' | 'user' | 'label' | 'collective' | 'claims' | 'applications' | 'invites', number>>({
    media: 0,
    user: 0,
    label: 0,
    collective: 0,
    claims: 0,
    applications: 0,
    invites: 0,
  });

  const hasReportsNotifications = useMemo(() => {
    return Object.values(reportsSummary).some((count) => count > 0);
  }, [reportsSummary]);

  // Warning modal state
  const [warningModalOpen, setWarningModalOpen] = useState(false);
  const [selectedUserForWarning, setSelectedUserForWarning] = useState<{ id: string; username: string } | null>(null);

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
        loadAdminSettings();
        loadLabels();
        refreshReportCounts();
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

  const refreshReportCounts = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const [mediaRes, userRes, labelRes, collectiveRes, invitesRes] = await Promise.all([
        reportAPI.getReports('pending', undefined, 'media', 1, 0),
        reportAPI.getReports('pending', undefined, 'user', 1, 0),
        reportAPI.getReports('pending', undefined, 'label', 1, 0),
        reportAPI.getReports('pending', undefined, 'collective', 1, 0),
        userAPI.getInviteRequests('pending'),
      ]);

      setReportsSummary((prev) => ({
        ...prev,
        media: mediaRes.total ?? mediaRes.reports?.length ?? 0,
        user: userRes.total ?? userRes.reports?.length ?? 0,
        label: labelRes.total ?? labelRes.reports?.length ?? 0,
        collective: collectiveRes.total ?? collectiveRes.reports?.length ?? 0,
        invites: Array.isArray(invitesRes.requests)
          ? invitesRes.requests.filter((req: any) => req.status === 'pending').length
          : 0,
      }));
    } catch (error) {
      console.error('Error refreshing report counts:', error);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin) {
      void refreshReportCounts();
    }
  }, [isAdmin, reportsSubTab, refreshReportCounts]);

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

  const loadAdminSettings = async () => {
    try {
      setIsLoadingSettings(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}/api/search/admin/settings`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const settings = await response.json();
        setAdminSettings(settings);
        setThreshold(settings.youtubeQuota?.disableSearchThreshold || 95);
        setThresholdEnabled(settings.youtubeQuota?.enabled !== false);
      }
    } catch (error) {
      console.error('Error loading admin settings:', error);
    } finally {
      setIsLoadingSettings(false);
    }
  };

  const saveAdminSettings = async () => {
    try {
      setIsSavingSettings(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}/api/search/admin/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          youtubeQuota: {
            disableSearchThreshold: threshold,
            enabled: thresholdEnabled
          }
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        toast.success('Settings saved successfully');
        setAdminSettings(result.settings);
        // Reload quota status to reflect new threshold
        loadQuotaStatus();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to save settings');
      }
    } catch (error) {
      console.error('Error saving admin settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setIsSavingSettings(false);
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
      const pendingApps = response.applications || [];
      setCreatorApplications(pendingApps);
      setReportsSummary((prev) => ({
        ...prev,
        applications: pendingApps.length,
      }));
    } catch (error) {
      console.error('Error loading creator applications:', error);
      toast.error('Failed to load creator applications');
      setReportsSummary((prev) => ({
        ...prev,
        applications: 0,
      }));
    } finally {
      setIsLoadingApplications(false);
    }
  };

  const loadClaims = async () => {
    try {
      setIsLoadingClaims(true);
      const response = await claimAPI.getAllClaims('pending');
      const pendingClaims = response.claims || [];
      setClaims(pendingClaims);
      setReportsSummary((prev) => ({
        ...prev,
        claims: pendingClaims.length,
      }));
    } catch (error) {
      console.error('Error loading claims:', error);
      toast.error('Failed to load claims');
      setReportsSummary((prev) => ({
        ...prev,
        claims: 0,
      }));
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

  const loadBids = async () => {
    try {
      setIsLoadingBids(true);
      const params: any = {
        page: bidsPage,
        limit: 50,
        sortBy: bidsSortField,
        sortOrder: bidsSortDirection
      };
      if (bidsStatusFilter) {
        params.status = bidsStatusFilter;
      }
      if (bidsSearchQuery) {
        params.search = bidsSearchQuery;
      }
      if (bidsScopeFilter) {
        params.bidScope = bidsScopeFilter;
      }
      const data = await userAPI.getAllBids(params);
      setBids(data.bids || []);
      setBidsTotal(data.total || 0);
    } catch (error) {
      console.error('Error loading bids:', error);
      toast.error('Failed to load bids');
    } finally {
      setIsLoadingBids(false);
    }
  };

  const handleBidsSort = (field: string) => {
    if (bidsSortField === field) {
      setBidsSortDirection(bidsSortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setBidsSortField(field);
      setBidsSortDirection('desc');
    }
  };

  const getBidsSortIcon = (field: string) => {
    if (bidsSortField !== field) {
      return <ArrowUpDown className="h-4 w-4 text-gray-400" />;
    }
    return bidsSortDirection === 'asc' 
      ? <ArrowUp className="h-4 w-4 text-purple-400" />
      : <ArrowDown className="h-4 w-4 text-purple-400" />;
  };

  useEffect(() => {
    if (activeTab === 'bids' && isAdmin) {
      loadBids();
    }
  }, [bidsSortField, bidsSortDirection, bidsPage, bidsStatusFilter, bidsSearchQuery, bidsScopeFilter, activeTab]);

  const loadMedia = async () => {
    try {
      setIsLoadingMedia(true);
      const params: any = {
        page: mediaPage,
        limit: 50,
        sortBy: mediaSortField,
        sortOrder: mediaSortDirection
      };
      if (mediaContentTypeFilter) {
        params.contentType = mediaContentTypeFilter;
      }
      if (mediaContentFormFilter) {
        params.contentForm = mediaContentFormFilter;
      }
      if (mediaSearchQuery) {
        params.search = mediaSearchQuery;
      }
      if (mediaRightsFilter !== '') {
        params.rightsCleared = mediaRightsFilter === 'true';
      }
      const data = await mediaAPI.getAllMedia(params);
      setMediaList(data.media || []);
      setMediaTotal(data.total || 0);
    } catch (error) {
      console.error('Error loading media:', error);
      toast.error('Failed to load media');
    } finally {
      setIsLoadingMedia(false);
    }
  };

  const handleMediaSort = (field: string) => {
    if (mediaSortField === field) {
      setMediaSortDirection(mediaSortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setMediaSortField(field);
      setMediaSortDirection('desc');
    }
  };

  const getMediaSortIcon = (field: string) => {
    if (mediaSortField !== field) {
      return <ArrowUpDown className="h-4 w-4 text-gray-400" />;
    }
    return mediaSortDirection === 'asc' 
      ? <ArrowUp className="h-4 w-4 text-purple-400" />
      : <ArrowDown className="h-4 w-4 text-purple-400" />;
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return 'N/A';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleStartEdit = (mediaId: string, field: 'title' | 'artist', currentValue: string) => {
    setEditingMediaId(mediaId);
    setEditingField(field);
    setEditingValue(currentValue);
  };

  const handleCancelEdit = () => {
    setEditingMediaId(null);
    setEditingField(null);
    setEditingValue('');
  };

  const handleSaveEdit = async (mediaId: string, field: 'title' | 'artist') => {
    if (!editingValue.trim()) {
      toast.error(`${field === 'title' ? 'Title' : 'Artist'} cannot be empty`);
      return;
    }

    try {
      const updates: { title?: string; artist?: string } = {};
      updates[field] = editingValue.trim();
      
      await mediaAPI.updateMedia(mediaId, updates);
      toast.success(`${field === 'title' ? 'Title' : 'Artist'} updated successfully`);
      handleCancelEdit();
      loadMedia(); // Reload to get updated data
    } catch (error: any) {
      console.error('Error updating media:', error);
      toast.error(error.response?.data?.error || `Failed to update ${field}`);
    }
  };

  useEffect(() => {
    if (activeTab === 'media-management' && isAdmin) {
      loadMedia();
    }
  }, [mediaSortField, mediaSortDirection, mediaPage, mediaContentTypeFilter, mediaContentFormFilter, mediaSearchQuery, mediaRightsFilter, activeTab]);

  useEffect(() => {
    if (activeTab === 'reports' && isAdmin) {
      if (reportsSubTab === 'claims') {
        loadClaims();
      } else if (reportsSubTab === 'applications') {
        loadCreatorApplications();
      }
    }
  }, [activeTab, reportsSubTab, isAdmin]);

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
    { id: 'bids', name: 'Bids', icon: DollarSign },
    { id: 'media-management', name: 'Media', icon: Music },
    { id: 'vetoed-bids', name: 'Vetoes', icon: XCircle },
    { id: 'reports', name: 'Reports + Apps + Claims', icon: AlertTriangle, hasNotification: hasReportsNotifications },
    { id: 'notifications', name: 'Notifications', icon: Bell },
    { id: 'media', name: 'Media Import', icon: Youtube },
    { id: 'settings', name: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <div className="flex items-center">
                <Shield className="h-8 w-8 text-purple-400 mr-3" />
                <h1 className="text-xl font-semibold text-white">Admin Panel</h1>
              </div>
              <button
                onClick={() => navigate('/create-party')}
                className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Create Party
              </button>
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
                  <span className="flex items-center">
                    {tab.name}
                    {tab.hasNotification && (
                      <span className="ml-2 flex items-center">
                        <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                      </span>
                    )}
                  </span>
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
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
                <Settings className="h-5 w-5 mr-2" />
                YouTube Search Settings
              </h3>
              
              {isLoadingSettings ? (
                <p className="text-gray-400">Loading settings...</p>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={thresholdEnabled}
                        onChange={(e) => setThresholdEnabled(e.target.checked)}
                        className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-blue-600 focus:ring-blue-500 focus:ring-2"
                      />
                      <span className="text-white">Enable quota threshold protection</span>
                    </label>
                    <p className="text-sm text-gray-400 ml-7 mt-1">
                      When enabled, YouTube search will be disabled when quota usage reaches the threshold below.
                    </p>
                  </div>
                  
                  {thresholdEnabled && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-gray-300">
                          Disable search at threshold: <span className="text-white font-bold">{threshold}%</span>
                        </label>
                        {quotaStatus && (
                          <span className={`text-sm font-medium ${
                            quotaStatus.percentage >= threshold ? 'text-red-400' : 'text-gray-400'
                          }`}>
                            Current: {quotaStatus.percentage.toFixed(1)}%
                          </span>
                        )}
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={threshold}
                        onChange={(e) => setThreshold(Number(e.target.value))}
                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                      />
                      <div className="flex justify-between text-xs text-gray-500 mt-1">
                        <span>0%</span>
                        <span>50%</span>
                        <span>100%</span>
                      </div>
                      <p className="text-sm text-gray-400 mt-2">
                        When quota usage reaches {threshold}%, YouTube search will be automatically disabled. 
                        Users can still paste YouTube URLs directly (uses 100x fewer credits).
                      </p>
                    </div>
                  )}
                  
                  <button
                    onClick={saveAdminSettings}
                    disabled={isSavingSettings}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-2 rounded transition-colors"
                  >
                    {isSavingSettings ? 'Saving...' : 'Save Settings'}
                  </button>
                  
                  {quotaStatus?.searchDisabled && (
                    <div className="mt-4 p-3 bg-red-900/30 border border-red-700 rounded">
                      <p className="text-sm text-red-300">
                        ⚠️ YouTube search is currently <strong>disabled</strong> because quota ({quotaStatus.percentage.toFixed(1)}%) has reached the threshold ({quotaStatus.threshold}%).
                      </p>
                    </div>
                  )}
                </div>
              )}
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
                        Warnings
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
                          <button
                            onClick={() => navigate(`/user/${user._id}`)}
                            className="text-sm font-medium text-white hover:text-purple-300 underline"
                            title="View profile"
                          >
                            {user.username}
                          </button>
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
                          <div className="flex items-center space-x-2">
                            {(user as any).warningCount > 0 && (
                              <span className="text-xs text-yellow-400 font-semibold">
                                {(user as any).warningCount} warn{(user as any).warningCount !== 1 ? 'ings' : 'ing'}
                              </span>
                            )}
                            {(user as any).finalWarningCount > 0 && (
                              <span className="text-xs text-red-400 font-semibold">
                                {(user as any).finalWarningCount} final
                              </span>
                            )}
                            {(!(user as any).warningCount || (user as any).warningCount === 0) && (
                              <span className="text-xs text-gray-500">None</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center space-x-2">
                            {!user.role.includes('admin') && (
                              <>
                                <button
                                  onClick={() => {
                                    setSelectedUserForWarning({ id: user._id, username: user.username });
                                    setWarningModalOpen(true);
                                  }}
                                  className="bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-1 rounded text-sm transition-colors"
                                  title="Issue Warning"
                                >
                                  ⚠️ Warn
                                </button>
                                <button
                                  onClick={() => promoteToAdmin(user._id)}
                                  className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded text-sm transition-colors"
                                >
                                  Make Admin
                                </button>
                              </>
                            )}
                          </div>
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
                          onClick={() => handleLabelSort('globalLabelAggregate')}
                        >
                          <div className="flex items-center">
                            Total Bids
                            {getLabelSortIcon('globalLabelAggregate')}
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
                              {penceToPounds(label.stats?.globalLabelAggregate || 0)}
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

        {activeTab === 'bids' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">Bid Management</h2>
              <button
                onClick={loadBids}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
              >
                Refresh
              </button>
            </div>

            {/* Filters */}
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Search
                  </label>
                  <input
                    type="text"
                    value={bidsSearchQuery}
                    onChange={(e) => {
                      setBidsSearchQuery(e.target.value);
                      setBidsPage(1);
                      if (e.target.value.length === 0 || e.target.value.length >= 2) {
                        loadBids();
                      }
                    }}
                    placeholder="User, media, or party..."
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Status
                  </label>
                  <select
                    value={bidsStatusFilter}
                    onChange={(e) => {
                      setBidsStatusFilter(e.target.value);
                      setBidsPage(1);
                      loadBids();
                    }}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="">All Statuses</option>
                    <option value="active">Active</option>
                    <option value="vetoed">Vetoed</option>
                    <option value="refunded">Refunded</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Scope
                  </label>
                  <select
                    value={bidsScopeFilter}
                    onChange={(e) => {
                      setBidsScopeFilter(e.target.value);
                      setBidsPage(1);
                      loadBids();
                    }}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="">All Scopes</option>
                    <option value="party">Party</option>
                    <option value="global">Global</option>
                  </select>
                </div>
              </div>
            </div>

            {isLoadingBids ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
              </div>
            ) : bids.length === 0 ? (
              <div className="bg-gray-800 rounded-lg p-8 text-center">
                <DollarSign className="h-12 w-12 text-gray-500 mx-auto mb-4" />
                <p className="text-gray-400">No bids found</p>
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
                          onClick={() => handleBidsSort('amount')}
                        >
                          <div className="flex items-center">
                            Amount
                            {getBidsSortIcon('amount')}
                          </div>
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                          Status
                        </th>
                        <th 
                          className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-600 transition-colors"
                          onClick={() => handleBidsSort('createdAt')}
                        >
                          <div className="flex items-center">
                            Date Placed
                            {getBidsSortIcon('createdAt')}
                          </div>
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                          Party
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                          Scope
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                          Platform
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-gray-800 divide-y divide-gray-700">
                      {bids.map((bid) => (
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
                            {bid.status === 'active' ? (
                              <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs font-medium">Active</span>
                            ) : bid.status === 'vetoed' ? (
                              <span className="px-2 py-1 bg-red-500/20 text-red-400 rounded text-xs font-medium">Vetoed</span>
                            ) : (
                              <span className="px-2 py-1 bg-gray-500/20 text-gray-400 rounded text-xs font-medium">Refunded</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-300">
                              {bid.createdAt ? new Date(bid.createdAt).toLocaleString() : 'N/A'}
                            </div>
                            {bid.isInitialBid && (
                              <div className="text-xs text-purple-400">Initial bid</div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-300">
                              {bid.party?.name || 'Unknown'}
                            </div>
                            <div className="text-xs text-gray-500">
                              {bid.party?.type || 'unknown'}
                            </div>
                            {bid.queuePosition && (
                              <div className="text-xs text-gray-500">
                                Queue: {bid.queuePosition}/{bid.queueSize || '?'}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-xs text-gray-400 uppercase">
                              {bid.bidScope || 'party'}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-xs text-gray-400 capitalize">
                              {bid.platform || 'unknown'}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center space-x-2">
                              {bid.status === 'active' && (
                                <button
                                  onClick={async () => {
                                    const reason = prompt('Enter reason for veto (optional):');
                                    if (reason !== null) { // Allow empty string but not cancel
                                      try {
                                        await userAPI.vetoBid(bid._id, reason || undefined);
                                        toast.success(`Bid vetoed successfully. User refunded ${penceToPounds(bid.amount)}.`);
                                        loadBids();
                                      } catch (error: any) {
                                        toast.error(error.response?.data?.error || 'Failed to veto bid');
                                      }
                                    }
                                  }}
                                  className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition-colors"
                                  title="Veto bid"
                                >
                                  Veto
                                </button>
                              )}
                              {bid.vetoedAt && (
                                <div className="text-xs text-gray-500">
                                  Vetoed: {new Date(bid.vetoedAt).toLocaleDateString()}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {bidsTotal > 50 && (
                  <div className="px-6 py-4 bg-gray-700 border-t border-gray-600 flex items-center justify-between">
                    <div className="text-sm text-gray-300">
                      Showing {((bidsPage - 1) * 50) + 1} - {Math.min(bidsPage * 50, bidsTotal)} of {bidsTotal}
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => setBidsPage(p => Math.max(1, p - 1))}
                        disabled={bidsPage === 1}
                        className="px-3 py-1 bg-gray-600 hover:bg-gray-500 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Previous
                      </button>
                      <button
                        onClick={() => setBidsPage(p => p + 1)}
                        disabled={bidsPage * 50 >= bidsTotal}
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

        {activeTab === 'media-management' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">Media Management</h2>
              <button
                onClick={loadMedia}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
              >
                Refresh
              </button>
            </div>

            {/* Filters */}
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Search
                  </label>
                  <input
                    type="text"
                    value={mediaSearchQuery}
                    onChange={(e) => {
                      setMediaSearchQuery(e.target.value);
                      setMediaPage(1);
                      if (e.target.value.length === 0 || e.target.value.length >= 2) {
                        loadMedia();
                      }
                    }}
                    placeholder="Title, artist, tags..."
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Content Type
                  </label>
                  <select
                    value={mediaContentTypeFilter}
                    onChange={(e) => {
                      setMediaContentTypeFilter(e.target.value);
                      setMediaPage(1);
                      loadMedia();
                    }}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="">All Types</option>
                    <option value="music">Music</option>
                    <option value="spoken">Spoken</option>
                    <option value="video">Video</option>
                    <option value="image">Image</option>
                    <option value="written">Written</option>
                    <option value="interactive">Interactive</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Content Form
                  </label>
                  <select
                    value={mediaContentFormFilter}
                    onChange={(e) => {
                      setMediaContentFormFilter(e.target.value);
                      setMediaPage(1);
                      loadMedia();
                    }}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="">All Forms</option>
                    <option value="tune">Tune</option>
                    <option value="album">Album</option>
                    <option value="podcast">Podcast</option>
                    <option value="episode">Episode</option>
                    <option value="audiobook">Audiobook</option>
                    <option value="video">Video</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Rights Cleared
                  </label>
                  <select
                    value={mediaRightsFilter}
                    onChange={(e) => {
                      setMediaRightsFilter(e.target.value);
                      setMediaPage(1);
                      loadMedia();
                    }}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="">All</option>
                    <option value="true">Cleared</option>
                    <option value="false">Not Cleared</option>
                  </select>
                </div>
              </div>
            </div>

            {isLoadingMedia ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
              </div>
            ) : mediaList.length === 0 ? (
              <div className="bg-gray-800 rounded-lg p-8 text-center">
                <Music className="h-12 w-12 text-gray-500 mx-auto mb-4" />
                <p className="text-gray-400">No media found</p>
              </div>
            ) : (
              <div className="bg-gray-800 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-700">
                    <thead className="bg-gray-700">
                      <tr>
                        <th 
                          className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-600 transition-colors"
                          onClick={() => handleMediaSort('title')}
                        >
                          <div className="flex items-center">
                            Media
                            {getMediaSortIcon('title')}
                          </div>
                        </th>
                        <th 
                          className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-600 transition-colors"
                          onClick={() => handleMediaSort('artist')}
                        >
                          <div className="flex items-center">
                            Artist
                            {getMediaSortIcon('artist')}
                          </div>
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                          Type
                        </th>
                        <th 
                          className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-600 transition-colors"
                          onClick={() => handleMediaSort('globalMediaAggregate')}
                        >
                          <div className="flex items-center">
                            Total Bids
                            {getMediaSortIcon('globalMediaAggregate')}
                          </div>
                        </th>
                        <th 
                          className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-600 transition-colors"
                          onClick={() => handleMediaSort('playCount')}
                        >
                          <div className="flex items-center">
                            Plays
                            {getMediaSortIcon('playCount')}
                          </div>
                        </th>
                        <th 
                          className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-600 transition-colors"
                          onClick={() => handleMediaSort('duration')}
                        >
                          <div className="flex items-center">
                            Duration
                            {getMediaSortIcon('duration')}
                          </div>
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                          Owners
                        </th>
                        <th 
                          className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-600 transition-colors"
                          onClick={() => handleMediaSort('uploadedAt')}
                        >
                          <div className="flex items-center">
                            Uploaded
                            {getMediaSortIcon('uploadedAt')}
                          </div>
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-gray-800 divide-y divide-gray-700">
                      {mediaList.map((item) => (
                        <tr key={item._id} className="hover:bg-gray-700/50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              {item.coverArt && (
                                <img
                                  src={item.coverArt}
                                  alt={item.title}
                                  className="h-10 w-10 rounded object-cover mr-3"
                                />
                              )}
                              <div className="flex-1">
                                {editingMediaId === item._id && editingField === 'title' ? (
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="text"
                                      value={editingValue}
                                      onChange={(e) => setEditingValue(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          handleSaveEdit(item._id, 'title');
                                        } else if (e.key === 'Escape') {
                                          handleCancelEdit();
                                        }
                                      }}
                                      className="flex-1 px-2 py-1 bg-gray-700 border border-purple-500 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                                      autoFocus
                                    />
                                    <button
                                      onClick={() => handleSaveEdit(item._id, 'title')}
                                      className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded transition-colors"
                                      title="Save"
                                    >
                                      ✓
                                    </button>
                                    <button
                                      onClick={handleCancelEdit}
                                      className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition-colors"
                                      title="Cancel"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 group">
                                    <button
                                      onClick={() => navigate(`/tune/${item._id}`)}
                                      className="text-sm font-medium text-white hover:text-purple-400 transition-colors text-left"
                                    >
                                      {item.title || 'Unknown'}
                                    </button>
                                    <button
                                      onClick={() => handleStartEdit(item._id, 'title', item.title || '')}
                                      className="opacity-0 group-hover:opacity-100 px-1 py-0.5 text-xs text-gray-400 hover:text-purple-400 transition-all"
                                      title="Edit title"
                                    >
                                      ✏️
                                    </button>
                                    {item.explicit && (
                                      <span className="ml-2 text-xs text-red-400">E</span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {editingMediaId === item._id && editingField === 'artist' ? (
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={editingValue}
                                  onChange={(e) => setEditingValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      handleSaveEdit(item._id, 'artist');
                                    } else if (e.key === 'Escape') {
                                      handleCancelEdit();
                                    }
                                  }}
                                  className="flex-1 px-2 py-1 bg-gray-700 border border-purple-500 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                                  placeholder="Artist names (comma-separated)"
                                  autoFocus
                                />
                                <button
                                  onClick={() => handleSaveEdit(item._id, 'artist')}
                                  className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded transition-colors"
                                  title="Save"
                                >
                                  ✓
                                </button>
                                <button
                                  onClick={handleCancelEdit}
                                  className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition-colors"
                                  title="Cancel"
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 group">
                                <div className="text-sm text-gray-300">
                                  {item.artist || 'Unknown Artist'}
                                </div>
                                <button
                                  onClick={() => handleStartEdit(item._id, 'artist', item.artist || '')}
                                  className="opacity-0 group-hover:opacity-100 px-1 py-0.5 text-xs text-gray-400 hover:text-purple-400 transition-all"
                                  title="Edit artist"
                                >
                                  ✏️
                                </button>
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-xs text-gray-400">
                              {item.contentType?.join(', ') || 'N/A'}
                            </div>
                            <div className="text-xs text-gray-500">
                              {item.contentForm?.join(', ') || 'N/A'}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-green-400">
                              {penceToPounds(item.globalMediaAggregate || 0)}
                            </div>
                            {item.globalMediaBidTop > 0 && (
                              <div className="text-xs text-gray-500">
                                Top: {penceToPounds(item.globalMediaBidTop)}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-300">
                              {item.playCount || 0}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-300">
                              {formatDuration(item.duration)}
                            </div>
                            {item.fileSize && (
                              <div className="text-xs text-gray-500">
                                {formatFileSize(item.fileSize)}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-300">
                              {item.ownerCount || 0} owner{item.ownerCount !== 1 ? 's' : ''}
                            </div>
                            {item.totalOwnership !== 100 && item.totalOwnership > 0 && (
                              <div className="text-xs text-yellow-400">
                                {item.totalOwnership}% total
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-300">
                              {item.uploadedAt ? new Date(item.uploadedAt).toLocaleDateString() : 'N/A'}
                            </div>
                            {item.addedBy && (
                              <div className="text-xs text-gray-500">
                                by {item.addedBy.username}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex flex-col gap-1">
                              {item.rightsCleared ? (
                                <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs font-medium">Rights Cleared</span>
                              ) : (
                                <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded text-xs font-medium">Pending</span>
                              )}
                              {item.label && item.label.length > 0 && (
                                <div className="text-xs text-gray-400">
                                  {item.label.length} label{item.label.length !== 1 ? 's' : ''}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => navigate(`/tune/${item._id}`)}
                                className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded transition-colors"
                                title="View media"
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
                {mediaTotal > 50 && (
                  <div className="px-6 py-4 bg-gray-700 border-t border-gray-600 flex items-center justify-between">
                    <div className="text-sm text-gray-300">
                      Showing {((mediaPage - 1) * 50) + 1} - {Math.min(mediaPage * 50, mediaTotal)} of {mediaTotal}
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => setMediaPage(p => Math.max(1, p - 1))}
                        disabled={mediaPage === 1}
                        className="px-3 py-1 bg-gray-600 hover:bg-gray-500 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Previous
                      </button>
                      <button
                        onClick={() => setMediaPage(p => p + 1)}
                        disabled={mediaPage * 50 >= mediaTotal}
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

        {activeTab === 'vetoed-bids' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">Vetoes</h2>
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
                <p className="text-gray-400">No vetoes found</p>
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
                  <button
                    onClick={() => setReportsSubTab('collective')}
                    className={`flex items-center py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                      reportsSubTab === 'collective'
                        ? 'border-purple-500 text-purple-400'
                        : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300'
                    }`}
                  >
                    <Users className="h-4 w-4 mr-2" />
                    <span>Collective Reports</span>
                  </button>
                  <button
                    onClick={() => setReportsSubTab('claims')}
                    className={`flex items-center py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                      reportsSubTab === 'claims'
                        ? 'border-purple-500 text-purple-400'
                        : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300'
                    }`}
                  >
                    <Music className="h-4 w-4 mr-2" />
                    <span>Tune Claims</span>
                  </button>
                  <button
                    onClick={() => setReportsSubTab('applications')}
                    className={`flex items-center py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                      reportsSubTab === 'applications'
                        ? 'border-purple-500 text-purple-400'
                        : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300'
                    }`}
                  >
                    <Award className="h-4 w-4 mr-2" />
                    <span>Creator Applications</span>
                  </button>
                  <button
                    onClick={() => setReportsSubTab('invites')}
                    className={`flex items-center py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                      reportsSubTab === 'invites'
                        ? 'border-purple-500 text-purple-400'
                        : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300'
                    }`}
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    <span>Invite Requests</span>
                  </button>
                </nav>
              </div>
            </div>
            
            {/* Reports Content */}
            {reportsSubTab === 'invites' ? (
              <div>
                <InviteRequestsAdmin
                  onPendingCountChange={(count) =>
                    setReportsSummary((prev) => ({
                      ...prev,
                      invites: count,
                    }))
                  }
                />
              </div>
            ) : reportsSubTab === 'claims' ? (
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
            ) : reportsSubTab === 'applications' ? (
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

                        <div className="flex items-center justify-between mt-6 border-t border-gray-700 pt-4">
                          <div>
                            <p className="text-sm text-gray-400">Status:</p>
                            {getVerificationStatusBadge(app.creatorProfile?.verificationStatus || 'pending')}
                          </div>

                          <div className="flex space-x-3">
                            <button
                              onClick={() => {
                                const userId = app._id || app.id;
                                if (!userId) {
                                  toast.error('Unable to identify user ID');
                                  return;
                                }
                                const notes = prompt('Add approval notes (optional):');
                                reviewCreatorApplication(userId, 'verified', notes || '');
                              }}
                              className="flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                            >
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Approve
                            </button>
                            <button
                              onClick={() => {
                                const userId = app._id || app.id;
                                if (!userId) {
                                  toast.error('Unable to identify user ID');
                                  return;
                                }
                                const notes = prompt('Add rejection reason:');
                                if (notes) {
                                  reviewCreatorApplication(userId, 'rejected', notes);
                                }
                              }}
                              className="flex items-center px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                            >
                              <XCircle className="h-4 w-4 mr-2" />
                              Reject
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <ReportsAdmin
                reportType={reportsSubTab as 'media' | 'user' | 'label' | 'collective'}
                onPendingCountChange={(count) =>
                  setReportsSummary((prev) => ({
                    ...prev,
                    [reportsSubTab as 'media' | 'user' | 'label' | 'collective']: count,
                  }))
                }
              />
            )}
          </div>
        )}

        {activeTab === 'notifications' && (
          <div>
            <NotificationsManager />
          </div>
        )}

        {/* Warning Modal */}
        {warningModalOpen && selectedUserForWarning && (
          <IssueWarningModal
            isOpen={warningModalOpen}
            onClose={() => {
              setWarningModalOpen(false);
              setSelectedUserForWarning(null);
            }}
            userId={selectedUserForWarning.id}
            username={selectedUserForWarning.username}
            onWarningIssued={() => {
              // Refresh users list to show updated warning counts
              loadUsers();
            }}
          />
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
