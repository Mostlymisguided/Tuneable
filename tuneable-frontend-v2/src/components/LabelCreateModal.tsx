import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { X, Loader2, Image, Facebook, Youtube, Music } from 'lucide-react';
import { labelAPI } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

interface LabelCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (label: any) => void; // Optional callback when label is created
}

const LabelCreateModal: React.FC<LabelCreateModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [profilePicture, setProfilePicture] = useState<File | null>(null);
  const [profilePicturePreview, setProfilePicturePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [userType, setUserType] = useState<'owner' | 'affiliated-artist'>('owner');
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    email: '',
    website: '',
    genres: [] as string[],
    foundedYear: '',
    socialMedia: {
      facebook: '',
      youtube: '',
      soundcloud: ''
    }
  });

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setFormData({
        name: '',
        description: '',
        email: user?.email || '',
        website: '',
        genres: [],
        foundedYear: '',
        socialMedia: {
          facebook: '',
          youtube: '',
          soundcloud: ''
        }
      });
      setProfilePicture(null);
      setProfilePicturePreview(null);
      setUserType('owner');
    }
  }, [isOpen, user]);

  // Handle profile picture selection
  const handleProfilePictureChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
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

    setProfilePicture(file);

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setProfilePicturePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSocialMediaChange = (platform: 'facebook' | 'youtube' | 'soundcloud', value: string) => {
    setFormData(prev => ({
      ...prev,
      socialMedia: {
        ...prev.socialMedia,
        [platform]: value
      }
    }));
  };

  const handleCreateLabel = async () => {
    if (!formData.name || !formData.email) {
      toast.error('Label name and email are required');
      return;
    }

    try {
      setIsLoading(true);
      
      // Create FormData for file upload
      const createData = new FormData();
      createData.append('name', formData.name);
      createData.append('email', formData.email);
      if (formData.description) createData.append('description', formData.description);
      if (formData.website) createData.append('website', formData.website);
      if (formData.genres.length > 0) {
        formData.genres.forEach(genre => createData.append('genres', genre));
      }
      if (formData.foundedYear) createData.append('foundedYear', formData.foundedYear);
      if (profilePicture) createData.append('profilePicture', profilePicture);
      
      // Add social media links
      if (formData.socialMedia.facebook) {
        createData.append('socialMedia[facebook]', formData.socialMedia.facebook);
      }
      if (formData.socialMedia.youtube) {
        createData.append('socialMedia[youtube]', formData.socialMedia.youtube);
      }
      if (formData.socialMedia.soundcloud) {
        createData.append('socialMedia[soundcloud]', formData.socialMedia.soundcloud);
      }
      
      // Add user type (owner or affiliated-artist)
      createData.append('userType', userType);
      
      const response = await labelAPI.createLabel(createData);
      
      toast.success('Label created successfully!');
      
      // Call onSuccess callback if provided
      if (onSuccess) {
        onSuccess(response.label);
      } else {
        // Default behavior: navigate to label profile
        if (response.label?.slug) {
          navigate(`/label/${response.label.slug}`);
        }
      }
      
      // Close modal
      onClose();
    } catch (error: any) {
      console.error('Error creating label:', error);
      toast.error(error.response?.data?.error || 'Failed to create label');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[10000] p-4">
      <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-white">Create Label</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="block text-white font-medium mb-2">Label Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
              placeholder="Enter label name"
            />
          </div>
          
          <div>
            <label className="block text-white font-medium mb-2">Email *</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
              placeholder="label@example.com"
            />
          </div>
          
          <div>
            <label className="block text-white font-medium mb-2">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
              rows={3}
              placeholder="Tell us about your label..."
            />
          </div>
          
          <div>
            <label className="block text-white font-medium mb-2">Website</label>
            <input
              type="url"
              value={formData.website}
              onChange={(e) => setFormData(prev => ({ ...prev, website: e.target.value }))}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
              placeholder="https://example.com"
            />
          </div>
          
          <div>
            <label className="block text-white font-medium mb-2">Founded Year</label>
            <input
              type="number"
              value={formData.foundedYear}
              onChange={(e) => setFormData(prev => ({ ...prev, foundedYear: e.target.value }))}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
              placeholder="2020"
              min="1900"
              max={new Date().getFullYear()}
            />
          </div>

          {/* Social Media Links Section */}
          <div>
            <label className="block text-white font-medium mb-3">Social Media Links (Optional)</label>
            <div className="space-y-3">
              <div>
                <label className="flex items-center text-gray-300 text-sm mb-1">
                  <Facebook className="h-4 w-4 mr-2" />
                  Facebook
                </label>
                <input
                  type="url"
                  value={formData.socialMedia.facebook}
                  onChange={(e) => handleSocialMediaChange('facebook', e.target.value)}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
                  placeholder="https://facebook.com/yourlabel"
                />
              </div>
              
              <div>
                <label className="flex items-center text-gray-300 text-sm mb-1">
                  <Youtube className="h-4 w-4 mr-2" />
                  YouTube
                </label>
                <input
                  type="url"
                  value={formData.socialMedia.youtube}
                  onChange={(e) => handleSocialMediaChange('youtube', e.target.value)}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
                  placeholder="https://youtube.com/@yourlabel"
                />
              </div>
              
              <div>
                <label className="flex items-center text-gray-300 text-sm mb-1">
                  <Music className="h-4 w-4 mr-2" />
                  SoundCloud
                </label>
                <input
                  type="url"
                  value={formData.socialMedia.soundcloud}
                  onChange={(e) => handleSocialMediaChange('soundcloud', e.target.value)}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
                  placeholder="https://soundcloud.com/yourlabel"
                />
              </div>
            </div>
          </div>

          {/* User Type Selection */}
          <div>
            <label className="block text-white font-medium mb-3">I am:</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setUserType('owner')}
                className={`px-4 py-3 rounded-lg border-2 font-medium transition-colors ${
                  userType === 'owner'
                    ? 'bg-purple-600 border-purple-500 text-white'
                    : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-gray-500'
                }`}
              >
                Label Owner
              </button>
              <button
                type="button"
                onClick={() => setUserType('affiliated-artist')}
                className={`px-4 py-3 rounded-lg border-2 font-medium transition-colors ${
                  userType === 'affiliated-artist'
                    ? 'bg-purple-600 border-purple-500 text-white'
                    : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-gray-500'
                }`}
              >
                Affiliated Artist
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              {userType === 'owner' 
                ? 'You own or manage this label' 
                : 'You are an artist affiliated with this label'}
            </p>
          </div>

          <div>
            <label className="block text-white font-medium mb-2">Profile Picture</label>
            <div className="flex items-center space-x-4">
              {profilePicturePreview ? (
                <img
                  src={profilePicturePreview}
                  alt="Profile preview"
                  className="w-20 h-20 rounded-lg object-cover border border-gray-600"
                />
              ) : (
                <div className="w-20 h-20 rounded-lg bg-gray-700 border border-gray-600 flex items-center justify-center">
                  <Image className="w-8 h-8 text-gray-400" />
                </div>
              )}
              <div className="flex-1">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg text-white text-sm transition-colors"
                >
                  {profilePicture ? 'Change Picture' : 'Upload Picture'}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleProfilePictureChange}
                  className="hidden"
                />
                {profilePicture && (
                  <p className="text-xs text-gray-400 mt-1">{profilePicture.name}</p>
                )}
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex space-x-3 mt-6">
          <button
            onClick={handleCreateLabel}
            disabled={isLoading || !formData.name || !formData.email}
            className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
          >
            {isLoading ? (
              <span className="flex items-center justify-center space-x-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Creating...</span>
              </span>
            ) : (
              'Create Label'
            )}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default LabelCreateModal;

