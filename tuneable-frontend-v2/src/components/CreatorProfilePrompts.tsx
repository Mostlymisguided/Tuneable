import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Facebook, Music2, Youtube, MapPin, X, CheckCircle } from 'lucide-react';
import { emailAPI } from '../lib/api';
import { toast } from 'react-toastify';

interface User {
  _id?: string;
  id?: string;
  uuid?: string;
  emailVerified?: boolean;
  oauthVerified?: {
    facebook?: boolean;
    soundcloud?: boolean;
    google?: boolean;
    instagram?: boolean;
  };
  homeLocation?: {
    city?: string;
    region?: string;
    country?: string;
    countryCode?: string;
  };
}

interface CreatorProfilePromptsProps {
  user: User | null;
  onDismiss?: (promptId: string) => void;
}

interface Prompt {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  action: () => void | Promise<void>;
  priority: number;
}

const CreatorProfilePrompts: React.FC<CreatorProfilePromptsProps> = ({ user, onDismiss }) => {
  const navigate = useNavigate();
  const [dismissedPrompts, setDismissedPrompts] = useState<Set<string>>(new Set());
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  if (!user) return null;

  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

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

  const handleOAuthConnect = (provider: 'facebook' | 'soundcloud' | 'google' | 'instagram') => {
    // Redirect to OAuth endpoint
    window.location.href = `${API_BASE_URL}/auth/${provider}`;
  };

  const handleAddLocation = () => {
    // Navigate to user profile page where they can edit location
    const userId = user._id || user.id || user.uuid;
    if (userId) {
      navigate(`/user/${userId}`);
    } else {
      toast.error('Unable to navigate to profile');
    }
  };

  const prompts: Prompt[] = [];

  // Email verification prompt
  if (!user.emailVerified) {
    prompts.push({
      id: 'email',
      title: 'Verify Your Email',
      description: 'Verify your email address to unlock upload features',
      icon: Mail,
      action: handleEmailVerification,
      priority: 1
    });
  }

  // Location prompt
  if (!user.homeLocation?.city || !user.homeLocation?.country) {
    prompts.push({
      id: 'location',
      title: 'Add Location Info',
      description: 'Add your location to help others discover your music',
      icon: MapPin,
      action: handleAddLocation,
      priority: 2
    });
  }

  // OAuth verification prompts
  if (!user.oauthVerified?.facebook) {
    prompts.push({
      id: 'facebook',
      title: 'Verify Account',
      description: 'Connect Facebook',
      icon: Facebook,
      action: () => handleOAuthConnect('facebook'),
      priority: 3
    });
  }

  if (!user.oauthVerified?.soundcloud) {
    prompts.push({
      id: 'soundcloud',
      title: 'Verify Account',
      description: 'Connect SoundCloud',
      icon: Music2,
      action: () => handleOAuthConnect('soundcloud'),
      priority: 4
    });
  }

  if (!user.oauthVerified?.google) {
    prompts.push({
      id: 'youtube',
      title: 'Verify Account',
      description: 'Connect Google/YouTube',
      icon: Youtube,
      action: () => handleOAuthConnect('google'),
      priority: 5
    });
  }

  // Filter out dismissed prompts and sort by priority
  const activePrompts = prompts
    .filter(p => !dismissedPrompts.has(p.id))
    .sort((a, b) => a.priority - b.priority);

  if (activePrompts.length === 0) return null;

  const handleDismiss = (promptId: string) => {
    setDismissedPrompts(prev => new Set([...prev, promptId]));
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
                  disabled={isSendingEmail && prompt.id === 'email'}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {isSendingEmail && prompt.id === 'email' ? 'Sending...' : 'Complete'}
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

export default CreatorProfilePrompts;

