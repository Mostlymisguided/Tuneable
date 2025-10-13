import React, { useState, useEffect } from 'react';
import { Music, Download, AlertCircle, CheckCircle, ExternalLink } from 'lucide-react';

interface ImportResults {
  success: boolean;
  imported: number;
  skipped: number;
  errors: number;
  importedVideos?: Array<{
    id: string;
    title: string;
    artist: string;
    youtubeId: string;
  }>;
  skippedVideos?: Array<{
    title: string;
    reason: string;
  }>;
  quotaEstimate?: {
    total: number;
    percentage: number;
  };
}

interface User {
  googleAccessToken?: string;
  role?: string[];
}

interface QuotaEstimate {
  success: boolean;
  estimate: {
    total: number;
    percentage: number;
  };
  recommendations: {
    maxSafeImport: string;
    quotaReset: string;
    musicOnly: string;
  };
}

const YouTubeLikedImport: React.FC = () => {
  const [accessToken, setAccessToken] = useState('');
  const [maxVideos, setMaxVideos] = useState(50);
  const [maxDurationMinutes, setMaxDurationMinutes] = useState(15);
  const [isLoading, setIsLoading] = useState(false);
  const [quotaEstimate, setQuotaEstimate] = useState<QuotaEstimate | null>(null);
  const [results, setResults] = useState<ImportResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    loadUserProfile();
  }, []);

  const loadUserProfile = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/users/profile', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user || data);
      }
    } catch (error) {
      console.error('Error loading user profile:', error);
    }
  };

  const handleEstimateQuota = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`/api/youtube-import/liked-videos/estimate?maxVideos=${maxVideos}`);
      const data = await response.json();

      if (data.success) {
        setQuotaEstimate(data);
      } else {
        setError(data.error || 'Failed to estimate quota usage');
      }
    } catch (err) {
      setError('Failed to estimate quota usage');
    } finally {
      setIsLoading(false);
    }
  };

  const handleImport = async () => {
    if (!accessToken.trim() && !user?.googleAccessToken) {
      setError('Please enter your YouTube access token or sign in with Google first');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      setResults(null);

      const response = await fetch('/api/youtube-import/liked-videos/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          accessToken: accessToken.trim(),
          maxVideos,
          maxDurationMinutes
        })
      });

      const data = await response.json();

      if (data.success) {
        setResults(data);
      } else {
        setError(data.error || 'Failed to import videos');
      }
    } catch (err) {
      setError('Failed to import videos');
    } finally {
      setIsLoading(false);
    }
  };

  const getOAuthUrl = async () => {
    try {
      const response = await fetch('/api/youtube-import/oauth-url');
      const data = await response.json();

      if (data.success) {
        window.open(data.oauthUrl, '_blank');
      } else {
        setError('Failed to get OAuth URL');
      }
    } catch (err) {
      setError('Failed to get OAuth URL');
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-gray-900 text-white">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-4 flex items-center">
          <Music className="h-8 w-8 mr-3 text-purple-400" />
          Import YouTube Liked Videos
        </h1>
        <p className="text-gray-300 mb-6">
          Bulk import your YouTube liked music videos to Tuneable. Only music category videos under 15 minutes will be imported.
        </p>
      </div>

      {/* OAuth Setup */}
      <div className="bg-gray-800 rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          <ExternalLink className="h-5 w-5 mr-2" />
          Step 1: Get YouTube Access Token
        </h2>
        <p className="text-gray-300 mb-4">
          You'll need to authorize Tuneable to access your YouTube liked videos.
        </p>
        <button
          onClick={getOAuthUrl}
          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors"
        >
          Get YouTube Authorization
        </button>
      </div>

      {/* Import Form */}
      <div className="bg-gray-800 rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          <Download className="h-5 w-5 mr-2" />
          Step 2: Import Your Videos
        </h2>

        <div className="space-y-4">
          {/* Google OAuth Status */}
          {user?.googleAccessToken && (
            <div className="bg-green-900 border border-green-700 rounded-lg p-4">
              <div className="flex items-center">
                <CheckCircle className="h-5 w-5 text-green-400 mr-2" />
                <span className="text-green-200">
                  <strong>Google OAuth Connected!</strong> You can import without providing an access token.
                </span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-2">
              YouTube Access Token {!user?.googleAccessToken && <span className="text-red-400">*</span>}
            </label>
            <input
              type="text"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder={user?.googleAccessToken ? "Optional - Google OAuth will be used if empty" : "Paste your YouTube access token here"}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
            {user?.googleAccessToken && (
              <p className="text-sm text-gray-400 mt-1">
                Since you're signed in with Google, this field is optional. Leave empty to use your Google OAuth token.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Maximum Videos to Import
              </label>
              <input
                type="number"
                value={maxVideos}
                onChange={(e) => setMaxVideos(parseInt(e.target.value) || 50)}
                min="1"
                max="500"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <p className="text-sm text-gray-400 mt-1">
                Recommended: 50-100 videos
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Maximum Duration (minutes)
              </label>
              <input
                type="number"
                value={maxDurationMinutes}
                onChange={(e) => setMaxDurationMinutes(parseInt(e.target.value) || 15)}
                min="1"
                max="60"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <p className="text-sm text-gray-400 mt-1">
                Filters out long-form content
              </p>
            </div>
          </div>

          <div className="flex space-x-4">
            <button
              onClick={handleEstimateQuota}
              disabled={isLoading}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Estimate Quota Usage
            </button>

            <button
              onClick={handleImport}
              disabled={isLoading || (!accessToken.trim() && !user?.googleAccessToken)}
              className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white px-6 py-2 rounded-lg transition-colors flex items-center"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Importing...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Import Videos
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Quota Estimate */}
      {quotaEstimate && (
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">Quota Usage Estimate</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-700 p-4 rounded-lg">
              <div className="text-2xl font-bold text-blue-400">
                {quotaEstimate.estimate.total}
              </div>
              <div className="text-sm text-gray-300">Quota Units</div>
            </div>
            <div className="bg-gray-700 p-4 rounded-lg">
              <div className="text-2xl font-bold text-green-400">
                {quotaEstimate.estimate.percentage.toFixed(1)}%
              </div>
              <div className="text-sm text-gray-300">Daily Limit</div>
            </div>
            <div className="bg-gray-700 p-4 rounded-lg">
              <div className="text-sm text-gray-300">
                {quotaEstimate.estimate.total < 8000 ? '✅ Safe' : '⚠️ High Usage'}
              </div>
            </div>
          </div>
          <div className="mt-4 text-sm text-gray-300">
            <p>{quotaEstimate.recommendations.quotaReset}</p>
            <p>{quotaEstimate.recommendations.musicOnly}</p>
          </div>
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center">
            <CheckCircle className="h-5 w-5 mr-2 text-green-400" />
            Import Results
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-green-900 p-4 rounded-lg">
              <div className="text-2xl font-bold text-green-400">
                {results.imported}
              </div>
              <div className="text-sm text-gray-300">Imported</div>
            </div>
            <div className="bg-yellow-900 p-4 rounded-lg">
              <div className="text-2xl font-bold text-yellow-400">
                {results.skipped}
              </div>
              <div className="text-sm text-gray-300">Skipped</div>
            </div>
            <div className="bg-red-900 p-4 rounded-lg">
              <div className="text-2xl font-bold text-red-400">
                {results.errors}
              </div>
              <div className="text-sm text-gray-300">Errors</div>
            </div>
          </div>

          {results.importedVideos && results.importedVideos.length > 0 && (
            <div className="mb-6">
              <h4 className="font-medium mb-2">Imported Videos ({results.importedVideos.length})</h4>
              <div className="max-h-48 overflow-y-auto space-y-2">
                {results.importedVideos.slice(0, 10).map((video, index) => (
                  <div key={index} className="bg-gray-700 p-3 rounded-lg text-sm">
                    <div className="font-medium">{video.title}</div>
                    <div className="text-gray-400">{video.artist}</div>
                  </div>
                ))}
                {results.importedVideos.length > 10 && (
                  <div className="text-gray-400 text-sm">
                    ... and {results.importedVideos.length - 10} more
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-900 border border-red-700 rounded-lg p-4 mb-6">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 text-red-400 mr-2" />
            <span className="text-red-200">{error}</span>
          </div>
        </div>
      )}

      {/* Info */}
      <div className="bg-blue-900 border border-blue-700 rounded-lg p-4">
        <h4 className="font-medium text-blue-200 mb-2">How it works:</h4>
        <ul className="text-sm text-blue-200 space-y-1">
          <li>• Only music category videos from your liked videos are imported</li>
          <li>• Videos longer than the duration limit are automatically filtered out</li>
          <li>• Duplicate videos are automatically skipped</li>
          <li>• YouTube API quota resets every 24 hours from your first call</li>
          <li>• Importing 100 videos typically uses ~4 quota units (0.04% of daily limit)</li>
        </ul>
      </div>
    </div>
  );
};

export default YouTubeLikedImport;
