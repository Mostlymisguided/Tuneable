import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Users, Music, TrendingUp, Calendar, MapPin, Globe, Instagram, Facebook, Youtube, ArrowLeft, Flag, X, Save, Loader2, UserPlus } from 'lucide-react';
import { labelAPI } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { penceToPounds } from '../utils/currency';
import { DEFAULT_PROFILE_PIC } from '../constants';
import ReportModal from '../components/ReportModal';
import LabelTeamTable, { type LabelTeamMember } from '../components/labels/LabelTeamTable';
import InviteMemberModal from '../components/labels/InviteMemberModal';

interface Label {
  _id: string;
  name: string;
  slug: string;
  description: string;
  profilePicture: string;
  coverImage: string;
  email: string;
  website: string;
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
    tiktok?: string;
  };
  foundedYear?: number;
  genres?: string[];
  stats?: {
    artistCount?: number;
    releaseCount?: number;
    globalLabelAggregate?: number;
    globalLabelBidAvg?: number;
    globalLabelBidTop?: number;
    globalLabelBidCount?: number;
  };
  verificationStatus?: string;
  createdAt?: string;
  admins?: Array<{
    userId: string | { _id: string; uuid?: string };
    role: string;
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

interface Artist {
  _id: string;
  username: string;
  profilePic: string;
  creatorProfile: {
    artistName: string;
    genres: string[];
  };
}

const LabelProfile: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const [label, setLabel] = useState<Label | null>(null);
  const [recentReleases, setRecentReleases] = useState<Media[]>([]);
  const [topMedia, setTopMedia] = useState<Media[]>([]);
  const [artists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'artists' | 'media'>('overview');
  const [teamMembers, setTeamMembers] = useState<LabelTeamMember[]>([]);
  const [isLoadingTeam, setIsLoadingTeam] = useState(false);
  const [hasLoadedTeam, setHasLoadedTeam] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteType, setInviteType] = useState<'admin' | 'artist'>('artist');
  const [isRemoving, setIsRemoving] = useState(false);
  
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

  // Check if user can edit this label
  const canEditLabel = (labelData?: Label) => {
    const labelToCheck = labelData || label;
    if (!currentUser || !labelToCheck) return false;
    
    // Check if user is admin
    const isAdmin = currentUser.role && currentUser.role.includes('admin');
    if (isAdmin) return true;
    
    // Check if user is a label admin or owner
    const userLabelId = (currentUser as any)._id || currentUser.id || currentUser.uuid;
    const isLabelAdmin = labelToCheck.admins?.some((admin) => {
      const adminId = typeof admin.userId === 'string' 
        ? admin.userId 
        : (admin.userId._id || admin.userId.uuid || admin.userId);
      return (adminId === userLabelId || adminId === currentUser.uuid) && 
             (admin.role === 'owner' || admin.role === 'admin');
    });
    
    return !!isLabelAdmin;
  };

  // Check if user is label owner
  const isLabelOwner = () => {
    if (!currentUser || !label) return false;
    
    // Check if user is admin
    const isAdmin = currentUser.role && currentUser.role.includes('admin');
    if (isAdmin) return true;
    
    const userLabelId = (currentUser as any)._id || currentUser.id || currentUser.uuid;
    const isOwner = label.admins?.some((admin) => {
      const adminId = typeof admin.userId === 'string' 
        ? admin.userId 
        : (admin.userId._id || admin.userId.uuid || admin.userId);
      return (adminId === userLabelId || adminId === currentUser.uuid) && admin.role === 'owner';
    });
    
    return !!isOwner;
  };

  useEffect(() => {
    if (slug) {
      fetchLabelData();
    }
  }, [slug]);

  const fetchLabelData = async () => {
    try {
      setLoading(true);
      const data = await labelAPI.getLabelBySlug(slug!);
      
      setLabel(data.label);
      setRecentReleases(data.recentReleases || []);
      setTopMedia(data.topMedia || []);
      
      // Populate edit form when label loads (always populate, not just in edit mode)
      if (data.label && canEditLabel(data.label)) {
        setEditForm({
          name: data.label.name || '',
          description: data.label.description || '',
          email: data.label.email || '',
          website: data.label.website || '',
          foundedYear: data.label.foundedYear?.toString() || '',
          genres: data.label.genres || [],
          location: {
            city: data.label.location?.city || '',
            region: data.label.location?.region || '',
            country: data.label.location?.country || '',
            countryCode: data.label.location?.countryCode || ''
          },
          socialMedia: {
            instagram: data.label.socialMedia?.instagram || '',
            facebook: data.label.socialMedia?.facebook || '',
            soundcloud: data.label.socialMedia?.soundcloud || '',
            spotify: data.label.socialMedia?.spotify || '',
            youtube: data.label.socialMedia?.youtube || '',
            tiktok: data.label.socialMedia?.tiktok || ''
          }
        });
      }
    } catch (error: any) {
      console.error('Error fetching label data:', error);
      // Handle error (label not found, etc.)
    } finally {
      setLoading(false);
    }
  };

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
    if (isEditMode && editTab === 'ownership' && label && slug && canEditLabel(label) && !hasLoadedTeam && !isLoadingTeam) {
      void fetchLabelTeam(slug);
    }
  }, [isEditMode, editTab, label, slug, hasLoadedTeam, isLoadingTeam]);

  const fetchLabelTeam = async (labelSlug: string) => {
    if (!labelSlug) return;
    try {
      setIsLoadingTeam(true);
      const response = await labelAPI.getTeam(labelSlug);
      setTeamMembers(response.team || response.members || []);
      setHasLoadedTeam(true);
    } catch (error) {
      console.error('Error fetching label team:', error);
      setTeamMembers([]);
    } finally {
      setIsLoadingTeam(false);
    }
  };

  // Get current user's role in the label
  const getCurrentUserRole = (): 'owner' | 'admin' | 'member' | undefined => {
    if (!currentUser || !label || !teamMembers.length) return undefined;
    
    const userLabelId = (currentUser as any)._id || currentUser.id || currentUser.uuid;
    const currentMember = teamMembers.find((member) => {
      const memberId = typeof member.userId === 'object' 
        ? (member.userId._id || member.userId.uuid) 
        : member.userId;
      return memberId?.toString() === userLabelId?.toString();
    });
    
    return currentMember?.role as 'owner' | 'admin' | 'member' | undefined;
  };

  // Handle removing a member
  const handleRemoveMember = async (memberId: string, memberRole: string) => {
    if (!slug || !memberId) return;
    
    const userLabelId = (currentUser as any)?._id || currentUser?.id || currentUser?.uuid;
    const isSelfRemoval = memberId === userLabelId?.toString();
    
    // Show confirmation dialog
    const confirmMessage = isSelfRemoval
      ? 'Are you sure you want to remove yourself from this label?'
      : `Are you sure you want to remove this ${memberRole === 'admin' || memberRole === 'owner' ? 'admin' : 'artist'} from the label?`;
    
    if (!window.confirm(confirmMessage)) {
      return;
    }
    
    const isAdmin = memberRole === 'admin' || memberRole === 'owner';
    const isArtist = !isAdmin;
    
    try {
      setIsRemoving(true);
      
      if (isAdmin) {
        await labelAPI.removeAdmin(slug, memberId);
      } else if (isArtist) {
        await labelAPI.removeArtist(slug, memberId);
      }
      
      toast.success('Member removed successfully');
      await fetchLabelTeam(slug);
    } catch (error: any) {
      console.error('Error removing member:', error);
      toast.error(error.response?.data?.error || 'Failed to remove member');
    } finally {
      setIsRemoving(false);
    }
  };

  // Handle changing a member's role
  const handleChangeRole = async (memberId: string, newRole: string) => {
    if (!slug || !memberId) return;
    
    try {
      setIsRemoving(true);
      await labelAPI.changeAdminRole(slug, memberId, newRole as 'owner' | 'admin');
      toast.success('Role updated successfully');
      await fetchLabelTeam(slug);
    } catch (error: any) {
      console.error('Error changing role:', error);
      toast.error(error.response?.data?.error || 'Failed to change role');
    } finally {
      setIsRemoving(false);
    }
  };

  // Handle profile picture click
  const handleProfilePictureClick = () => {
    if (canEditLabel() && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Handle profile picture upload
  const handleProfilePictureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !label) return;

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }

    try {
      setIsUploadingProfilePicture(true);
      await labelAPI.uploadProfilePicture(label._id, file);
      toast.success('Label profile picture updated!');
      
      // Refresh label data
      await fetchLabelData();
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

  // Handle save label
  const handleSaveLabel = async () => {
    if (!label) return;

    try {
      const updates: any = {
        name: editForm.name,
        description: editForm.description || undefined,
        email: editForm.email,
        website: editForm.website || undefined,
        foundedYear: editForm.foundedYear ? parseInt(editForm.foundedYear) : undefined,
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
          tiktok: editForm.socialMedia.tiktok || undefined
        }
      };

      await labelAPI.updateLabel(label._id, updates);
      toast.success('Label updated successfully!');
      // Exit edit mode after successful save
      exitEditMode();
      await fetchLabelData(); // Refresh label data
    } catch (error: any) {
      console.error('Error updating label:', error);
      toast.error(error.response?.data?.error || 'Failed to update label');
    }
  };

  // Get social media links for display
  const getSocialMediaLinks = () => {
    if (!label?.socialMedia) return [];
    
    const links = [];
    if (label.socialMedia.instagram) {
      links.push({ name: 'Instagram', url: label.socialMedia.instagram, icon: Instagram, color: 'hover:text-pink-400' });
    }
    if (label.socialMedia.facebook) {
      links.push({ name: 'Facebook', url: label.socialMedia.facebook, icon: Facebook, color: 'hover:text-blue-400' });
    }
    if (label.socialMedia.youtube) {
      links.push({ name: 'YouTube', url: label.socialMedia.youtube, icon: Youtube, color: 'hover:text-red-400' });
    }
    
    return links;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading label profile...</div>
      </div>
    );
  }

  if (!label) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="text-white text-xl">Label not found</div>
      </div>
    );
  }

  const socialLinks = getSocialMediaLinks();

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
      <div className="container mx-auto px-4 py-8">
        {/* Label Profile Header */}
        <div className="mb-8 relative">
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 mb-4 rounded-lg font-medium transition-colors border border-white/20 bg-gray-700/40 text-white hover:bg-purple-500"
          >
            <ArrowLeft className="inline h-4 w-4 mr-2" />
            Back
          </button>

          {/* Edit Label & Report Buttons */}
          <div className='inline rounded-full items-center absolute right-0 top-0 mb-4 flex space-x-2'>
            {/* Report Button - Always visible */}
            <button
              onClick={() => setShowReportModal(true)}
              className="px-3 md:px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg shadow-lg transition-all flex items-center space-x-2 text-sm md:text-base"
            >
              <Flag className="h-4 w-4" />
              <span className="hidden sm:inline">Report</span>
            </button>
            
            {/* Edit Label Button - Only show if user can edit and not in edit mode */}
            {canEditLabel() && !isEditMode && (
              <button
                onClick={handleEditClick}
                className="px-3 md:px-4 py-2 bg-purple-600/40 hover:bg-purple-500 text-white font-semibold rounded-lg shadow-lg transition-all flex items-center space-x-2 text-sm md:text-base"
              >
                <span className="hidden sm:inline">Edit Label</span>
                <span className="sm:hidden">Edit</span>
              </button>
            )}
            {/* Exit Edit Mode Button - Only show if in edit mode */}
            {canEditLabel() && isEditMode && (
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
            {label.verificationStatus === 'verified' && (
              <div className="absolute top-0 right-0 p-4">
                <span className="px-3 py-2 bg-blue-500 text-white text-xs md:text-sm rounded-full font-semibold">
                  Verified
                </span>
              </div>
            )}

            {/* Profile Picture */}
            <div className="flex-shrink-0 relative">
              {label.profilePicture ? (
                <img
                  src={label.profilePicture}
                  alt={`${label.name} profile picture`}
                  className={`rounded-lg shadow-xl object-cover border-2 border-purple-500/30 ${canEditLabel() ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
                  style={{ width: '200px', height: '200px' }}
                  onClick={handleProfilePictureClick}
                  title={canEditLabel() ? 'Click to change profile picture' : ''}
                  onError={(e) => {
                    e.currentTarget.src = DEFAULT_PROFILE_PIC;
                  }}
                />
              ) : (
                <img
                  src={DEFAULT_PROFILE_PIC}
                  alt={`${label.name} profile picture`}
                  className={`rounded-lg shadow-xl object-cover border-2 border-purple-500/30 ${canEditLabel() ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
                  style={{ width: '200px', height: '200px' }}
                  onClick={handleProfilePictureClick}
                  title={canEditLabel() ? 'Click to upload profile picture' : ''}
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
            
            {/* Label Info */}
            <div className="ml-6 flex-1 text-white">
              <div className="">
                <h1 className="text-4xl font-bold mb-4">{label.name}</h1>
                {label.description && (
                  <p className="text-xl text-gray-300 mb-4 max-w-2xl">{label.description}</p>
                )}
                
                {/* Location */}
                {label.location && (label.location.city || label.location.region || label.location.country) && (
                  <div className="mb-4">
                    <div className="inline-flex items-center space-x-2 px-3 py-1.5 bg-purple-900/30 border border-purple-500/30 rounded-full text-gray-300 text-sm w-fit">
                      <MapPin className="h-3.5 w-3.5" />
                      <span>
                        {[label.location.city, label.location.region, label.location.country].filter(Boolean).join(', ')}
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
                {label.website && (
                  <div className="mb-4">
                    <a
                      href={label.website}
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
                {label.genres && label.genres.length > 0 && (
                  <div className="mb-4 flex flex-wrap gap-2">
                    {label.genres.map((genre, index) => (
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

        {/* Tab Navigation - Only show when in edit mode */}
        {isEditMode && canEditLabel() && (
          <div className="mb-6 border-b border-gray-700">
            <nav className="flex space-x-8">
              <button
                onClick={() => handleEditTabChange('info')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  editTab === 'info'
                    ? 'border-purple-500 text-purple-400'
                    : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
                Label Info
              </button>
              <button
                onClick={() => handleEditTabChange('edit')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  editTab === 'edit'
                    ? 'border-purple-500 text-purple-400'
                    : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
                Edit Label
              </button>
              <button
                onClick={() => handleEditTabChange('ownership')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  editTab === 'ownership'
                    ? 'border-purple-500 text-purple-400'
                    : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
                Ownership
              </button>
            </nav>
          </div>
        )}

        {/* Tab Content */}
        {!isEditMode ? (
          /* NORMAL VIEW - All existing content */
          <>
        {/* Stats */}
        {label.stats && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-center text-white mb-4">Label Statistics</h2>
            <div className="grid grid-cols-3 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {label.stats.artistCount !== undefined && (
                <div className="card bg-black/20 rounded-lg p-6 text-center">
                  <Users className="w-8 h-8 text-purple-400 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-white">{label.stats.artistCount || 0}</div>
                  <div className="text-sm text-gray-300">Artists</div>
                </div>
              )}
              {label.stats.releaseCount !== undefined && (
                <div className="card bg-black/20 rounded-lg p-6 text-center">
                  <Music className="w-8 h-8 text-green-400 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-white">{label.stats.releaseCount || 0}</div>
                  <div className="text-sm text-gray-300">Releases</div>
                </div>
              )}
              {label.stats.globalLabelAggregate !== undefined && (
                <div className="card bg-black/20 rounded-lg p-6 text-center">
                  <TrendingUp className="w-8 h-8 text-blue-400 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-white">{penceToPounds(label.stats.globalLabelAggregate || 0)}</div>
                  <div className="text-sm text-gray-300">Total Bids</div>
                </div>
              )}
              {label.stats.globalLabelBidCount !== undefined && (
                <div className="card bg-black/20 rounded-lg p-6 text-center">
                  <Calendar className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-white">{label.stats.globalLabelBidCount || 0}</div>
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
                { id: 'artists', label: 'Artists' },
                { id: 'media', label: 'Releases' },
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
              {/* Label Information */}
              <div className="card bg-black/20 rounded-lg p-6">
                <h3 className="text-xl font-semibold text-white mb-4">Label Information</h3>
                <div className="space-y-3">
                  {label.foundedYear && (
                    <div className="flex items-center space-x-2 text-gray-300">
                      <Calendar className="w-4 h-4" />
                      <span>Founded {label.foundedYear}</span>
                    </div>
                  )}
                  
                  {label.location && (label.location.city || label.location.region || label.location.country) && (
                    <div className="flex items-center space-x-2 text-gray-300">
                      <MapPin className="w-4 h-4" />
                      <span>{[label.location.city, label.location.region, label.location.country].filter(Boolean).join(', ')}</span>
                    </div>
                  )}
                  
                  {label.website && (
                    <div className="flex items-center space-x-2 text-gray-300">
                      <Globe className="w-4 h-4" />
                      <a href={label.website} target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300">
                        {label.website}
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

          {activeTab === 'artists' && (
            <div>
              <h3 className="text-2xl font-bold text-white mb-4">Artists</h3>
              {artists.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {artists.map((artist) => (
                    <Link
                      key={artist._id}
                      to={`/profile/${artist.username}`}
                      className="card bg-black/20 rounded-lg p-4 hover:bg-black/30 transition-colors"
                    >
                      <div className="flex items-center space-x-4">
                        <img
                          src={artist.profilePic}
                          alt={artist.username}
                          className="w-12 h-12 rounded-full object-cover"
                        />
                        <div className="flex-1 min-w-0">
                          <h4 className="text-white font-medium truncate">
                            {artist.creatorProfile?.artistName || artist.username}
                          </h4>
                          <p className="text-gray-400 text-sm truncate">@{artist.username}</p>
                          {artist.creatorProfile?.genres && artist.creatorProfile.genres.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {artist.creatorProfile.genres.slice(0, 2).map((genre, index) => (
                                <span key={index} className="bg-purple-600/50 text-white px-2 py-0.5 rounded text-xs">
                                  {genre}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-gray-400">No artists found.</p>
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
              /* Label Info Tab - Show normal content when viewing info tab in edit mode */
              <div className="space-y-8">
                {/* Stats */}
                {label.stats && (
                  <div className="mb-8">
                    <h2 className="text-2xl font-bold text-center text-white mb-4">Label Statistics</h2>
                    <div className="grid grid-cols-3 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {label.stats.artistCount !== undefined && (
                        <div className="card bg-black/20 rounded-lg p-6 text-center">
                          <Users className="w-8 h-8 text-purple-400 mx-auto mb-2" />
                          <div className="text-2xl font-bold text-white">{label.stats.artistCount || 0}</div>
                          <div className="text-sm text-gray-300">Artists</div>
                        </div>
                      )}
                      {label.stats.releaseCount !== undefined && (
                        <div className="card bg-black/20 rounded-lg p-6 text-center">
                          <Music className="w-8 h-8 text-green-400 mx-auto mb-2" />
                          <div className="text-2xl font-bold text-white">{label.stats.releaseCount || 0}</div>
                          <div className="text-sm text-gray-300">Releases</div>
                        </div>
                      )}
                      {label.stats.globalLabelAggregate !== undefined && (
                        <div className="card bg-black/20 rounded-lg p-6 text-center">
                          <TrendingUp className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
                          <div className="text-2xl font-bold text-white">{penceToPounds(label.stats.globalLabelAggregate || 0)}</div>
                          <div className="text-sm text-gray-300">Total Bids</div>
                        </div>
                      )}
                      {label.stats.globalLabelBidCount !== undefined && (
                        <div className="card bg-black/20 rounded-lg p-6 text-center">
                          <Music className="w-8 h-8 text-cyan-400 mx-auto mb-2" />
                          <div className="text-2xl font-bold text-white">{label.stats.globalLabelBidCount || 0}</div>
                          <div className="text-sm text-gray-300">Total Bid Count</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {/* Show message that user can switch to edit tab */}
                <div className="card p-6 text-center">
                  <p className="text-gray-300">Switch to the "Edit Label" tab to modify label details.</p>
                </div>
              </div>
            )}

            {editTab === 'edit' && (
              /* Edit Label Tab - Edit Form */
              <div className="card p-6">
                <h2 className="text-2xl font-bold text-white mb-6">Edit Label</h2>
                
                <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
                  {/* Basic Info */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-white font-medium mb-2">Label Name *</label>
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="input"
                        placeholder="Label name"
                      />
                    </div>
                    <div>
                      <label className="block text-white font-medium mb-2">Email *</label>
                      <input
                        type="email"
                        value={editForm.email}
                        onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                        className="input"
                        placeholder="label@example.com"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-white font-medium mb-2">Description</label>
                    <textarea
                      value={editForm.description}
                      onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                      className="input"
                      rows={3}
                      placeholder="Tell us about your label..."
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                </div>

                {/* Action Buttons */}
                <div className="flex space-x-3 mt-6">
                  <button
                    onClick={handleSaveLabel}
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

            {editTab === 'ownership' && (
              <div className="card p-6 space-y-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-bold text-white">Label Ownership</h2>
                    <p className="text-sm text-gray-300">
                      Owners and administrators with management access to this label.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isLabelOwner() && (
                      <button
                        onClick={() => {
                          setInviteType('admin');
                          setShowInviteModal(true);
                        }}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-sm text-white transition-colors"
                      >
                        <UserPlus className="h-4 w-4" />
                        Invite Admin
                      </button>
                    )}
                    {canEditLabel() && (
                      <button
                        onClick={() => {
                          setInviteType('artist');
                          setShowInviteModal(true);
                        }}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm text-white transition-colors"
                      >
                        <UserPlus className="h-4 w-4" />
                        Invite Artist
                      </button>
                    )}
                    {slug && (
                      <button
                        onClick={() => fetchLabelTeam(slug)}
                        disabled={isLoadingTeam}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm text-gray-200 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        <Loader2 className={`h-4 w-4 ${isLoadingTeam ? 'animate-spin' : 'hidden'}`} />
                        {!isLoadingTeam && 'Refresh'}
                        {isLoadingTeam && 'Refreshing...'}
                      </button>
                    )}
                  </div>
                </div>

                {isLoadingTeam && !hasLoadedTeam ? (
                  <div className="flex items-center justify-center py-12 text-gray-300">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    Loading ownership roster...
                  </div>
                ) : (
                  <LabelTeamTable 
                    members={teamMembers} 
                    isEditable 
                    currentUserId={(currentUser as any)?._id || currentUser?.id || currentUser?.uuid}
                    currentUserRole={getCurrentUserRole()}
                    onRemove={handleRemoveMember}
                    onChangeRole={handleChangeRole}
                    isRemoving={isRemoving}
                  />
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Report Modal */}
      {label && (
        <ReportModal
          isOpen={showReportModal}
          onClose={() => setShowReportModal(false)}
          reportType="label"
          targetId={label._id}
          targetTitle={label.name}
        />
      )}

      {/* Invite Member Modal */}
      {slug && (
        <InviteMemberModal
          isOpen={showInviteModal}
          onClose={() => setShowInviteModal(false)}
          labelSlug={slug}
          inviteType={inviteType}
          onSuccess={() => {
            if (slug) {
              fetchLabelTeam(slug);
            }
          }}
        />
      )}
    </div>
  );
};

export default LabelProfile;
