import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, MapPin, Navigation, User, X, CheckCircle } from 'lucide-react';
import { emailAPI } from '../lib/api';
import { toast } from 'react-toastify';
import { DEFAULT_PROFILE_PIC } from '../constants';
import { useCurrentLocation } from '../contexts/CurrentLocationContext';
import { formatLocation } from '../utils/locationHelpers';

interface User {
  _id?: string;
  id?: string;
  uuid?: string;
  emailVerified?: boolean;
  profilePic?: string;
  homeLocation?: {
    city?: string;
    region?: string;
    country?: string;
    countryCode?: string;
    placeId?: string;
    display?: string;
  };
}

interface UserProfilePromptsProps {
  user: User | null;
  onDismiss?: (promptId: string) => void;
}

interface Prompt {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  action: () => void | Promise<void>;
  actionLabel?: string;
  priority: number;
}

const UserProfilePrompts: React.FC<UserProfilePromptsProps> = ({ user, onDismiss }) => {
  const navigate = useNavigate();
  const {
    currentLocation,
    status: currentLocationStatus,
    promptDismissed,
    enableCurrentLocation,
    dismissPrompt,
  } = useCurrentLocation();
  const [dismissedPrompts, setDismissedPrompts] = useState<Set<string>>(new Set());
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isEnablingLocation, setIsEnablingLocation] = useState(false);

  if (!user) return null;

  const handleEmailVerification = async () => {
    setIsSendingEmail(true);
    try {
      await emailAPI.resendVerification();
      toast.success('Verification email sent! Please check your inbox.');
    } catch (error: any) {
      console.error('Error sending verification email:', error);
      toast.error(error.response?.data?.error || 'Failed to send verification email');
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleAddProfilePicture = () => {
    const userId = user._id || user.id || user.uuid;
    if (userId) {
      navigate(`/user/${userId}`);
    } else {
      toast.error('Unable to navigate to profile');
    }
  };

  const handleAddLocation = () => {
    const userId = user._id || user.id || user.uuid;
    if (userId) {
      navigate(`/user/${userId}`);
    } else {
      toast.error('Unable to navigate to profile');
    }
  };

  const handleEnableCurrentLocation = async () => {
    setIsEnablingLocation(true);
    try {
      const location = await enableCurrentLocation();
      if (location) {
        toast.success(
          `Current location set to ${formatLocation(location)} — tips will influence charts there too`
        );
        return;
      }
      const { getCurrentLocationStatus } = await import('../utils/currentLocationCache');
      if (getCurrentLocationStatus() === 'denied') {
        toast.error('Location permission denied. You can enable it in your browser settings.');
      } else {
        toast.error('Could not detect your current location');
      }
    } finally {
      setIsEnablingLocation(false);
    }
  };

  const hasHomeLocation = !!(user.homeLocation?.city || user.homeLocation?.country || user.homeLocation?.placeId);
  const showCurrentLocationPrompt =
    hasHomeLocation &&
    !currentLocation &&
    !promptDismissed &&
    currentLocationStatus !== 'denied' &&
    currentLocationStatus !== 'unavailable';

  const prompts: Prompt[] = [];

  // Email verification prompt
  if (!user.emailVerified) {
    prompts.push({
      id: 'email',
      title: 'Verify Your Email',
      description: 'Verify your email address to unlock all features',
      icon: Mail,
      action: handleEmailVerification,
      priority: 1
    });
  }

  // Profile picture prompt
  if (!user.profilePic || user.profilePic === DEFAULT_PROFILE_PIC) {
    prompts.push({
      id: 'profilePic',
      title: 'Add Profile Picture',
      description: 'Add a profile picture to personalize your account',
      icon: User,
      action: handleAddProfilePicture,
      priority: 2
    });
  }

  // Home location prompt
  if (!hasHomeLocation) {
    prompts.push({
      id: 'location',
      title: 'Add Home Location',
      description: 'Add your home location so tips influence charts where you\'re from',
      icon: MapPin,
      action: handleAddLocation,
      priority: 3
    });
  }

  // Current location — tip-time presence for local charts
  if (showCurrentLocationPrompt) {
    prompts.push({
      id: 'currentLocation',
      title: 'Enable Current Location',
      description: 'Tip once and influence charts at home and where you are now',
      icon: Navigation,
      action: handleEnableCurrentLocation,
      actionLabel: isEnablingLocation ? 'Detecting...' : 'Enable',
      priority: 4
    });
  }

  // Filter out dismissed prompts and sort by priority
  const activePrompts = prompts
    .filter(p => !dismissedPrompts.has(p.id))
    .sort((a, b) => a.priority - b.priority);

  if (activePrompts.length === 0) return null;

  const handleDismiss = (promptId: string) => {
    setDismissedPrompts(prev => new Set([...prev, promptId]));
    if (promptId === 'currentLocation') {
      dismissPrompt();
    }
    if (onDismiss) {
      onDismiss(promptId);
    }
  };

  return (
    <div className="bg-gray-900 rounded-lg p-6 mb-6 border border-purple-500/30">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <CheckCircle className="h-5 w-5 text-purple-400" />
          <h3 className="text-lg font-semibold text-white">Complete Your Profile</h3>
        </div>
        <span className="text-sm text-gray-400">{activePrompts.length} action{activePrompts.length !== 1 ? 's' : ''} remaining</span>
      </div>

      <div className="space-y-3">
        {activePrompts.map((prompt) => {
          const Icon = prompt.icon;
          const isBusy =
            (isSendingEmail && prompt.id === 'email') ||
            (isEnablingLocation && prompt.id === 'currentLocation');
          return (
            <div
              key={prompt.id}
              className="flex items-center justify-between p-4 bg-gray-800 rounded-lg border border-gray-700 hover:border-purple-500/50 transition-colors"
            >
              <div className="flex items-center space-x-3 flex-1">
                <div className="p-2 bg-purple-600/20 rounded-lg">
                  <Icon className="h-5 w-5 text-purple-400" />
                </div>
                <div className="flex-1">
                  <h4 className="text-white font-medium">{prompt.title}</h4>
                  <p className="text-sm text-gray-400">{prompt.description}</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={async () => {
                    await prompt.action();
                  }}
                  disabled={isBusy}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {prompt.actionLabel || (isBusy ? 'Sending...' : 'Complete')}
                </button>
                <button
                  onClick={() => handleDismiss(prompt.id)}
                  className="p-2 text-gray-400 hover:text-white transition-colors"
                  title="Dismiss"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default UserProfilePrompts;
