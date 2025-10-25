import React, { useState } from 'react';
import { X, ExternalLink, Check } from 'lucide-react';
import { Facebook, Instagram, Music2 } from 'lucide-react';

interface SocialMediaModalProps {
  isOpen: boolean;
  onClose: () => void;
  platform: 'facebook' | 'instagram' | 'soundcloud';
  currentUrl?: string;
  onSave: (url: string) => void;
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

export default function SocialMediaModal({ isOpen, onClose, platform, currentUrl, onSave }: SocialMediaModalProps) {
  const [url, setUrl] = useState(currentUrl || '');
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState('');

  const config = platformConfig[platform];

  const validateUrl = (url: string): boolean => {
    if (!url.trim()) return false;
    
    const patterns = {
      facebook: /^https?:\/\/(www\.)?facebook\.com\/[a-zA-Z0-9.]+/,
      instagram: /^https?:\/\/(www\.)?instagram\.com\/[a-zA-Z0-9._]+/,
      soundcloud: /^https?:\/\/(www\.)?soundcloud\.com\/[a-zA-Z0-9._-]+/
    };

    return patterns[platform].test(url);
  };

  const handleSave = async () => {
    setError('');
    setIsValidating(true);

    if (!url.trim()) {
      setError('Please enter a URL');
      setIsValidating(false);
      return;
    }

    if (!validateUrl(url)) {
      setError(`Please enter a valid ${config.name} URL`);
      setIsValidating(false);
      return;
    }

    try {
      await onSave(url);
      onClose();
    } catch (err) {
      setError('Failed to save URL. Please try again.');
    } finally {
      setIsValidating(false);
    }
  };

  const handleOAuthConnect = () => {
    // Redirect to OAuth endpoint
    const authUrl = `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/auth/${platform}`;
    window.location.href = authUrl;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[10000] p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-lg bg-${config.color}-100`}>
              <config.icon className={`w-5 h-5 text-${config.color}-600`} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Add {config.name}</h3>
              <p className="text-sm text-gray-400">Connect your {config.name} profile</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* OAuth Option */}
        <div className="mb-6">
          <button
            onClick={handleOAuthConnect}
            className={`w-full flex items-center justify-center space-x-2 px-4 py-3 bg-${config.color}-600 hover:bg-${config.color}-700 text-white rounded-lg transition-colors`}
          >
            <config.icon className="w-4 h-4" />
            <span>Connect with {config.name}</span>
            <ExternalLink className="w-4 h-4" />
          </button>
          <p className="text-xs text-gray-400 mt-2 text-center">
            Recommended: Secure OAuth connection
          </p>
        </div>

        {/* Divider */}
        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-700"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-gray-900 text-gray-400">or</span>
          </div>
        </div>

        {/* Manual URL Entry */}
        <div>
          <label className="block text-sm font-medium text-white mb-2">
            Add {config.name} URL manually
          </label>
          <div className="space-y-3">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={config.placeholder}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
            
            {error && (
              <p className="text-red-400 text-sm flex items-center space-x-1">
                <X className="w-4 h-4" />
                <span>{error}</span>
              </p>
            )}
            
            <div className="text-xs text-gray-400">
              <p>Example: {config.example}</p>
            </div>
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
            onClick={handleSave}
            disabled={isValidating || !url.trim()}
            className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center justify-center space-x-2"
          >
            {isValidating ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>Save URL</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
