import { useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { Facebook, Instagram, Music2 } from 'lucide-react';

interface SocialMediaModalProps {
  isOpen: boolean;
  onClose: () => void;
  platform: 'facebook' | 'instagram' | 'soundcloud';
  currentUrl?: string; // Kept for backward compatibility but not used
  onSave: (url: string) => void; // Kept for backward compatibility but not used
}

const platformConfig = {
  facebook: {
    name: 'Facebook',
    icon: Facebook,
    placeholder: 'https://facebook.com/yourusername',
    example: 'https://facebook.com/yourusername',
    color: 'blue'
  },
  instagram: {
    name: 'Instagram',
    icon: Instagram,
    placeholder: 'https://instagram.com/yourusername',
    example: 'https://instagram.com/yourusername',
    color: 'pink'
  },
  soundcloud: {
    name: 'SoundCloud',
    icon: Music2,
    placeholder: 'https://soundcloud.com/yourusername',
    example: 'https://soundcloud.com/yourusername',
    color: 'orange'
  }
};

export default function SocialMediaModal({ isOpen, onClose, platform }: SocialMediaModalProps) {
  const config = platformConfig[platform];

  const handleOAuthConnect = () => {
    const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
    
    // Get current user ID from URL or localStorage to redirect back to profile
    const currentPath = window.location.pathname;
    const userId = currentPath.split('/user/')[1]?.split('?')[0];
    
    // Build redirect URL to return to profile settings after OAuth
    const redirectPath = userId ? `/user/${userId}?settings=true&tab=profile&oauth_success=true` : '/dashboard?oauth_success=true';
    const redirectUrl = encodeURIComponent(`${window.location.origin}${redirectPath}`);
    
    // Redirect to OAuth endpoint with redirect parameter
    const oauthUrl = `${API_BASE_URL}/auth/${platform}?redirect=${redirectUrl}&link_account=true`;
    window.location.href = oauthUrl;
  };

  // Auto-redirect to OAuth when modal opens
  useEffect(() => {
    if (isOpen) {
      // Small delay to show the modal briefly before redirect
      const timer = setTimeout(() => {
        handleOAuthConnect();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);


  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[10000] p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-lg ${
              platform === 'facebook' ? 'bg-blue-100' :
              platform === 'instagram' ? 'bg-pink-100' :
              'bg-orange-100'
            }`}>
              <config.icon className={`w-5 h-5 ${
                platform === 'facebook' ? 'text-blue-600' :
                platform === 'instagram' ? 'text-pink-600' :
                'text-orange-600'
              }`} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Connect {config.name}</h3>
              <p className="text-sm text-gray-400">Linking your {config.name} account</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* OAuth Connection Info */}
        <div className="space-y-4">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
          </div>
          <div className="text-center space-y-2">
            <p className="text-white font-medium">
              Redirecting to {config.name}...
            </p>
            <p className="text-sm text-gray-400">
              You'll be redirected to {config.name} to authorize the connection. 
              After authorizing, you'll be brought back to your profile.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex space-x-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-gray-300 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleOAuthConnect}
            className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors flex items-center justify-center space-x-2"
          >
            <span>Continue to {config.name}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
