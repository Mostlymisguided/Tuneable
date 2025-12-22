import React, { useState, useEffect, useRef } from 'react';
import { authAPI } from '../lib/api';
import { toast } from 'react-toastify';
import { DEFAULT_PROFILE_PIC } from '../constants';
import { 
  User, 
  MapPin, 
  Mail, 
  Phone, 
  Camera,
  Loader2,
  Edit3, 
  Save, 
  X,
  Facebook,
  Globe,
  DollarSign,
  Gift
} from 'lucide-react';

interface UserProfile {
  id: string;
  username: string;
  email: string;
  profilePic?: string;
  cellPhone?: string;
  givenName?: string;
  familyName?: string;
  homeLocation?: {
    city?: string;
    region?: string;
    country?: string;
    countryCode?: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
    detectedFromIP?: boolean;
  };
  secondaryLocation?: {
    city?: string;
    region?: string;
    country?: string;
    countryCode?: string;
    coordinates?: {
      lat: number;
      lng: number;
  };
  } | null;
  balance: number;
  personalInviteCode: string;
  facebookId?: string;
  role: string[];
}

const Profile: React.FC = () => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Edit form state
  const [editForm, setEditForm] = useState({
    givenName: '',
    familyName: '',
    cellPhone: '',
    homeLocation: {
      city: '',
      region: '',
      country: ''
    },
    secondaryLocation: null as {
      city: string;
      region: string;
      country: string;
    } | null,
    defaultTip: 0.11
  });

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      setIsLoading(true);
      const response = await authAPI.getProfile();
      setProfile(response.user);
      
      // Initialize edit form with current values
      setEditForm({
        givenName: (response.user as any).givenName || '',
        familyName: (response.user as any).familyName || '',
        cellPhone: (response.user as any).cellPhone || '',
        homeLocation: {
          city: response.user.homeLocation?.city || '',
          region: response.user.homeLocation?.region || '',
          country: response.user.homeLocation?.country || ''
        },
        secondaryLocation: response.user.secondaryLocation ? {
          city: response.user.secondaryLocation.city || '',
          region: response.user.secondaryLocation.region || '',
          country: response.user.secondaryLocation.country || ''
        } : null,
        defaultTip: (response.user as any).preferences?.defaultTip || 0.11
      });
    } catch (error) {
      console.error('Error fetching profile:', error);
      toast.error('Failed to load profile');
    } finally {
      setIsLoading(false);
    }
  };

  const handleProfilePicUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be smaller than 5MB');
      return;
    }

    try {
      setIsUploading(true);
      const response = await authAPI.uploadProfilePic(file);
      
      if (profile) {
        setProfile({
          ...profile,
          profilePic: response.user.profilePic
        });
      }
      
      toast.success('Profile picture updated successfully!');
    } catch (error: any) {
      console.error('Error uploading profile picture:', error);
      // Show actual error message from server if available
      const errorMessage = error.response?.data?.error || error.response?.data?.details || 'Failed to upload profile picture';
      toast.error(errorMessage);
    } finally {
      setIsUploading(false);
      // Reset file input to allow re-uploading the same file
      if (event.target) {
        event.target.value = '';
      }
    }
  };

  const handleEditToggle = () => {
    if (isEditing) {
      // Reset form to current values
      setEditForm({
        givenName: profile?.givenName || '',
        familyName: profile?.familyName || '',
        cellPhone: profile?.cellPhone || '',
        homeLocation: {
          city: profile?.homeLocation?.city || '',
          region: profile?.homeLocation?.region || '',
          country: profile?.homeLocation?.country || ''
        },
        secondaryLocation: profile?.secondaryLocation ? {
          city: profile.secondaryLocation.city || '',
          region: profile.secondaryLocation.region || '',
          country: profile.secondaryLocation.country || ''
        } : null,
        defaultTip: (profile as any)?.preferences?.defaultTip || 0.11
      });
    }
    setIsEditing(!isEditing);
  };

  const handleSaveProfile = async () => {
    try {
      const updateData: any = {
        givenName: editForm.givenName,
        familyName: editForm.familyName,
        cellPhone: editForm.cellPhone,
        homeLocation: editForm.homeLocation,
        secondaryLocation: editForm.secondaryLocation,
      };

      // Update preferences separately
      if (editForm.defaultTip !== undefined) {
        updateData.preferences = {
          defaultTip: editForm.defaultTip
        };
      }

      await authAPI.updateProfile(updateData);
      
      if (profile) {
        setProfile({
          ...profile,
          ...editForm,
          preferences: {
            ...(profile as any)?.preferences,
            defaultTip: editForm.defaultTip
          }
        } as any);
      }
      
      setIsEditing(false);
      toast.success('Profile updated successfully!');
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error('Failed to update profile');
    }
  };

  const copyInviteCode = () => {
    if (profile?.personalInviteCode) {
      navigator.clipboard.writeText(profile.personalInviteCode);
      toast.success('Invite code copied to clipboard!');
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-400">Loading profile...</div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-red-400">Failed to load profile</div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="backdrop-blur-md bg-gray-900/20 rounded-lg shadow-lg overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-8">
          <div className="flex items-center space-x-6">
            {/* Profile Picture */}
            <div className="relative group">
              <div 
                className="w-48 h-48 rounded-full overflow-hidden bg-white flex items-center justify-center cursor-pointer shadow-xl"
                onClick={() => fileInputRef.current?.click()}
              >
                <img
                  src={profile.profilePic || DEFAULT_PROFILE_PIC}
                  alt="Profile"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.src = DEFAULT_PROFILE_PIC;
                  }}
                />
                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-opacity flex items-center justify-center rounded-full">
                  {isUploading ? (
                    <Loader2 className="w-8 h-8 text-white animate-spin" />
                  ) : (
                    <Camera className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </div>
              </div>
              {/* Hidden file input - absolutely positioned off-screen */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleProfilePicUpload}
                style={{ display: 'none' }}
              />
            </div>

            {/* Basic Info */}
            <div className="flex-1 text-white">
              <h1 className="text-3xl font-bold">
                {profile.givenName && profile.familyName 
                  ? `${profile.givenName} ${profile.familyName}`
                  : profile.username
                }
              </h1>
              <p className="text-purple-100 text-lg">@{profile.username}</p>
              {profile.facebookId && (
                <div className="flex items-center space-x-1 mt-2">
                  <Facebook className="w-4 h-4" />
                  <span className="text-sm">Connected via Facebook</span>
                </div>
              )}
            </div>

            {/* Edit Button */}
            <button
              onClick={handleEditToggle}
              className="bg-white bg-opacity-20 hover:bg-opacity-30 text-white px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
            >
              {isEditing ? <X className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
              <span>{isEditing ? 'Cancel' : 'Edit'}</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Balance Card */}
          <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-lg p-4 text-white">
            <div className="flex items-center space-x-3">
              <DollarSign className="w-6 h-6" />
              <div>
                <p className="text-green-100 text-sm">Wallet Balance</p>
                <p className="text-2xl font-bold">£{profile.balance.toFixed(2)}</p>
              </div>
            </div>
          </div>

          {/* TuneBytes Card */}
          <div className="bg-gradient-to-r from-purple-500 to-purple-600 rounded-lg p-4 text-white">
            <div className="flex items-center space-x-3">
              <Gift className="w-6 h-6" />
              <div>
                <p className="text-purple-100 text-sm">TuneBytes Earned</p>
                <p className="text-2xl font-bold">{(profile as any).tuneBytes?.toFixed(2) || '0.00'}</p>
                <p className="text-purple-100 text-xs mt-1">
                  Earned by discovering popular music
                </p>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-purple-400">
              <p className="text-purple-100 text-xs">
                💡 TuneBytes can be redeemed for artist merchandise, concert tickets, and exclusive perks in the future!
              </p>
            </div>
          </div>

          {/* Profile Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Personal Information */}
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-300">Personal Information</h2>
              
              {isEditing ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      First Name
                    </label>
                    <input
                      type="text"
                      value={editForm.givenName}
                      onChange={(e) => setEditForm({...editForm, givenName: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="Enter first name"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Last Name
                    </label>
                    <input
                      type="text"
                      value={editForm.familyName}
                      onChange={(e) => setEditForm({...editForm, familyName: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="Enter last name"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      value={editForm.cellPhone}
                      onChange={(e) => setEditForm({...editForm, cellPhone: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="Enter phone number"
                    />
                  </div>

                  <button
                    onClick={handleSaveProfile}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
                  >
                    <Save className="w-4 h-4" />
                    <span>Save Changes</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {profile.givenName && (
                    <div className="flex items-center space-x-3">
                      <User className="w-5 h-5 text-gray-400" />
                      <div>
                        <p className="text-sm text-gray-500">First Name</p>
                        <p className="font-medium">{profile.givenName}</p>
                      </div>
                    </div>
                  )}
                  
                  {profile.familyName && (
                    <div className="flex items-center space-x-3">
                      <User className="w-5 h-5 text-gray-400" />
                      <div>
                        <p className="text-sm text-gray-500">Last Name</p>
                        <p className="font-medium">{profile.familyName}</p>
                      </div>
                    </div>
                  )}

                  {profile.cellPhone && (
                    <div className="flex items-center space-x-3">
                      <Phone className="w-5 h-5 text-gray-400" />
                      <div>
                        <p className="text-sm text-gray-500">Phone</p>
                        <p className="font-medium">{profile.cellPhone}</p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center space-x-3">
                    <Mail className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="text-sm text-gray-500">Email</p>
                      <p className="font-medium">{profile.email || 'Not provided'}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Location & Social */}
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-300">Location & Social</h2>
              
              {isEditing ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      City
                    </label>
                    <input
                      type="text"
                      value={editForm.homeLocation.city}
                      onChange={(e) => setEditForm({
                        ...editForm, 
                        homeLocation: {...editForm.homeLocation, city: e.target.value}
                      })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="Enter city"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Region/State
                    </label>
                    <input
                      type="text"
                      value={editForm.homeLocation.region}
                      onChange={(e) => setEditForm({
                        ...editForm, 
                        homeLocation: {...editForm.homeLocation, region: e.target.value}
                      })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="Enter region/state"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Country
                    </label>
                    <input
                      type="text"
                      value={editForm.homeLocation.country}
                      onChange={(e) => setEditForm({
                        ...editForm, 
                        homeLocation: {...editForm.homeLocation, country: e.target.value}
                      })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="Enter country"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center space-x-3">
                    <MapPin className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="text-sm text-gray-500">Location</p>
                      <p className="font-medium">
                        {(() => {
                          const location = profile.homeLocation;
                          if (location?.city && location?.country) {
                            return location.region 
                              ? `${location.city}, ${location.region}, ${location.country}`
                              : `${location.city}, ${location.country}`;
                          }
                          return 'Not set';
                        })()}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    <Gift className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="text-sm text-gray-500">Invite Code</p>
                      <div className="flex items-center space-x-2">
                        <p className="font-medium font-mono">{profile.personalInviteCode}</p>
                        <button
                          onClick={copyInviteCode}
                          className="text-purple-600 hover:text-purple-700 text-sm"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  </div>

                  {profile.role && profile.role.length > 0 && (
                    <div className="flex items-center space-x-3">
                      <Globe className="w-5 h-5 text-gray-400" />
                      <div>
                        <p className="text-sm text-gray-500">Roles</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {profile.role.map((role, index) => (
                            <span
                              key={index}
                              className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full"
                            >
                              {role}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Preferences Section */}
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-300">Preferences</h2>
              
              {isEditing ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Default Tip Amount (£)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={editForm.defaultTip}
                      onChange={(e) => setEditForm({...editForm, defaultTip: parseFloat(e.target.value) || 0.11})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="0.11"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Default tip amount when placing bids (minimum: £0.01)
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Default Tip:</span>
                    <span className="text-white">£{((profile as any)?.preferences?.defaultTip || 0.11).toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default Profile;
