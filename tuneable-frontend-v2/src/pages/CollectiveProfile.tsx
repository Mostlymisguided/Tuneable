import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Users, Music, TrendingUp, Calendar, MapPin, Globe, Instagram, Facebook, Youtube, Twitter, ArrowLeft, Flag, X, Save, Loader2 } from 'lucide-react';
import { collectiveAPI } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { penceToPounds } from '../utils/currency';
import { DEFAULT_PROFILE_PIC } from '../constants';
import ReportModal from '../components/ReportModal';
import LabelTeamTable, { type LabelTeamMember } from '../components/labels/LabelTeamTable';

interface Collective {
  _id: string;
  name: string;
  slug: string;
  description: string;
  profilePicture: string;
  coverImage: string;
  email: string;
  website: string;
  type: 'band' | 'collective' | 'production_company' | 'other';
  location?: {
    city?: string;
    region?: string;
    country?: string;
    countryCode?: string;
  };
  socialMedia?: {
    instagram?: string;
    facebook?: string;
    soundcloud?: string;
    spotify?: string;
    youtube?: string;
    twitter?: string;
    tiktok?: string;
  };
  foundedYear?: number;
  genres?: string[];
  stats?: {
    memberCount?: number;
    releaseCount?: number;
    globalCollectiveAggregate?: number;
    globalCollectiveBidAvg?: number;
    globalCollectiveBidTop?: number;
    globalCollectiveBidCount?: number;
  };
  verificationStatus?: string;
  createdAt?: string;
  members?: Array<{
    userId: string | { _id: string; username?: string; profilePic?: string; uuid?: string };
    role: 'founder' | 'member' | 'admin';
    instrument?: string;
    joinedAt?: string;
    leftAt?: string;
    verified?: boolean;
  }>;
}

interface Media {
  _id: string;
  uuid?: string;
  title: string;
  artist: string;
  coverArt: string;
  releaseDate: string;
  stats: {
    totalBidAmount: number;
    bidCount: number;
  };
}

const CollectiveProfile: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const [collective, setCollective] = useState<Collective | null>(null);
  const [recentReleases, setRecentReleases] = useState<Media[]>([]);
  const [topMedia, setTopMedia] = useState<Media[]>([]);
  const [members, setMembers] = useState<Collective['members']>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'members' | 'media'>('overview');
  const [teamMembers, setTeamMembers] = useState<LabelTeamMember[]>([]);
  const [isLoadingTeam, setIsLoadingTeam] = useState(false);
  const [hasLoadedTeam, setHasLoadedTeam] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Edit mode - controlled by query params (similar to UserProfile and TuneProfile)
  const isEditMode = searchParams.get('edit') === 'true';
  const editTab = (searchParams.get('tab') as 'info' | 'edit' | 'ownership') || 'info';
  
  // Report state
  const [showReportModal, setShowReportModal] = useState(false);
  
  // Profile picture upload state
  const [isUploadingProfilePicture, setIsUploadingProfilePicture] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    email: '',
    website: '',
    foundedYear: '',
    type: 'collective' as 'band' | 'collective' | 'production_company' | 'other',
    genres: [] as string[],
    location: {
      city: '',
      region: '',
      country: '',
      countryCode: ''
    },
    socialMedia: {
      instagram: '',
      facebook: '',
      soundcloud: '',
      spotify: '',
      youtube: '',
      twitter: '',
      tiktok: ''
    }
  });

  // Helper function to get country code from country name
  const getCountryCode = (countryName: string): string => {
    const countryMap: Record<string, string> = {
      'United Kingdom': 'GB',
      'United States': 'US',
      'Canada': 'CA',
      'Australia': 'AU',
      'Germany': 'DE',
      'France': 'FR',
      'Spain': 'ES',
      'Italy': 'IT',
      'Netherlands': 'NL',
      'Belgium': 'BE'
    };
    return countryMap[countryName] || '';
  };

  const fetchCollectiveTeam = async (collectiveSlug: string) => {
    if (!collectiveSlug) return;
    try {
      setIsLoadingTeam(true);
      const response = await collectiveAPI.getTeam(collectiveSlug);
      setTeamMembers(response.team || response.members || []);
      setHasLoadedTeam(true);
    } catch (error) {
      console.error('Error fetching collective team:', error);
      setTeamMembers([]);
    } finally {
      setIsLoadingTeam(false);
    }
  };

  // Check if user can edit this collective
  const canEditCollective = (collectiveData?: Collective) => {
    const collectiveToCheck = collectiveData || collective;
    if (!currentUser || !collectiveToCheck) return false;
    
    // Check if user is admin
    const isAdmin = currentUser.role && currentUser.role.includes('admin');
    if (isAdmin) return true;
    
    // Check if user is a collective admin or founder
    const userCollectiveId = (currentUser as any)._id || currentUser.id || currentUser.uuid;
    const isCollectiveAdmin = collectiveToCheck.members?.some((member) => {
      const memberId = typeof member.userId === 'string' 
        ? member.userId 
        : (member.userId._id || member.userId.uuid || member.userId);
      return (memberId === userCollectiveId || memberId === currentUser.uuid) && 
             !member.leftAt &&
             (member.role === 'founder' || member.role === 'admin');
    });
    
    return !!isCollectiveAdmin;
  };

  useEffect(() => {
    if (slug) {
      fetchCollectiveData();
    }
  }, [slug]);

useEffect(() => {
  if (!isEditMode) {
    setHasLoadedTeam(false);
    setTeamMembers([]);
  }
}, [isEditMode]);

useEffect(() => {
  setHasLoadedTeam(false);
  setTeamMembers([]);
}, [slug]);

useEffect(() => {
  if (
    isEditMode &&
    editTab === 'ownership' &&
    slug &&
    collective &&
    canEditCollective(collective) &&
    !hasLoadedTeam &&
    !isLoadingTeam
  ) {
    void fetchCollectiveTeam(slug);
  }
}, [isEditMode, editTab, slug, collective, hasLoadedTeam, isLoadingTeam]);

  const fetchCollectiveData = async () => {
    try {
      setLoading(true);
      const data = await collectiveAPI.getCollectiveBySlug(slug!);
      
      setCollective(data.collective);
      setRecentReleases(data.recentReleases || []);
      setTopMedia(data.topMedia || []);
      
      // Fetch members separately
      if (data.collective) {
        try {
          const membersData = await collectiveAPI.getCollectiveMembers(slug!);
          setMembers(membersData.members || []);
        } catch (error) {
          console.error('Error fetching members:', error);
        }
      }
      
      // Populate edit form when collective loads (always populate, not just in edit mode)
      if (data.collective && canEditCollective(data.collective)) {
        setEditForm({
          name: data.collective.name || '',
          description: data.collective.description || '',
          email: data.collective.email || '',
          website: data.collective.website || '',
          foundedYear: data.collective.foundedYear?.toString() || '',
          type: data.collective.type || 'collective',
          genres: data.collective.genres || [],
            location: {
              city: data.collective.location?.city || '',
              region: data.collective.location?.region || '',
              country: data.collective.location?.country || '',
              countryCode: data.collective.location?.countryCode || ''
            },
          socialMedia: {
            instagram: data.collective.socialMedia?.instagram || '',
            facebook: data.collective.socialMedia?.facebook || '',
            soundcloud: data.collective.socialMedia?.soundcloud || '',
            spotify: data.collective.socialMedia?.spotify || '',
            youtube: data.collective.socialMedia?.youtube || '',
            twitter: data.collective.socialMedia?.twitter || '',
            tiktok: data.collective.socialMedia?.tiktok || ''
          }
        });
      }
    } catch (error: any) {
      console.error('Error fetching collective data:', error);
      // Handle error (collective not found, etc.)
    } finally {
      setLoading(false);
    }
  };

  // Handle profile picture click
  const handleProfilePictureClick = () => {
    if (canEditCollective() && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Handle profile picture upload
  const handleProfilePictureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !collective) return;

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }

    try {
      setIsUploadingProfilePicture(true);
      await collectiveAPI.uploadProfilePicture(collective._id, file);
      toast.success('Collective profile picture updated!');
      
      // Refresh collective data
      await fetchCollectiveData();
    } catch (err: any) {
      console.error('Error uploading profile picture:', err);
      toast.error(err.response?.data?.error || err.response?.data?.details || 'Failed to upload profile picture');
    } finally {
      setIsUploadingProfilePicture(false);
      // Reset file input to allow re-uploading the same file
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  // Handlers for edit mode navigation
  const handleEditClick = () => {
    setSearchParams({ edit: 'true', tab: 'edit' });
  };

  const handleEditTabChange = (tab: 'info' | 'edit' | 'ownership') => {
    setSearchParams({ edit: 'true', tab });
  };

  const exitEditMode = () => {
    setSearchParams({});
  };

  // Handle save collective
  const handleSaveCollective = async () => {
    if (!collective) return;

    try {
      const updates: any = {
        name: editForm.name,
        description: editForm.description || undefined,
        email: editForm.email,
        website: editForm.website || undefined,
        foundedYear: editForm.foundedYear ? parseInt(editForm.foundedYear) : undefined,
        type: editForm.type,
        genres: editForm.genres.length > 0 ? editForm.genres : undefined,
        location: (editForm.location.city || editForm.location.region || editForm.location.country) ? {
          city: editForm.location.city || undefined,
          region: editForm.location.region || undefined,
          country: editForm.location.country || undefined,
          countryCode: editForm.location.countryCode || undefined
        } : undefined,
        socialMedia: {
          instagram: editForm.socialMedia.instagram || undefined,
          facebook: editForm.socialMedia.facebook || undefined,
          soundcloud: editForm.socialMedia.soundcloud || undefined,
          spotify: editForm.socialMedia.spotify || undefined,
          youtube: editForm.socialMedia.youtube || undefined,
          twitter: editForm.socialMedia.twitter || undefined,
          tiktok: editForm.socialMedia.tiktok || undefined
        }
      };

      await collectiveAPI.updateCollective(collective._id, updates);
      toast.success('Collective updated successfully!');
      // Exit edit mode after successful save
      exitEditMode();
      await fetchCollectiveData(); // Refresh collective data
    } catch (error: any) {
      console.error('Error updating collective:', error);
      toast.error(error.response?.data?.error || 'Failed to update collective');
    }
  };

  // Get social media links for display
  const getSocialMediaLinks = () => {
    if (!collective?.socialMedia) return [];
    
    const links = [];
    if (collective.socialMedia.instagram) {
      links.push({ name: 'Instagram', url: collective.socialMedia.instagram, icon: Instagram, color: 'hover:text-pink-400' });
    }
    if (collective.socialMedia.facebook) {
      links.push({ name: 'Facebook', url: collective.socialMedia.facebook, icon: Facebook, color: 'hover:text-blue-400' });
    }
    if (collective.socialMedia.youtube) {
      links.push({ name: 'YouTube', url: collective.socialMedia.youtube, icon: Youtube, color: 'hover:text-red-400' });
    }
    if (collective.socialMedia.twitter) {
      links.push({ name: 'Twitter', url: collective.socialMedia.twitter, icon: Twitter, color: 'hover:text-cyan-400' });
    }
    
    return links;
  };

  // Get type label
  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      band: 'Band',
      collective: 'Collective',
      production_company: 'Production Company',
      other: 'Other'
    };
    return labels[type] || type;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading collective profile...</div>
      </div>
    );
  }

  if (!collective) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="text-white text-xl">Collective not found</div>
      </div>
    );
  }

  const socialLinks = getSocialMediaLinks();

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
      <div className="container mx-auto px-4 py-8">
        {/* Collective Profile Header */}
        <div className="mb-8 relative">
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 mb-4 rounded-lg font-medium transition-colors border border-white/20 bg-gray-700/40 text-white hover:bg-purple-500"
          >
            <ArrowLeft className="inline h-4 w-4 mr-2" />
            Back
          </button>

          {/* Edit Collective & Report Buttons */}
          <div className='inline rounded-full items-center absolute right-0 top-0 mb-4 flex space-x-2'>
            {/* Report Button - Always visible */}
            <button
              onClick={() => setShowReportModal(true)}
              className="px-3 md:px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg shadow-lg transition-all flex items-center space-x-2 text-sm md:text-base"
            >
              <Flag className="h-4 w-4" />
              <span className="hidden sm:inline">Report</span>
            </button>
            
            {/* Edit Collective Button - Only show if user can edit and not in edit mode */}
            {canEditCollective() && !isEditMode && (
              <button
                onClick={handleEditClick}
                className="px-3 md:px-4 py-2 bg-purple-600/40 hover:bg-purple-500 text-white font-semibold rounded-lg shadow-lg transition-all flex items-center space-x-2 text-sm md:text-base"
              >
                <span className="hidden sm:inline">Edit Collective</span>
                <span className="sm:hidden">Edit</span>
              </button>
            )}

            {editTab === 'ownership' && (
              <div className="card p-6 space-y-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-bold text-white">Collective Ownership</h2>
                    <p className="text-sm text-gray-300">
                      Founders, admins, and members who manage this collective on Tuneable.
                    </p>
                  </div>
                  {slug && (
                    <button
                      onClick={() => fetchCollectiveTeam(slug)}
                      disabled={isLoadingTeam}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm text-gray-200 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <Loader2 className={`h-4 w-4 ${isLoadingTeam ? 'animate-spin' : 'hidden'}`} />
                      {!isLoadingTeam && 'Refresh'}
                      {isLoadingTeam && 'Refreshing...'}
                    </button>
                  )}
                </div>

                {isLoadingTeam && !hasLoadedTeam ? (
                  <div className="flex items-center justify-center py-12 text-gray-300">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    Loading ownership roster...
                  </div>
                ) : (
                  <LabelTeamTable members={teamMembers} isEditable />
                )}
              </div>
            )}
            {/* Exit Edit Mode Button - Only show if in edit mode */}
            {canEditCollective() && isEditMode && (
              <button
                onClick={exitEditMode}
                className="px-3 md:px-4 py-2 bg-gray-600/40 hover:bg-gray-500 text-white font-semibold rounded-lg shadow-lg transition-all flex items-center space-x-2 text-sm md:text-base"
              >
                <X className="h-4 w-4" />
                <span className="hidden sm:inline">Cancel</span>
              </button>
            )}
          </div>
          
          <div className="card flex items-start relative">
            {/* Verification Badge - Top Right */}
            {collective.verificationStatus === 'verified' && (
              <div className="absolute top-0 right-0 p-4">
                <span className="px-3 py-2 bg-blue-500 text-white text-xs md:text-sm rounded-full font-semibold">
                  Verified
                </span>
              </div>
            )}

            {/* Profile Picture */}
            <div className="flex-shrink-0 relative">
              {collective.profilePicture ? (
                <img
                  src={collective.profilePicture}
                  alt={`${collective.name} profile picture`}
                  className={`rounded-lg shadow-xl object-cover border-2 border-purple-500/30 ${canEditCollective() ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
                  style={{ width: '200px', height: '200px' }}
                  onClick={handleProfilePictureClick}
                  title={canEditCollective() ? 'Click to change profile picture' : ''}
                  onError={(e) => {
                    e.currentTarget.src = DEFAULT_PROFILE_PIC;
                  }}
                />
              ) : (
                <img
                  src={DEFAULT_PROFILE_PIC}
                  alt={`${collective.name} profile picture`}
                  className={`rounded-lg shadow-xl object-cover border-2 border-purple-500/30 ${canEditCollective() ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
                  style={{ width: '200px', height: '200px' }}
                  onClick={handleProfilePictureClick}
                  title={canEditCollective() ? 'Click to upload profile picture' : ''}
                />
              )}
              {isUploadingProfilePicture && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg">
                  <Loader2 className="h-8 w-8 text-white animate-spin" />
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleProfilePictureUpload}
                className="hidden"
              />
            </div>
            
            {/* Collective Info */}
            <div className="ml-6 flex-1 text-white">
              <div className="">
                <div className="flex items-center space-x-3 mb-2">
                  <h1 className="text-4xl font-bold">{collective.name}</h1>
                  <span className="px-3 py-1 bg-purple-600/50 text-white text-sm rounded-full font-medium border border-purple-500/30">
                    {getTypeLabel(collective.type)}
                  </span>
                </div>
                {collective.description && (
                  <p className="text-xl text-gray-300 mb-4 max-w-2xl">{collective.description}</p>
                )}
                
                {/* Location */}
                {collective.location && (collective.location.city || collective.location.region || collective.location.country) && (
                  <div className="mb-4">
                    <div className="inline-flex items-center space-x-2 px-3 py-1.5 bg-purple-900/30 border border-purple-500/30 rounded-full text-gray-300 text-sm w-fit">
                      <MapPin className="h-3.5 w-3.5" />
                      <span>
                        {[collective.location.city, collective.location.region, collective.location.country].filter(Boolean).join(', ')}
                      </span>
                    </div>
                  </div>
                )}

                {/* Social Media Links */}
                {socialLinks.length > 0 && (
                  <div className="mb-4">
                    <div className="flex flex-wrap gap-2">
                      {socialLinks.map((social) => {
                        const IconComponent = social.icon;
                        return (
                          <a
                            key={social.name}
                            href={social.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`flex items-center space-x-2 px-4 py-2 bg-black/20 border border-white/20 rounded-lg text-gray-200 transition-all ${social.color}`}
                          >
                            <IconComponent className="w-4 h-4" />
                            <span className="text-sm font-medium">{social.name}</span>
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Website */}
                {collective.website && (
                  <div className="mb-4">
                    <a
                      href={collective.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center space-x-2 px-4 py-2 bg-black/20 border border-white/20 rounded-lg text-gray-200 hover:text-purple-400 transition-all"
                    >
                      <Globe className="w-4 h-4" />
                      <span className="text-sm font-medium">Website</span>
                    </a>
                  </div>
                )}

                {/* Genres */}
                {collective.genres && collective.genres.length > 0 && (
                  <div className="mb-4 flex flex-wrap gap-2">
                    {collective.genres.map((genre, index) => (
                      <span key={index} className="bg-purple-600/50 text-white px-3 py-1 rounded-full text-xs font-medium border border-purple-500/30">
                        {genre}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Edit Tab Navigation */}
        {isEditMode && canEditCollective() && (
          <div className="mb-6 border-b border-gray-700">
            <nav className="flex space-x-8">
              {[
                { id: 'info', label: 'Collective Info' },
                { id: 'edit', label: 'Edit Collective' },
                { id: 'ownership', label: 'Ownership' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => handleEditTabChange(tab.id as 'info' | 'edit' | 'ownership')}
                  className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                    editTab === tab.id
                      ? 'border-purple-500 text-purple-400'
                      : 'border-transparent text-gray-400 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>
        )}

        {/* Tab Content */}
        {!isEditMode ? (
          /* NORMAL VIEW - All existing content */
          <>
        {/* Stats */}
        {collective.stats && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-center text-white mb-4">Collective Statistics</h2>
            <div className="grid grid-cols-3 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {collective.stats.memberCount !== undefined && (
                <div className="card bg-black/20 rounded-lg p-6 text-center">
                  <Users className="w-8 h-8 text-purple-400 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-white">{collective.stats.memberCount || 0}</div>
                  <div className="text-sm text-gray-300">Members</div>
                </div>
              )}
              {collective.stats.releaseCount !== undefined && (
                <div className="card bg-black/20 rounded-lg p-6 text-center">
                  <Music className="w-8 h-8 text-green-400 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-white">{collective.stats.releaseCount || 0}</div>
                  <div className="text-sm text-gray-300">Releases</div>
                </div>
              )}
              {collective.stats.globalCollectiveAggregate !== undefined && (
                <div className="card bg-black/20 rounded-lg p-6 text-center">
                  <TrendingUp className="w-8 h-8 text-blue-400 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-white">{penceToPounds(collective.stats.globalCollectiveAggregate || 0)}</div>
                  <div className="text-sm text-gray-300">Total Bids</div>
                </div>
              )}
              {collective.stats.globalCollectiveBidCount !== undefined && (
                <div className="card bg-black/20 rounded-lg p-6 text-center">
                  <Calendar className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-white">{collective.stats.globalCollectiveBidCount || 0}</div>
                  <div className="text-sm text-gray-300">Total Bid Count</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="mb-8">
          <div className="border-b border-gray-700">
            <nav className="flex space-x-8">
              {[
                { id: 'overview', label: 'Overview' },
                { id: 'members', label: 'Members' },
                { id: 'media', label: 'Releases' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm ${
                    activeTab === tab.id
                      ? 'border-purple-500 text-purple-400'
                      : 'border-transparent text-gray-400 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Content */}
        <div>
          {activeTab === 'overview' && (
            <div className="space-y-8">
              {/* Collective Information */}
              <div className="card bg-black/20 rounded-lg p-6">
                <h3 className="text-xl font-semibold text-white mb-4">Collective Information</h3>
                <div className="space-y-3">
                  {collective.foundedYear && (
                    <div className="flex items-center space-x-2 text-gray-300">
                      <Calendar className="w-4 h-4" />
                      <span>Founded {collective.foundedYear}</span>
                    </div>
                  )}
                  
                  {collective.location && (collective.location.city || collective.location.region || collective.location.country) && (
                    <div className="flex items-center space-x-2 text-gray-300">
                      <MapPin className="w-4 h-4" />
                      <span>{[collective.location.city, collective.location.region, collective.location.country].filter(Boolean).join(', ')}</span>
                    </div>
                  )}
                  
                  {collective.website && (
                    <div className="flex items-center space-x-2 text-gray-300">
                      <Globe className="w-4 h-4" />
                      <a href={collective.website} target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300">
                        {collective.website}
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Recent Releases */}
              {recentReleases.length > 0 && (
                <div>
                  <h3 className="text-2xl font-bold text-white mb-4">Recent Releases</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {recentReleases.map((release) => (
                      <div key={release._id} className="card flex items-center space-x-4 p-4 bg-black/10 rounded-lg hover:bg-black/20 transition-colors">
                        <img
                          src={release.coverArt}
                          alt={release.title}
                          className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <Link 
                            to={`/tune/${release._id || release.uuid}`}
                            className="text-white font-medium truncate hover:text-purple-300 transition-colors cursor-pointer block"
                          >
                            {release.title}
                          </Link>
                          <p className="text-gray-400 text-sm truncate">{release.artist}</p>
                          <p className="text-purple-400 text-sm">{penceToPounds(release.stats.totalBidAmount)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Top Performing Media */}
              {topMedia.length > 0 && (
                <div>
                  <h3 className="text-2xl font-bold text-white mb-4">Top Performing Releases</h3>
                  <div className="space-y-2">
                    {topMedia.map((media, index) => (
                      <div key={media._id} className="card flex items-center space-x-4 p-4 bg-black/10 rounded-lg hover:bg-black/20 transition-colors">
                        <div className="flex-shrink-0">
                          <div className="flex items-center justify-center w-12 h-12 bg-purple-600/50 rounded-full">
                            <span className="text-white font-bold text-lg">{index + 1}</span>
                          </div>
                        </div>
                        <img
                          src={media.coverArt}
                          alt={media.title}
                          className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <Link 
                            to={`/tune/${media._id || media.uuid}`}
                            className="text-white font-medium truncate hover:text-purple-300 transition-colors cursor-pointer block"
                          >
                            {media.title}
                          </Link>
                          <p className="text-gray-400 text-sm truncate">{media.artist}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-purple-400 font-medium">{penceToPounds(media.stats.totalBidAmount)}</p>
                          <p className="text-gray-400 text-sm">{media.stats.bidCount} bids</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'members' && (
            <div>
              <h3 className="text-2xl font-bold text-white mb-4">Members</h3>
              {members && members.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {members.map((member, index) => {
                    const memberUser = typeof member.userId === 'string' 
                      ? null 
                      : member.userId;
                    const memberId = typeof member.userId === 'string' 
                      ? member.userId 
                      : (member.userId._id || member.userId.uuid || member.userId);
                    
                    return (
                      <div
                        key={index}
                        className="card bg-black/20 rounded-lg p-4 hover:bg-black/30 transition-colors"
                      >
                        {memberUser ? (
                          <Link to={`/profile/${memberUser.username || memberId}`}>
                            <div className="flex items-center space-x-4">
                              <img
                                src={memberUser.profilePic || DEFAULT_PROFILE_PIC}
                                alt={memberUser.username || 'Member'}
                                className="w-12 h-12 rounded-full object-cover"
                                onError={(e) => {
                                  e.currentTarget.src = DEFAULT_PROFILE_PIC;
                                }}
                              />
                              <div className="flex-1 min-w-0">
                                <h4 className="text-white font-medium truncate">
                                  {memberUser.username || 'Member'}
                                </h4>
                                <p className="text-gray-400 text-sm capitalize">{member.role}</p>
                                {member.instrument && (
                                  <p className="text-gray-500 text-xs">{member.instrument}</p>
                                )}
                              </div>
                            </div>
                          </Link>
                        ) : (
                          <div className="flex items-center space-x-4">
                            <img
                              src={DEFAULT_PROFILE_PIC}
                              alt="Member"
                              className="w-12 h-12 rounded-full object-cover"
                            />
                            <div className="flex-1 min-w-0">
                              <h4 className="text-white font-medium truncate">Member</h4>
                              <p className="text-gray-400 text-sm capitalize">{member.role}</p>
                              {member.instrument && (
                                <p className="text-gray-500 text-xs">{member.instrument}</p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-gray-400">No members found.</p>
              )}
            </div>
          )}

          {activeTab === 'media' && (
            <div>
              <h3 className="text-2xl font-bold text-white mb-4">All Releases</h3>
              {recentReleases.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {recentReleases.map((release) => (
                    <div key={release._id} className="card bg-black/20 rounded-lg p-4 hover:bg-black/30 transition-colors">
                      <img
                        src={release.coverArt}
                        alt={release.title}
                        className="w-full h-48 rounded-lg object-cover mb-4"
                      />
                      <Link 
                        to={`/tune/${release._id || release.uuid}`}
                        className="text-white font-medium truncate hover:text-purple-300 transition-colors cursor-pointer block mb-1"
                      >
                        {release.title}
                      </Link>
                      <p className="text-gray-400 text-sm mb-2 truncate">{release.artist}</p>
                      <div className="flex justify-between items-center">
                        <span className="text-purple-400 font-medium">
                          {penceToPounds(release.stats.totalBidAmount)}
                        </span>
                        <span className="text-gray-400 text-sm">
                          {release.stats.bidCount} bids
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-400">No releases found.</p>
              )}
            </div>
          )}
        </div>
          </>
        ) : (
          /* EDIT MODE - Tab Content */
          <>
            {editTab === 'info' && (
              /* Collective Info Tab - Show normal content when viewing info tab in edit mode */
              <div className="space-y-8">
                {/* Stats */}
                {collective.stats && (
                  <div className="mb-8">
                    <h2 className="text-2xl font-bold text-center text-white mb-4">Collective Statistics</h2>
                    <div className="grid grid-cols-3 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {collective.stats.memberCount !== undefined && (
                        <div className="card bg-black/20 rounded-lg p-6 text-center">
                          <Users className="w-8 h-8 text-purple-400 mx-auto mb-2" />
                          <div className="text-2xl font-bold text-white">{collective.stats.memberCount || 0}</div>
                          <div className="text-sm text-gray-300">Members</div>
                        </div>
                      )}
                      {collective.stats.releaseCount !== undefined && (
                        <div className="card bg-black/20 rounded-lg p-6 text-center">
                          <Music className="w-8 h-8 text-green-400 mx-auto mb-2" />
                          <div className="text-2xl font-bold text-white">{collective.stats.releaseCount || 0}</div>
                          <div className="text-sm text-gray-300">Releases</div>
                        </div>
                      )}
                      {collective.stats.globalCollectiveAggregate !== undefined && (
                        <div className="card bg-black/20 rounded-lg p-6 text-center">
                          <TrendingUp className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
                          <div className="text-2xl font-bold text-white">{penceToPounds(collective.stats.globalCollectiveAggregate || 0)}</div>
                          <div className="text-sm text-gray-300">Total Bids</div>
                        </div>
                      )}
                      {collective.stats.globalCollectiveBidCount !== undefined && (
                        <div className="card bg-black/20 rounded-lg p-6 text-center">
                          <Music className="w-8 h-8 text-cyan-400 mx-auto mb-2" />
                          <div className="text-2xl font-bold text-white">{collective.stats.globalCollectiveBidCount || 0}</div>
                          <div className="text-sm text-gray-300">Total Bid Count</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {/* Show message that user can switch to edit tab */}
                <div className="card p-6 text-center">
                  <p className="text-gray-300">Switch to the "Edit Collective" tab to modify collective details.</p>
                </div>
              </div>
            )}

            {editTab === 'edit' && (
              /* Edit Collective Tab - Edit Form */
              <div className="card p-6">
                <h2 className="text-2xl font-bold text-white mb-6">Edit Collective</h2>
                
                <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
                  {/* Basic Info */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-white font-medium mb-2">Collective Name *</label>
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="input"
                        placeholder="Collective name"
                      />
                    </div>
                    <div>
                      <label className="block text-white font-medium mb-2">Email *</label>
                      <input
                        type="email"
                        value={editForm.email}
                        onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                        className="input"
                        placeholder="collective@example.com"
                      />
                    </div>
                  </div>

                  <div>
                  <select
                    value={editForm.type}
                    onChange={(e) => setEditForm({ ...editForm, type: e.target.value as any })}
                    className="input"
                  >
                    <option value="collective">Collective</option>
                    <option value="band">Band</option>
                    <option value="production_company">Production Company</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-white font-medium mb-2">Founded Year</label>
                  <input
                    type="number"
                    value={editForm.foundedYear}
                    onChange={(e) => setEditForm({ ...editForm, foundedYear: e.target.value })}
                    className="input"
                    placeholder="2020"
                    min="1900"
                    max={new Date().getFullYear()}
                  />
                </div>
              </div>

              <div>
                <label className="block text-white font-medium mb-2">Website</label>
                <input
                  type="url"
                  value={editForm.website}
                  onChange={(e) => setEditForm({ ...editForm, website: e.target.value })}
                  className="input"
                  placeholder="https://example.com"
                />
              </div>

              {/* Location */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-white font-medium mb-2">City</label>
                  <input
                    type="text"
                    value={editForm.location.city}
                    onChange={(e) => setEditForm({ ...editForm, location: { ...editForm.location, city: e.target.value } })}
                    className="input"
                    placeholder="City"
                  />
                </div>
                <div>
                  <label className="block text-white font-medium mb-2">Region/State</label>
                  <input
                    type="text"
                    value={editForm.location.region}
                    onChange={(e) => setEditForm({ ...editForm, location: { ...editForm.location, region: e.target.value } })}
                    className="input"
                    placeholder="Region/State"
                  />
                </div>
                <div>
                  <label className="block text-white font-medium mb-2">Country</label>
                  <select
                    value={editForm.location.country}
                    onChange={(e) => {
                      const country = e.target.value;
                      const countryCode = getCountryCode(country);
                      setEditForm({ 
                        ...editForm, 
                        location: { 
                          ...editForm.location, 
                          country: country,
                          countryCode: countryCode
                        } 
                      });
                    }}
                    className="input"
                  >
                    <option value="">Select Country</option>
                    <option value="United Kingdom">United Kingdom</option>
                    <option value="United States">United States</option>
                    <option value="Canada">Canada</option>
                    <option value="Australia">Australia</option>
                    <option value="Germany">Germany</option>
                    <option value="France">France</option>
                    <option value="Spain">Spain</option>
                    <option value="Italy">Italy</option>
                    <option value="Netherlands">Netherlands</option>
                    <option value="Belgium">Belgium</option>
                    {/* Add more countries as needed */}
                  </select>
                </div>
              </div>

              {/* Genres */}
              <div>
                <label className="block text-white font-medium mb-2">Genres (comma-separated)</label>
                <input
                  type="text"
                  value={editForm.genres.join(', ')}
                  onChange={(e) => setEditForm({ ...editForm, genres: e.target.value.split(',').map(g => g.trim()).filter(g => g) })}
                  className="input"
                  placeholder="electronic, hip-hop, rock"
                />
              </div>

              {/* Social Media */}
              <div>
                <label className="block text-white font-medium mb-3">Social Media</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-white text-sm mb-2">Instagram</label>
                    <input
                      type="url"
                      value={editForm.socialMedia.instagram}
                      onChange={(e) => setEditForm({ ...editForm, socialMedia: { ...editForm.socialMedia, instagram: e.target.value } })}
                      className="input"
                      placeholder="https://instagram.com/..."
                    />
                  </div>
                  <div>
                    <label className="block text-white text-sm mb-2">Facebook</label>
                    <input
                      type="url"
                      value={editForm.socialMedia.facebook}
                      onChange={(e) => setEditForm({ ...editForm, socialMedia: { ...editForm.socialMedia, facebook: e.target.value } })}
                      className="input"
                      placeholder="https://facebook.com/..."
                    />
                  </div>
                  <div>
                    <label className="block text-white text-sm mb-2">YouTube</label>
                    <input
                      type="url"
                      value={editForm.socialMedia.youtube}
                      onChange={(e) => setEditForm({ ...editForm, socialMedia: { ...editForm.socialMedia, youtube: e.target.value } })}
                      className="input"
                      placeholder="https://youtube.com/..."
                    />
                  </div>
                  <div>
                    <label className="block text-white text-sm mb-2">Twitter</label>
                    <input
                      type="url"
                      value={editForm.socialMedia.twitter}
                      onChange={(e) => setEditForm({ ...editForm, socialMedia: { ...editForm.socialMedia, twitter: e.target.value } })}
                      className="input"
                      placeholder="https://twitter.com/..."
                    />
                  </div>
                  <div>
                    <label className="block text-white text-sm mb-2">SoundCloud</label>
                    <input
                      type="url"
                      value={editForm.socialMedia.soundcloud}
                      onChange={(e) => setEditForm({ ...editForm, socialMedia: { ...editForm.socialMedia, soundcloud: e.target.value } })}
                      className="input"
                      placeholder="https://soundcloud.com/..."
                    />
                  </div>
                  <div>
                    <label className="block text-white text-sm mb-2">Spotify</label>
                    <input
                      type="url"
                      value={editForm.socialMedia.spotify}
                      onChange={(e) => setEditForm({ ...editForm, socialMedia: { ...editForm.socialMedia, spotify: e.target.value } })}
                      className="input"
                      placeholder="https://open.spotify.com/..."
                    />
                  </div>
                </div>
              </div>

                {/* Action Buttons */}
                <div className="flex space-x-3 mt-6">
                  <button
                    onClick={handleSaveCollective}
                    disabled={!editForm.name || !editForm.email}
                    className="btn-primary flex-1 flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Save className="h-4 w-4" />
                    <span>Save Changes</span>
                  </button>
                  <button
                    onClick={exitEditMode}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Report Modal */}
      {showReportModal && collective && (
        <ReportModal
          isOpen={showReportModal}
          onClose={() => setShowReportModal(false)}
          reportType="label"
          targetId={collective._id}
          targetTitle={collective.name}
        />
      )}
    </div>
  );
};

export default CollectiveProfile;

