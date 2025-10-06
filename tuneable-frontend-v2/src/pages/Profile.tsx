import React, { useState, useEffect, useRef } from 'react';
import { authAPI } from '../lib/api';
import { toast } from 'react-toastify';
import { 
  User, 
  MapPin, 
  Mail, 
  Phone, 
  Camera, 
  Upload, 
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
    country?: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
  };
  balance: number;
  personalInviteCode: string;
  facebookId?: string;
  role: string[];
}

const Profile: React.FC = () => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Edit form state
  const [editForm, setEditForm] = useState({
    givenName: '',
    familyName: '',
    cellPhone: '',
    homeLocation: {
      city: '',
      country: ''
    }
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
          country: response.user.homeLocation?.country || ''
        }
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
    } catch (error) {
      console.error('Error uploading profile picture:', error);
      toast.error('Failed to upload profile picture');
    } finally {
      setIsUploading(false);
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
          country: profile?.homeLocation?.country || ''
        }
      });
    }
    setIsEditing(!isEditing);
  };

  const handleSaveProfile = async () => {
    try {
      await authAPI.updateProfile(editForm);
      
      if (profile) {
        setProfile({
          ...profile,
          ...editForm
        });
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
      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-8">
          <div className="flex items-center space-x-6">
            {/* Profile Picture */}
            <div className="relative">
              <div className="w-24 h-24 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center">
                {profile.profilePic ? (
                  <img
                    src={profile.profilePic}
                    alt="Profile"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-12 h-12 text-gray-400" />
                )}
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="absolute -bottom-2 -right-2 bg-white rounded-full p-2 shadow-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                {isUploading ? (
                  <Upload className="w-4 h-4 text-purple-600 animate-spin" />
                ) : (
                  <Camera className="w-4 h-4 text-purple-600" />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleProfilePicUpload}
                className="hidden"
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

          {/* Profile Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Personal Information */}
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">Personal Information</h2>
              
              {isEditing ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">
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
              <h2 className="text-xl font-semibold text-gray-900">Location & Social</h2>
              
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
                        {profile.homeLocation?.city && profile.homeLocation?.country
                          ? `${profile.homeLocation.city}, ${profile.homeLocation.country}`
                          : 'Not set'
                        }
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
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
