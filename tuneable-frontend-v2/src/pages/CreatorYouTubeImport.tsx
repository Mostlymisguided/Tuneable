import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Music, Download, CheckCircle, ExternalLink, ArrowLeft, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { showCreatorDashboard } from '../utils/permissionHelpers';

interface ImportResults {
  success: boolean;
  imported: number;
  skipped: number;
  errors: number;
  importedVideos?: Array<{ id: string; title: string; artist: string; youtubeId: string }>;
  skippedVideos?: Array<{ title: string; reason: string }>;
}

const CreatorYouTubeImport: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [youtubeConnected, setYoutubeConnected] = useState(false);
  const [maxVideos, setMaxVideos] = useState(50);
  const [maxDurationMinutes, setMaxDurationMinutes] = useState(15);
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<ImportResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [oauthMessage, setOauthMessage] = useState<string | null>(null);

  useEffect(() => {
    loadYouTubeStatus();
  }, []);

  useEffect(() => {
    const youtube = searchParams.get('youtube');
    const message = searchParams.get('message');
    if (youtube === 'connected') {
      setOauthMessage('YouTube connected! You can now import your liked videos.');
      loadYouTubeStatus(); // Refresh status after OAuth redirect
    } else if (youtube === 'error' && message) {
      setOauthMessage(
        message === 'invalid_state' ? 'Session expired. Please try connecting again.' :
        message === 'session_expired' ? 'Session expired. Please try again.' :
        'Could not connect YouTube. Please try again.'
      );
    }
  }, [searchParams]);

  const loadYouTubeStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/youtube-import/client/status', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setYoutubeConnected(data.connected ?? false);
      }
    } catch (e) {
      console.error('Error loading YouTube status:', e);
    }
  };

  const hasToken = youtubeConnected;

  const handleConnectYouTube = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/youtube-import/client/oauth-url', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        window.location.href = data.oauthUrl;
      } else {
        setError(data.error || 'Could not get YouTube authorization URL');
      }
    } catch (e) {
      setError('Could not connect to YouTube');
    }
  };

  const handleImport = async () => {
    if (!hasToken) {
      setError('Connect YouTube first to import your liked videos.');
      return;
    }
    try {
      setIsLoading(true);
      setError(null);
      setResults(null);

      const token = localStorage.getItem('token');
      const res = await fetch('/api/youtube-import/client/liked-videos/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          maxVideos,
          maxDurationMinutes
        })
      });

      const data = await res.json();

      if (data.success) {
        setResults(data);
        loadYouTubeStatus();
      } else {
        setError(data.error || 'Import failed');
      }
    } catch (e) {
      setError('Import failed');
    } finally {
      setIsLoading(false);
    }
  };

  if (!user) {
    navigate('/login');
    return null;
  }

  if (!showCreatorDashboard(user)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-white">
        <Music className="h-16 w-16 text-purple-400 mb-4" />
        <h2 className="text-xl font-bold mb-2">Creators Only</h2>
        <p className="text-gray-300 text-center mb-6">
          Import from YouTube is for verified creators. Apply to become a creator first.
        </p>
        <Link
          to="/creator-register"
          className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-medium"
        >
          Apply to Become a Creator
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white px-4 pb-24 pt-2">
      {/* Mobile-friendly header */}
      <div className="flex items-center gap-4 mb-6">
        <Link
          to="/dashboard"
          className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-800 hover:bg-gray-700"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold truncate flex items-center gap-2">
            <Music className="h-6 w-6 sm:h-7 sm:w-7 text-purple-400 flex-shrink-0" />
            Import from YouTube
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Add your liked music videos to your media
          </p>
        </div>
      </div>

      {/* OAuth message (success or error) */}
      {oauthMessage && (
        <div
          className={`mb-4 p-4 rounded-xl flex items-center gap-3 ${
            oauthMessage.includes('connected')
              ? 'bg-green-900/50 border border-green-700/50'
              : 'bg-red-900/50 border border-red-700/50'
          }`}
        >
          <CheckCircle className={`h-5 w-5 flex-shrink-0 ${
            oauthMessage.includes('connected') ? 'text-green-400' : 'text-red-400'
          }`} />
          <span className="text-sm">{oauthMessage}</span>
        </div>
      )}

      {/* Step 1: Connect YouTube - full width, stacked */}
      <section className="bg-gray-800/60 rounded-2xl p-5 mb-5">
        <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
          <span className="flex items-center justify-center w-7 h-7 rounded-full bg-purple-600 text-sm">1</span>
          Connect YouTube
        </h2>
        <p className="text-sm text-gray-400 mb-4">
          Authorize Tuneable to read your YouTube liked videos (we only import music under 15 min).
        </p>
        {hasToken ? (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-green-900/30 border border-green-700/30">
            <CheckCircle className="h-5 w-5 text-green-400 flex-shrink-0" />
            <span className="text-sm text-green-200">YouTube connected</span>
          </div>
        ) : (
          <button
            onClick={handleConnectYouTube}
            className="w-full flex items-center justify-center gap-2 py-3.5 px-4 bg-red-600 hover:bg-red-700 rounded-xl font-medium text-white transition-colors"
          >
            <ExternalLink className="h-5 w-5" />
            Connect YouTube
          </button>
        )}
      </section>

      {/* Step 2: Import - full width, stacked */}
      <section className="bg-gray-800/60 rounded-2xl p-5 mb-5">
        <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
          <span className="flex items-center justify-center w-7 h-7 rounded-full bg-purple-600 text-sm">2</span>
          Import videos
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Max videos (1–500)</label>
            <input
              type="number"
              value={maxVideos}
              onChange={(e) => setMaxVideos(Math.min(500, Math.max(1, parseInt(e.target.value) || 50)))}
              min={1}
              max={500}
              className="w-full py-3 px-4 bg-gray-900 border border-gray-600 rounded-xl text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Max duration (minutes)</label>
            <input
              type="number"
              value={maxDurationMinutes}
              onChange={(e) => setMaxDurationMinutes(Math.min(60, Math.max(1, parseInt(e.target.value) || 15)))}
              min={1}
              max={60}
              className="w-full py-3 px-4 bg-gray-900 border border-gray-600 rounded-xl text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>

          <button
            onClick={handleImport}
            disabled={isLoading || !hasToken}
            className="w-full flex items-center justify-center gap-2 py-3.5 px-4 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-xl font-medium text-white transition-colors"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Importing…
              </>
            ) : (
              <>
                <Download className="h-5 w-5" />
                Import videos
              </>
            )}
          </button>
        </div>
      </section>

      {/* Results */}
      {results && (
        <section className="bg-gray-800/60 rounded-2xl p-5 mb-5">
          <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-400" />
            Results
          </h3>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-green-900/40 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-green-400">{results.imported}</div>
              <div className="text-xs text-gray-400">Imported</div>
            </div>
            <div className="bg-yellow-900/40 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-yellow-400">{results.skipped}</div>
              <div className="text-xs text-gray-400">Skipped</div>
            </div>
            <div className="bg-red-900/40 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-red-400">{results.errors}</div>
              <div className="text-xs text-gray-400">Errors</div>
            </div>
          </div>
          {results.importedVideos && results.importedVideos.length > 0 && (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {results.importedVideos.slice(0, 8).map((v, i) => (
                <div key={i} className="text-sm p-2 rounded-lg bg-gray-900/50">
                  <div className="font-medium truncate">{v.title}</div>
                  <div className="text-gray-400 truncate">{v.artist}</div>
                </div>
              ))}
              {results.importedVideos.length > 8 && (
                <p className="text-xs text-gray-500">+ {results.importedVideos.length - 8} more</p>
              )}
            </div>
          )}
          <Link
            to="/dashboard"
            className="mt-4 block w-full py-3 text-center bg-gray-700 hover:bg-gray-600 rounded-xl font-medium"
          >
            View My Media
          </Link>
        </section>
      )}

      {/* Error */}
      {error && (
        <div className="mb-5 p-4 rounded-xl bg-red-900/40 border border-red-700/50 text-red-200 text-sm">
          {error}
        </div>
      )}

      {/* Info - compact for mobile */}
      <div className="text-xs text-gray-500 space-y-1">
        <p>• Only music videos under 15 min are imported</p>
        <p>• Duplicates are skipped</p>
      </div>
    </div>
  );
};

export default CreatorYouTubeImport;
