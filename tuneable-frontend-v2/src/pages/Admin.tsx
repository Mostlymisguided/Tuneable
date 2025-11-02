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
  Mail
} from 'lucide-react';
import YouTubeLikedImport from '../components/YouTubeLikedImport';
import InviteRequestsAdmin from '../components/InviteRequestsAdmin';
import ReportsAdmin from '../components/ReportsAdmin';
import { authAPI, creatorAPI, claimAPI } from '../lib/api';
import { toast } from 'react-toastify';

interface User {
  _id: string;
  username: string;
  email: string;
  role: string[];
  balance: number;
  createdAt: string;
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
      const token = localStorage.getItem('token');
      const response = await fetch('/api/users', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setUsers(data.users || []);
      }
    } catch (error) {
      console.error('Error loading users:', error);
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
    { id: 'creators', name: 'Creator Applications', icon: Award },
    { id: 'claims', name: 'Tune Claims', icon: Music },
    { id: 'reports', name: 'Tune Reports', icon: AlertTriangle },
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
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
                    <p className="text-2xl font-bold text-white">-</p>
                  </div>
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-6">
                <div className="flex items-center">
                  <Database className="h-8 w-8 text-purple-400" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-400">Active Parties</p>
                    <p className="text-2xl font-bold text-white">-</p>
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
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                        User
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                        Email
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                        Role
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                        OAuth Verified
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                        Balance
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                        Joined
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-gray-800 divide-y divide-gray-700">
                    {users.map((user) => (
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
                          <div className="text-sm text-gray-300">£{user.balance.toFixed(2)}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-300">
                            {new Date(user.createdAt).toLocaleDateString()}
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
          <div>
            <ReportsAdmin />
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
