import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { X, Loader2, Search, Building, CheckCircle } from 'lucide-react';
import { labelAPI, userAPI } from '../lib/api';
import { DEFAULT_PROFILE_PIC } from '../constants';

interface LabelLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void; // Callback when label is linked
}

const LabelLinkModal: React.FC<LabelLinkModalProps> = ({ isOpen, onClose, onSuccess: _onSuccess }) => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingAffiliations, setIsLoadingAffiliations] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [userLabels, setUserLabels] = useState<any[]>([]);
  const [allLabels, setAllLabels] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'my-labels' | 'browse'>('my-labels');

  // Load user's label affiliations when modal opens
  useEffect(() => {
    if (isOpen) {
      loadUserLabels();
      setSearchQuery('');
      setActiveTab('my-labels');
    }
  }, [isOpen]);

  // Load all labels when browsing tab is active
  useEffect(() => {
    if (isOpen && activeTab === 'browse') {
      loadAllLabels();
    }
  }, [isOpen, activeTab]);

  const loadUserLabels = async () => {
    try {
      setIsLoadingAffiliations(true);
      const response = await userAPI.getLabelAffiliations();
      setUserLabels(response.labelAffiliations || []);
    } catch (error: any) {
      console.error('Error loading label affiliations:', error);
      toast.error('Failed to load your labels');
    } finally {
      setIsLoadingAffiliations(false);
    }
  };

  const loadAllLabels = async () => {
    try {
      setIsLoading(true);
      const response = await labelAPI.getLabels({
        search: searchQuery || undefined,
        limit: 50,
        sortBy: 'name',
        sortOrder: 'asc'
      });
      setAllLabels(response.labels || []);
    } catch (error: any) {
      console.error('Error loading labels:', error);
      toast.error('Failed to load labels');
    } finally {
      setIsLoading(false);
    }
  };

  // Filter labels based on search query
  const filteredUserLabels = userLabels.filter(affiliation =>
    affiliation.label && (
      affiliation.label.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      affiliation.label.slug.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  const filteredAllLabels = allLabels.filter(label =>
    label.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    label.slug.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleLabelClick = (label: any) => {
    // Navigate to label profile
    const slug = label.slug || label.label?.slug;
    if (slug) {
      navigate(`/label/${slug}`);
      onClose();
    }
  };

  const handleSearch = () => {
    if (activeTab === 'browse') {
      loadAllLabels();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[10000] p-4">
      <div className="bg-gray-800 rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-white">Link Label</h2>
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
            onClick={() => setActiveTab('my-labels')}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === 'my-labels'
                ? 'text-purple-400 border-b-2 border-purple-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            My Labels
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
              placeholder={activeTab === 'my-labels' ? 'Search your labels...' : 'Search all labels...'}
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
        {activeTab === 'my-labels' ? (
          <div>
            {isLoadingAffiliations ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
              </div>
            ) : filteredUserLabels.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                {searchQuery ? (
                  <p>No labels found matching your search.</p>
                ) : (
                  <div>
                    <Building className="h-12 w-12 mx-auto mb-4 text-gray-500" />
                    <p className="mb-2">You're not affiliated with any labels yet.</p>
                    <p className="text-sm">Browse existing labels or create one from the creator dashboard.</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-gray-400 mb-2">
                  Click on a label to view its profile. Your labels are automatically displayed on your profile.
                </p>
                {filteredUserLabels.map((affiliation) => {
                  if (!affiliation.label) return null;
                  
                  const label = affiliation.label;
                  const roleColors: Record<string, string> = {
                    artist: 'bg-purple-600/20 text-purple-300 border-purple-500/30',
                    producer: 'bg-blue-600/20 text-blue-300 border-blue-500/30',
                    manager: 'bg-green-600/20 text-green-300 border-green-500/30',
                    staff: 'bg-gray-600/20 text-gray-300 border-gray-500/30'
                  };
                  const roleColor = roleColors[affiliation.role] || 'bg-gray-600/20 text-gray-300 border-gray-500/30';

                  return (
                    <button
                      key={affiliation.labelId || label._id}
                      onClick={() => handleLabelClick(label)}
                      className={`w-full flex items-center space-x-3 px-4 py-3 bg-black/20 border rounded-lg transition-all hover:bg-black/30 ${roleColor} text-left`}
                    >
                      <img
                        src={label.profilePicture || DEFAULT_PROFILE_PIC}
                        alt={label.name}
                        className="h-12 w-12 rounded-full object-cover"
                        onError={(e) => {
                          e.currentTarget.src = DEFAULT_PROFILE_PIC;
                        }}
                      />
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="text-white font-medium">{label.name}</span>
                          {label.verificationStatus === 'verified' && (
                            <CheckCircle className="h-4 w-4 text-green-400" />
                          )}
                        </div>
                        <div className="flex items-center space-x-2 mt-1">
                          <span className="text-xs opacity-75 capitalize">{affiliation.role}</span>
                          {label.stats?.artistCount > 0 && (
                            <span className="text-xs opacity-60">
                              • {label.stats.artistCount} {label.stats.artistCount === 1 ? 'artist' : 'artists'}
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
            ) : filteredAllLabels.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                {searchQuery ? (
                  <p>No labels found matching your search.</p>
                ) : (
                  <p>No labels available.</p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-gray-400 mb-2">
                  Browse all labels. To link a label to your profile, you need to be affiliated with it first.
                </p>
                {filteredAllLabels.map((label) => {
                  // Check if user is already affiliated
                  const isAffiliated = userLabels.some(
                    ul => ul.labelId === label._id || ul.label?.slug === label.slug
                  );

                  return (
                    <button
                      key={label._id}
                      onClick={() => handleLabelClick(label)}
                      className={`w-full flex items-center space-x-3 px-4 py-3 bg-black/20 border rounded-lg transition-all hover:bg-black/30 ${
                        isAffiliated ? 'border-green-500/30' : 'border-gray-500/30'
                      } text-left`}
                    >
                      <img
                        src={label.profilePicture || DEFAULT_PROFILE_PIC}
                        alt={label.name}
                        className="h-12 w-12 rounded-full object-cover"
                        onError={(e) => {
                          e.currentTarget.src = DEFAULT_PROFILE_PIC;
                        }}
                      />
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="text-white font-medium">{label.name}</span>
                          {isAffiliated && (
                            <span className="text-xs bg-green-600/20 text-green-300 px-2 py-0.5 rounded">
                              Affiliated
                            </span>
                          )}
                        </div>
                        {label.description && (
                          <p className="text-xs text-gray-400 mt-1 line-clamp-1">{label.description}</p>
                        )}
                        {label.stats?.artistCount > 0 && (
                          <p className="text-xs text-gray-500 mt-1">
                            {label.stats.artistCount} {label.stats.artistCount === 1 ? 'artist' : 'artists'}
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
  );
};

export default LabelLinkModal;

