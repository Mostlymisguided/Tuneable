import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { creatorAPI } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import {
  User,
  Music,
  Award,
  Link as LinkIcon,
  Building,
  Upload,
  CheckCircle,
  ArrowLeft,
  ArrowRight,
  Loader2,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Shield,
  Facebook,
  Instagram
} from 'lucide-react';

const CreatorRegister: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, register: registerUser, handleOAuthCallback, refreshUser } = useAuth();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Check if user is authenticated
  const isAuthenticated = !!user;

  // Social media verification status
  const [verificationStatus, setVerificationStatus] = useState<{
    facebook: boolean;
    instagram: boolean;
    soundcloud: boolean;
    youtube: boolean;
  }>({
    facebook: false,
    instagram: false,
    soundcloud: false,
    youtube: false
  });

  // Form state
  const [formData, setFormData] = useState({
    artistName: '',
    bio: '',
    genres: [] as string[],
    roles: [] as string[],
    website: '',
    socialMedia: {
      instagram: '',
      facebook: '',
      soundcloud: '',
      youtube: '',
    },
    label: '',
    management: '',
    distributor: '',
    verificationMethod: 'manual'
  });

  // Account creation fields (only used if not authenticated)
  const [accountData, setAccountData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    username: ''
  });

  // Field-specific error messages
  const [fieldErrors, setFieldErrors] = useState({
    email: '',
    username: ''
  });

  // Refs for error fields
  const usernameInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);

  const [genreInput, setGenreInput] = useState('');
  const [proofFiles, setProofFiles] = useState<File[]>([]);

  // Check existing OAuth connections and update verification status
  useEffect(() => {
    if (user?.oauthVerified) {
      const oauthVerified = user.oauthVerified; // Store in variable for TypeScript
      
      setVerificationStatus({
        facebook: oauthVerified.facebook || false,
        instagram: oauthVerified.instagram || false,
        soundcloud: oauthVerified.soundcloud || false,
        youtube: oauthVerified.google || false // Google OAuth verifies YouTube
      });

      // Auto-fill URLs from verified accounts if not already set
      // Use functional update to check current formData state (not stale closure)
      setFormData(prev => {
        const updated = { ...prev, socialMedia: { ...prev.socialMedia } };
        
        if (oauthVerified.facebook && !prev.socialMedia.facebook) {
          const facebookUrl = (user as any).socialMedia?.facebook || 
                             ((user as any).facebookId ? `https://facebook.com/${(user as any).facebookId}` : '');
          if (facebookUrl) {
            updated.socialMedia.facebook = facebookUrl;
          }
        }
        if (oauthVerified.instagram && !prev.socialMedia.instagram) {
          const instagramUrl = (user as any).socialMedia?.instagram || 
                              ((user as any).instagramUsername ? `https://instagram.com/${(user as any).instagramUsername}` : '');
          if (instagramUrl) {
            updated.socialMedia.instagram = instagramUrl;
          }
        }
        if (oauthVerified.soundcloud && !prev.socialMedia.soundcloud) {
          const soundcloudUrl = (user as any).socialMedia?.soundcloud || 
                               ((user as any).soundcloudUsername ? `https://soundcloud.com/${(user as any).soundcloudUsername}` : '');
          if (soundcloudUrl) {
            updated.socialMedia.soundcloud = soundcloudUrl;
          }
        }
        if (oauthVerified.google && !prev.socialMedia.youtube) {
          // Google OAuth can provide YouTube channel info
          // Try to extract from user's social media or use a default YouTube URL pattern
          const youtubeUrl = (user as any).socialMedia?.youtube || '';
          if (youtubeUrl) {
            updated.socialMedia.youtube = youtubeUrl;
          }
        }
        
        return updated;
      });
    }
  }, [user]);

  // Handle OAuth callback when returning from OAuth provider
  useEffect(() => {
    const token = searchParams.get('token');
    const platform = searchParams.get('platform');
    const oauthSuccess = searchParams.get('oauth_success');
    const error = searchParams.get('error');
    const errorMessage = searchParams.get('message');

    // Handle OAuth errors first
    if (error && (error === 'account_already_linked' || error === 'account_linking_failed')) {
      const displayMessage = errorMessage 
        ? decodeURIComponent(errorMessage)
        : 'This social media account is already linked to another user account. Please use a different account.';
      
      toast.error(displayMessage, {
        autoClose: 10000,
        pauseOnHover: true,
      });
      
      // Clean up error params from URL
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('error');
      newParams.delete('message');
      setSearchParams(newParams, { replace: true });
      return;
    }

    if (token && platform && isAuthenticated) {
      handleOAuthCallback(token)
        .then(() => {
          // Refresh user data to get updated OAuth status
          refreshUser().then(() => {
            toast.success(`${platform.charAt(0).toUpperCase() + platform.slice(1)} account verified successfully!`);
            // Remove OAuth params from URL
            const newParams = new URLSearchParams(searchParams);
            newParams.delete('token');
            newParams.delete('platform');
            newParams.delete('oauth_success');
            setSearchParams(newParams, { replace: true });
          });
        })
        .catch((error: any) => {
          console.error('Error handling OAuth callback:', error);
          toast.error('Failed to verify account. Please try again.');
          const newParams = new URLSearchParams(searchParams);
          newParams.delete('token');
          newParams.delete('platform');
          newParams.delete('oauth_success');
          setSearchParams(newParams, { replace: true });
        });
    } else if (oauthSuccess === 'true' && platform && isAuthenticated) {
      // OAuth succeeded but no token (shouldn't happen, but handle gracefully)
      refreshUser().then(() => {
        toast.success(`${platform.charAt(0).toUpperCase() + platform.slice(1)} account verified successfully!`);
        const newParams = new URLSearchParams(searchParams);
        newParams.delete('platform');
        newParams.delete('oauth_success');
        setSearchParams(newParams, { replace: true });
      });
    }
  }, [searchParams, isAuthenticated, handleOAuthCallback, refreshUser, setSearchParams]);

  // Handle social media verification
  const handleVerifySocial = (platform: 'facebook' | 'instagram' | 'soundcloud' | 'youtube') => {
    if (!isAuthenticated) {
      toast.error('Please create an account first before verifying social media');
      return;
    }

    // Get JWT token from localStorage for account linking
    const token = localStorage.getItem('token');
    if (!token) {
      toast.error('Please log in again to verify social media');
      return;
    }

    const API_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:8000';
    // Determine correct step number based on authentication status
    const socialStep = isAuthenticated ? 3 : 4;
    const redirectUrl = encodeURIComponent(
      `${window.location.origin}/creator/register?step=${socialStep}&platform=${platform}`
    );
    
    // For YouTube, use Google OAuth (YouTube is part of Google)
    const oauthPlatform = platform === 'youtube' ? 'google' : platform;
    
    // Redirect to OAuth provider with link_account flag, token, and custom redirect
    // Note: Token is passed as query param since OAuth uses browser redirects (not API calls with headers)
    window.location.href = `${API_URL}/api/auth/${oauthPlatform}?link_account=true&redirect=${redirectUrl}&token=${encodeURIComponent(token)}`;
  };

  // Available options
  const availableGenres = [
    'Electronic','Techno', 'House', 'Minimal', 'D&B', 'Jungle', 'Trance',
    'Indie', 'Folk', 'Blues', 'Soul', 'Pop', 'Rock', 'Hip Hop', 'Rap', 'R&B', 
    'Country', 'Jazz', 'Disco', 'Classical', 'Reggae', 'Metal',  
    'Funk', 'Punk', 'Alternative', 'Dance', 'Latin', 'World',
    
  ];

  const availableRoles = [
    'artist', 'producer', 'songwriter', 'composer', 'DJ', 'vocalist', 'instrumentalist',
    /*'host', 'narrator', 'director', 'editor', 'author'*/
  ];

  const distributors = [
    'DistroKid', 'TuneCore', 'CD Baby', 'Ditto Music', 'AWAL', 
    'Stem', 'Amuse', 'RouteNote', 'Other'
  ];

  // Validation
  const isStep1Valid = () => {
    return formData.artistName.trim().length > 0 && 
           formData.roles.length > 0;
  };

  const isStep2Valid = () => {
    if (!isAuthenticated) {
      // Account creation validation
      return accountData.email.trim().length > 0 &&
             accountData.password.length >= 6 &&
             accountData.password === accountData.confirmPassword &&
             accountData.username.trim().length > 0;
    } else {
      // Music details validation
      return formData.genres.length > 0;
    }
  };

  const isStep3Valid = () => {
    if (!isAuthenticated) {
      // Music details validation (step 3 when not authenticated)
      return formData.genres.length > 0;
    }
    return true; // Social media step is optional
  };

  // Handle next step with account creation
  const handleNextStep = async () => {
    // If on step 2 and not authenticated, create account first
    if (step === 2 && !isAuthenticated) {
      // Validate fields first
      if (!isStep2Valid()) {
        toast.error('Please complete all account creation fields');
        return;
      }
      
      // Prevent double-clicks
      if (isCreatingAccount) {
        return;
      }
      
      // Create the account
      setIsCreatingAccount(true);
      try {
        await registerUser({
          email: accountData.email,
          password: accountData.password,
          username: accountData.username,
          parentInviteCode: 'MAKER'
        });
        
        toast.success('Account created successfully!');
        // User is now authenticated, adjust step to show Music details
        // For authenticated users: step 2 = Music details (was step 3 for unauthenticated)
        setStep(2);
      } catch (error: any) {
        console.error('Error registering user:', error);
        const errorResponse = error.response?.data || {};
        const errorMessage = errorResponse.error || error.message || 'Failed to create account';
        const errorField = errorResponse.field; // 'email' or 'username'
        
        // Clear previous errors
        setFieldErrors({ email: '', username: '' });
        
        // Set field-specific errors
        if (errorField === 'email' || errorMessage.toLowerCase().includes('email already')) {
          setFieldErrors(prev => ({ 
            ...prev, 
            email: 'This email is already registered.' 
          }));
          setTimeout(() => {
            emailInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            emailInputRef.current?.focus();
          }, 100);
        } else if (errorField === 'username' || errorMessage.toLowerCase().includes('username already')) {
          setFieldErrors(prev => ({ 
            ...prev, 
            username: 'This username is already taken. Please choose another. You can change your display name after signing up.' 
          }));
          setTimeout(() => {
            usernameInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            usernameInputRef.current?.focus();
          }, 100);
        } else {
          toast.error(errorMessage);
        }
        // Don't proceed if account creation fails
      } finally {
        setIsCreatingAccount(false);
      }
    } else {
      // For other steps, just proceed
      setStep(step + 1);
    }
  };

  const handleSubmit = async () => {
    // Validate all required steps
    if (!isStep1Valid()) {
      toast.error('Please complete all required fields in step 1');
      return;
    }
    
    // User should already be authenticated at this point (account created at step 2)
    // Just validate the creator application fields
    if (!isStep2Valid()) {
      toast.error('Please add at least one genre');
      return;
    }
    
    if (!isStep3Valid()) {
      toast.error('Please add at least one genre');
      return;
    }

    setIsSubmitting(true);
    
    try {
      // User is already authenticated, just submit creator application
      const submitData = new FormData();
      submitData.append('artistName', formData.artistName);
      submitData.append('bio', formData.bio);
      submitData.append('genres', JSON.stringify(formData.genres));
      submitData.append('roles', JSON.stringify(formData.roles));
      submitData.append('website', formData.website);
      submitData.append('socialMedia', JSON.stringify(formData.socialMedia));
      submitData.append('label', formData.label);
      submitData.append('management', formData.management);
      submitData.append('distributor', formData.distributor);
      submitData.append('verificationMethod', formData.verificationMethod);

      // Add proof files
      proofFiles.forEach(file => {
        submitData.append('proofFiles', file);
      });

      const response = await creatorAPI.apply(submitData);
      
      toast.success(response.message);
      
      // Navigate to profile or back to where they came from
      setTimeout(() => {
        navigate('/profile');
      }, 2000);
    } catch (error: any) {
      console.error('Error submitting creator application:', error);
      toast.error(error.response?.data?.error || 'Failed to submit application');
    } finally {
      setIsSubmitting(false);
    }
  };

  const addGenre = (genre: string) => {
    if (genre && !formData.genres.includes(genre)) {
      setFormData({ ...formData, genres: [...formData.genres, genre] });
      setGenreInput('');
    }
  };

  const removeGenre = (genre: string) => {
    setFormData({
      ...formData,
      genres: formData.genres.filter(g => g !== genre)
    });
  };

  const toggleRole = (role: string) => {
    if (formData.roles.includes(role)) {
      setFormData({
        ...formData,
        roles: formData.roles.filter(r => r !== role)
      });
    } else {
      setFormData({
        ...formData,
        roles: [...formData.roles, role]
      });
    }
  };

  const renderStep1 = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-white mb-4 flex items-center">
          <User className="h-6 w-6 mr-2 text-purple-400" />
          Basic Information
        </h3>

        <div className="space-y-4">
          {/* Artist Name */}
          <div>
            <label className="block text-white font-medium mb-2">
              Artist/Stage Name *
            </label>
            <input
              type="text"
              value={formData.artistName}
              onChange={(e) => setFormData({ ...formData, artistName: e.target.value })}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
              placeholder="Your professional name"
              maxLength={100}
            />
          </div>

          {/* Bio */}
          <div>
            <label className="block text-white font-medium mb-2">
              Artist Bio
            </label>
            <textarea
              value={formData.bio}
              onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500 min-h-[120px]"
              placeholder="Tell us about yourself, your music, and your journey..."
              maxLength={500}
            />
            <div className="text-xs text-gray-400 mt-1">
              {formData.bio.length}/500 characters
            </div>
          </div>

          {/* Roles */}
          <div>
            <label className="block text-white font-medium mb-2">
              Your Roles * (Select All That Apply)
            </label>
            <div className="flex flex-wrap gap-2">
              {availableRoles.map((role) => (
                <button
                  key={role}
                  onClick={() => toggleRole(role)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    formData.roles.includes(role)
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {role.charAt(0).toUpperCase() + role.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderStep2Account = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-white mb-4 flex items-center">
          <User className="h-6 w-6 mr-2 text-purple-400" />
          Create Your Account
        </h3>

        <div className="space-y-4">
          {/* Email */}
          <div>
            <label className="block text-white font-medium mb-2">
              Email Address *
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                ref={emailInputRef}
                type="email"
                value={accountData.email}
                onChange={(e) => {
                  setAccountData({ ...accountData, email: e.target.value });
                  // Clear error when user starts typing
                  if (fieldErrors.email) {
                    setFieldErrors(prev => ({ ...prev, email: '' }));
                  }
                }}
                className={`w-full pl-10 pr-4 py-3 bg-gray-800 border rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 transition-all ${
                  fieldErrors.email
                    ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                    : 'border-gray-600 focus:border-purple-500 focus:ring-purple-500'
                }`}
                placeholder="your@email.com"
                required
              />
            </div>
            {fieldErrors.email && (
              <p className="text-xs text-red-400 mt-1">{fieldErrors.email}</p>
            )}
          </div>

          {/* Username */}
          <div>
            <label className="block text-white font-medium mb-2">
              Username *
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                ref={usernameInputRef}
                type="text"
                value={accountData.username}
                onChange={(e) => {
                  setAccountData({ ...accountData, username: e.target.value });
                  // Clear error when user starts typing
                  if (fieldErrors.username) {
                    setFieldErrors(prev => ({ ...prev, username: '' }));
                  }
                }}
                className={`w-full pl-10 pr-4 py-3 bg-gray-800 border rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 transition-all ${
                  fieldErrors.username
                    ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                    : 'border-gray-600 focus:border-purple-500 focus:ring-purple-500'
                }`}
                placeholder="Choose a username"
                required
              />
            </div>
            {fieldErrors.username && (
              <p className="text-xs text-red-400 mt-1">{fieldErrors.username}</p>
            )}
          </div>

          {/* Password */}
          <div>
            <label className="block text-white font-medium mb-2">
              Password *
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={accountData.password}
                onChange={(e) => setAccountData({ ...accountData, password: e.target.value })}
                className="w-full pl-10 pr-10 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                placeholder="Password (min 6 characters)"
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-300"
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-white font-medium mb-2">
              Confirm Password *
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={accountData.confirmPassword}
                onChange={(e) => setAccountData({ ...accountData, confirmPassword: e.target.value })}
                className="w-full pl-10 pr-10 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                placeholder="Confirm your password"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-300"
              >
                {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            {accountData.password && accountData.confirmPassword && accountData.password !== accountData.confirmPassword && (
              <p className="text-xs text-red-400 mt-1">Passwords do not match</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-white mb-4 flex items-center">
          <Music className="h-6 w-6 mr-2 text-purple-400" />
          Musical Details
        </h3>

        <div className="space-y-4">
          {/* Genres */}
          <div>
            <label className="block text-white font-medium mb-2">
              Genres * (add at least one)
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={genreInput}
                onChange={(e) => setGenreInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addGenre(genreInput);
                  }
                }}
                className="flex-1 bg-gray-800 border border-gray-600 rounded-lg p-3 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                placeholder="Type or select a genre"
              />
              <button
                onClick={() => addGenre(genreInput)}
                disabled={!genreInput.trim()}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
              >
                Add
              </button>
            </div>

            {/* Quick select genres */}
            <div className="flex flex-wrap gap-2 mb-3">
              {availableGenres.map((genre) => (
                <button
                  key={genre}
                  onClick={() => addGenre(genre)}
                  className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-full transition-colors"
                >
                  + {genre}
                </button>
              ))}
            </div>

            {/* Selected genres */}
            {formData.genres.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {formData.genres.map((genre) => (
                  <span
                    key={genre}
                    className="inline-flex items-center px-3 py-1 bg-purple-600 text-white rounded-full text-sm"
                  >
                    {genre}
                    <button
                      onClick={() => removeGenre(genre)}
                      className="ml-2 hover:text-gray-300"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Website */}
          <div>
            <label className="block text-white font-medium mb-2">
              Website
            </label>
            <input
              type="url"
              value={formData.website}
              onChange={(e) => setFormData({ ...formData, website: e.target.value })}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
              placeholder="https://yourwebsite.com"
            />
          </div>
        </div>
      </div>
    </div>
  );

  const renderStep3 = () => {
    const socialPlatforms = [
      { key: 'facebook', label: 'Facebook', icon: Facebook, canVerify: true },
      { key: 'youtube', label: 'YouTube', icon: LinkIcon, canVerify: true },
      { key: 'soundcloud', label: 'SoundCloud', icon: Music, canVerify: true },
      { key: 'instagram', label: 'Instagram', icon: Instagram, canVerify: false }, // Verify button commented out - OAuth not working yet
    ] as const;

    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-xl font-semibold text-white mb-4 flex items-center">
            <LinkIcon className="h-6 w-6 mr-2 text-purple-400" />
            Social Media & Streaming
          </h3>

          <div className="space-y-3">
            {socialPlatforms.map(({ key, label, icon: Icon, canVerify }) => {
              const isVerified = canVerify && verificationStatus[key as keyof typeof verificationStatus];
              const platformKey = key as keyof typeof formData.socialMedia;
              
              return (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-gray-300 font-medium text-sm flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      {label}
                    </label>
                    {isVerified && (
                      <span className="flex items-center gap-1 text-xs text-green-400">
                        <Shield className="h-3 w-3" />
                        Verified
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={formData.socialMedia[platformKey]}
                      onChange={(e) => setFormData({
                        ...formData,
                        socialMedia: {
                          ...formData.socialMedia,
                          [platformKey]: e.target.value
                        }
                      })}
                      className="flex-1 bg-gray-800 border border-gray-600 rounded-lg p-2 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                      placeholder={`Your ${label} profile URL`}
                    />
                    {/* Commented out Instagram verify button - OAuth not working yet */}
                    {canVerify && (key as string) !== 'instagram' && (
                      <button
                        type="button"
                        onClick={() => handleVerifySocial(key as 'facebook' | 'instagram' | 'soundcloud' | 'youtube')}
                        disabled={!isAuthenticated}
                        className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors flex items-center gap-2 whitespace-nowrap ${
                          isVerified
                            ? 'bg-green-600/20 border border-green-500 text-green-400 cursor-default'
                            : isAuthenticated
                            ? 'bg-purple-600 hover:bg-purple-700 text-white'
                            : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                        }`}
                        title={
                          !isAuthenticated
                            ? 'Please create an account first'
                            : isVerified
                            ? 'Account verified'
                            : `Verify your ${label} account`
                        }
                      >
                        {isVerified ? (
                          <>
                            <CheckCircle className="h-4 w-4" />
                            Verified
                          </>
                        ) : (
                          <>
                            <Shield className="h-4 w-4" />
                            Verify
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 p-3 bg-blue-900/30 border border-blue-500/30 rounded-lg">
            <p className="text-blue-200 text-sm">
              <strong>Tip:</strong> Verifying your social media accounts can speed up the verification process. 
              {!isAuthenticated && ' You can verify accounts after creating your account.'}
            </p>
          </div>
        </div>
      </div>
    );
  };

  const renderStep4 = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-white mb-4 flex items-center">
          <Building className="h-6 w-6 mr-2 text-purple-400" />
          Professional Details
        </h3>

        <div className="space-y-4">
          {/* Label */}
          <div>
            <label className="block text-white font-medium mb-2">
              Record Label
            </label>
            <input
              type="text"
              value={formData.label}
              onChange={(e) => setFormData({ ...formData, label: e.target.value })}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
              placeholder="Your record label (if applicable)"
            />
          </div>

          {/* Management */}
          <div>
            <label className="block text-white font-medium mb-2">
              Management Company
            </label>
            <input
              type="text"
              value={formData.management}
              onChange={(e) => setFormData({ ...formData, management: e.target.value })}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
              placeholder="Your management company (if applicable)"
            />
          </div>

          {/* Distributor */}
          <div>
            <label className="block text-white font-medium mb-2">
              Music Distributor
            </label>
            <select
              value={formData.distributor}
              onChange={(e) => setFormData({ ...formData, distributor: e.target.value })}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-white focus:outline-none focus:border-purple-500"
            >
              <option value="">Select distributor (if applicable)</option>
              {distributors.map(dist => (
                <option key={dist} value={dist}>{dist}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );

  const renderStep5 = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-white mb-4 flex items-center">
          <Award className="h-6 w-6 mr-2 text-purple-400" />
          Final Verification (Optional)
        </h3>

        <div className="space-y-4">
          <p className="text-gray-300">
            To verify your identity as a creator, please upload supporting documents such as:
          </p>

          <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
            <li>Screenshots from distribution platforms (DistroKid, TuneCore, etc.)</li>
            <li>Screenshots from streaming services showing your artist profile</li>
            <li>Contracts or agreements with labels/management</li>
            <li>ISRC/UPC documentation</li>
            <li>Social media verification screenshots</li>
          </ul>

          {/* File Upload */}
          <div>
            <label className="block text-white font-medium mb-2">
              <Upload className="inline h-5 w-5 mr-2" />
              Upload Proof Documents (Optional but recommended)
            </label>
            <input
              type="file"
              multiple
              accept="image/*,.pdf"
              onChange={(e) => setProofFiles(Array.from(e.target.files || []))}
              className="block w-full text-sm text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-700 cursor-pointer"
            />
            {proofFiles.length > 0 && (
              <div className="mt-2 text-sm text-gray-300">
                {proofFiles.length} file(s) selected
              </div>
            )}
          </div>

          <div className="p-4 bg-yellow-900/30 border border-yellow-500/30 rounded-lg">
            <p className="text-yellow-200 text-sm">
              <strong>Note:</strong> Your application will be reviewed within 24-48 hours. 
              Providing verification documents will help speed up the process.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderStepContent = () => {
    if (!isAuthenticated) {
      // Steps when not authenticated: 1=Basic, 2=Account, 3=Music, 4=Social, 5=Pro, 6=Verify
      switch (step) {
        case 1: return renderStep1();
        case 2: return renderStep2Account();
        case 3: return renderStep2(); // Music details
        case 4: return renderStep3(); // Social media
        case 5: return renderStep4(); // Professional details
        case 6: return renderStep5(); // Verification
        default: return null;
      }
    } else {
      // Steps when authenticated: 1=Basic, 2=Music, 3=Social, 4=Pro, 5=Verify
      switch (step) {
        case 1: return renderStep1();
        case 2: return renderStep2(); // Music details
        case 3: return renderStep3(); // Social media
        case 4: return renderStep4(); // Professional details
        case 5: return renderStep5(); // Verification
        default: return null;
      }
    }
  };

  // Handle step initialization from URL params (for OAuth redirects)
  useEffect(() => {
    const stepParam = searchParams.get('step');
    if (stepParam) {
      const stepNum = parseInt(stepParam, 10);
      if (!isNaN(stepNum) && stepNum >= 1 && stepNum <= (isAuthenticated ? 5 : 6)) {
        setStep(stepNum);
      }
    }
  }, [searchParams, isAuthenticated]);

  const getTotalSteps = () => {
    return isAuthenticated ? 5 : 6;
  };

  const getStepLabels = () => {
    if (!isAuthenticated) {
      return ['Basic', 'Account', 'Music', 'Social', 'Pro', 'Verify'];
    } else {
      return ['Basic', 'Music', 'Social', 'Pro', 'Verify'];
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 py-8 pb-40">
      <div className="max-w-3xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-white mb-2">Become a Creator</h1>
          <p className="text-gray-300">
            Join Tuneable as a verified creator and claim your music
          </p>
        </div>

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {Array.from({ length: getTotalSteps() }, (_, i) => i + 1).map((stepNum) => (
              <React.Fragment key={stepNum}>
                <div className="flex flex-col items-center">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-colors ${
                      stepNum < step
                        ? 'bg-green-600 text-white'
                        : stepNum === step
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-700 text-gray-400'
                    }`}
                  >
                    {stepNum < step ? <CheckCircle className="h-6 w-6" /> : stepNum}
                  </div>
                  <span className="text-xs text-gray-400 mt-1 hidden sm:block">
                    {getStepLabels()[stepNum - 1]}
                  </span>
                </div>
                {stepNum < getTotalSteps() && (
                  <div
                    className={`flex-1 h-1 mx-2 transition-colors ${
                      stepNum < step ? 'bg-green-600' : 'bg-gray-700'
                    }`}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Form */}
        <div className="bg-black/20 backdrop-blur-sm rounded-lg p-8 border border-white/10">
          {renderStepContent()}

          {/* Navigation Buttons */}
          <div className="flex justify-between mt-8 pt-6 border-t border-gray-700">
            <button
              onClick={() => step === 1 ? navigate(-1) : setStep(step - 1)}
              className="flex items-center px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
            >
              <ArrowLeft className="h-5 w-5 mr-2" />
              {step === 1 ? 'Cancel' : 'Back'}
            </button>

            {step < getTotalSteps() ? (
              <button
                onClick={handleNextStep}
                disabled={
                  isCreatingAccount ||
                  (step === 1 
                    ? !isStep1Valid() 
                    : step === 2 
                    ? !isStep2Valid() 
                    : !isAuthenticated && step === 3
                    ? !isStep3Valid()
                    : false)
                }
                className="flex items-center px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
              >
                {isCreatingAccount ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Creating Account...
                  </>
                ) : (
                  <>
                    Next
                    <ArrowRight className="h-5 w-5 ml-2" />
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex items-center px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-5 w-5 mr-2" />
                    Submit
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreatorRegister;

