import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { X, Loader2, Search, Users, CheckCircle } from 'lucide-react';
import { collectiveAPI, userAPI } from '../lib/api';
import { DEFAULT_PROFILE_PIC } from '../constants';

interface CollectiveLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void; // Callback when collective is linked/created
}

const CollectiveLinkModal: React.FC<CollectiveLinkModalProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMemberships, setIsLoadingMemberships] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [userCollectives, setUserCollectives] = useState<any[]>([]);
  const [allCollectives, setAllCollectives] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'my-collectives' | 'browse'>('my-collectives');

  // Load user's collective memberships when modal opens
  useEffect(() => {
    if (isOpen) {
      loadUserCollectives();
      setSearchQuery('');
      setActiveTab('my-collectives');
    }
  }, [isOpen]);

  // Load all collectives when browsing tab is active
  useEffect(() => {
    if (isOpen && activeTab === 'browse') {
      loadAllCollectives();
    }
  }, [isOpen, activeTab]);

  const loadUserCollectives = async () => {
    try {
      setIsLoadingMemberships(true);
      const response = await userAPI.getCollectiveMemberships();
      setUserCollectives(response.collectives || []);
    } catch (error: any) {
      console.error('Error loading collective memberships:', error);
      toast.error('Failed to load your collectives');
    } finally {
      setIsLoadingMemberships(false);
    }
  };

  const loadAllCollectives = async () => {
    try {
      setIsLoading(true);
      const response = await collectiveAPI.getCollectives({
        search: searchQuery || undefined,
        limit: 50,
        sortBy: 'name',
        sortOrder: 'asc'
      });
      setAllCollectives(response.collectives || []);
    } catch (error: any) {
      console.error('Error loading collectives:', error);
      toast.error('Failed to load collectives');
    } finally {
      setIsLoading(false);
    }
  };

  // Filter collectives based on search query
  const filteredUserCollectives = userCollectives.filter(collective =>
    collective.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    collective.slug.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredAllCollectives = allCollectives.filter(collective =>
    collective.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    collective.slug.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCollectiveClick = (collective: any) => {
    // Navigate to collective profile
    navigate(`/collective/${collective.slug}`);
    onClose();
  };

  const handleSearch = () => {
    if (activeTab === 'browse') {
      loadAllCollectives();
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[10000] p-4">
        <div className="bg-gray-800 rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-white">Link Collective</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex space-x-2 mb-4 border-b border-gray-700">
            <button
              onClick={() => setActiveTab('my-collectives')}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === 'my-collectives'
                  ? 'text-purple-400 border-b-2 border-purple-400'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              My Collectives
            </button>
            <button
              onClick={() => setActiveTab('browse')}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === 'browse'
                  ? 'text-purple-400 border-b-2 border-purple-400'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Browse All
            </button>
          </div>

          {/* Search Bar */}
          <div className="mb-4 flex space-x-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSearch();
                  }
                }}
                placeholder={activeTab === 'my-collectives' ? 'Search your collectives...' : 'Search all collectives...'}
                className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
              />
            </div>
            {activeTab === 'browse' && (
              <button
                onClick={handleSearch}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors"
              >
                Search
              </button>
            )}
          </div>

          {/* Content */}
          {activeTab === 'my-collectives' ? (
            <div>
              {isLoadingMemberships ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
                </div>
              ) : filteredUserCollectives.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  {searchQuery ? (
                    <p>No collectives found matching your search.</p>
                  ) : (
                    <div>
                      <Users className="h-12 w-12 mx-auto mb-4 text-gray-500" />
                      <p className="mb-2">You're not a member of any collectives yet.</p>
                      <p className="text-sm">Browse existing ones to join, or create a new collective from the creator dashboard.</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-gray-400 mb-2">
                    Click on a collective to view its profile. Your collectives are automatically displayed on your profile.
                  </p>
                  {filteredUserCollectives.map((collective) => {
                    const roleColors: Record<string, string> = {
                      founder: 'bg-purple-600/20 text-purple-300 border-purple-500/30',
                      admin: 'bg-blue-600/20 text-blue-300 border-blue-500/30',
                      member: 'bg-green-600/20 text-green-300 border-green-500/30'
                    };
                    const roleColor = roleColors[collective.role] || 'bg-gray-600/20 text-gray-300 border-gray-500/30';

                    return (
                      <button
                        key={collective._id}
                        onClick={() => handleCollectiveClick(collective)}
                        className={`w-full flex items-center space-x-3 px-4 py-3 bg-black/20 border rounded-lg transition-all hover:bg-black/30 ${roleColor} text-left`}
                      >
                        <img
                          src={collective.profilePicture || DEFAULT_PROFILE_PIC}
                          alt={collective.name}
                          className="h-12 w-12 rounded-full object-cover"
                          onError={(e) => {
                            e.currentTarget.src = DEFAULT_PROFILE_PIC;
                          }}
                        />
                        <div className="flex-1">
                          <div className="flex items-center space-x-2">
                            <span className="text-white font-medium">{collective.name}</span>
                            {collective.verificationStatus === 'verified' && (
                              <CheckCircle className="h-4 w-4 text-green-400" />
                            )}
                          </div>
                          <div className="flex items-center space-x-2 mt-1">
                            <span className="text-xs opacity-75 capitalize">{collective.role}</span>
                            {collective.memberCount > 0 && (
                              <span className="text-xs opacity-60">
                                • {collective.memberCount} {collective.memberCount === 1 ? 'member' : 'members'}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
                </div>
              ) : filteredAllCollectives.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  {searchQuery ? (
                    <p>No collectives found matching your search.</p>
                  ) : (
                    <p>No collectives available.</p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-gray-400 mb-2">
                    Browse all collectives. To link a collective to your profile, you need to be a member first.
                  </p>
                  {filteredAllCollectives.map((collective) => {
                    // Check if user is already a member
                    const isMember = userCollectives.some(
                      uc => uc._id === collective._id || uc.slug === collective.slug
                    );

                    return (
                      <button
                        key={collective._id}
                        onClick={() => handleCollectiveClick(collective)}
                        className={`w-full flex items-center space-x-3 px-4 py-3 bg-black/20 border rounded-lg transition-all hover:bg-black/30 ${
                          isMember ? 'border-green-500/30' : 'border-gray-500/30'
                        } text-left`}
                      >
                        <img
                          src={collective.profilePicture || DEFAULT_PROFILE_PIC}
                          alt={collective.name}
                          className="h-12 w-12 rounded-full object-cover"
                          onError={(e) => {
                            e.currentTarget.src = DEFAULT_PROFILE_PIC;
                          }}
                        />
                        <div className="flex-1">
                          <div className="flex items-center space-x-2">
                            <span className="text-white font-medium">{collective.name}</span>
                            {isMember && (
                              <span className="text-xs bg-green-600/20 text-green-300 px-2 py-0.5 rounded">
                                Member
                              </span>
                            )}
                          </div>
                          {collective.description && (
                            <p className="text-xs text-gray-400 mt-1 line-clamp-1">{collective.description}</p>
                          )}
                          {collective.stats?.memberCount > 0 && (
                            <p className="text-xs text-gray-500 mt-1">
                              {collective.stats.memberCount} {collective.stats.memberCount === 1 ? 'member' : 'members'}
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Close Button */}
          <div className="mt-6 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default CollectiveLinkModal;

