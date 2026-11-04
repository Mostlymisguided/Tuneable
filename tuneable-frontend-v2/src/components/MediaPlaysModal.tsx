import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { mediaAPI } from '../lib/api';
import { toast } from '../utils/toast';

interface MediaPlaysModalProps {
  mediaId: string;
  title?: string;
  playCount?: number;
  onClose: () => void;
}

function formatListenTime(seconds?: number) {
  const total = Math.max(0, Math.floor(seconds || 0));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function labelFor(value?: string) {
  return (value || 'unknown').replace(/_/g, ' ');
}

const MediaPlaysModal: React.FC<MediaPlaysModalProps> = ({ mediaId, title, playCount = 0, onClose }) => {
  const [countedOnly, setCountedOnly] = useState(true);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Awaited<ReturnType<typeof mediaAPI.getMediaPlays>> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    mediaAPI.getMediaPlays(mediaId, { page, limit: 25, counted: countedOnly })
      .then((response) => {
        if (!cancelled) setData(response);
      })
      .catch((error) => {
        console.error('Error loading media plays:', error);
        if (!cancelled) {
          toast.error('Failed to load plays');
          setData(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [countedOnly, mediaId, page]);

  const sessions = data?.sessions || [];
  const pagination = data?.pagination;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-gray-800">
          <div>
            <h3 className="text-lg font-semibold text-white">{data?.media?.title || title || 'Plays'}</h3>
            <p className="text-sm text-gray-400 mt-1">
              {playCount.toLocaleString()} public {playCount === 1 ? 'play' : 'plays'}
              {data?.summary ? ` · ${data.summary.uniqueListeners.toLocaleString()} ${data.summary.uniqueListeners === 1 ? 'listener' : 'listeners'}` : ''}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              One counted play per listener per day. Seeking ahead does not count.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-white" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-gray-800 flex gap-2">
          <button
            type="button"
            onClick={() => { setCountedOnly(true); setPage(1); }}
            className={`px-3 py-1.5 rounded text-sm ${countedOnly ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-300'}`}
          >
            Counted plays
          </button>
          <button
            type="button"
            onClick={() => { setCountedOnly(false); setPage(1); }}
            className={`px-3 py-1.5 rounded text-sm ${!countedOnly ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-300'}`}
          >
            All sessions
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="text-center py-10">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600 mx-auto" />
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-gray-400 text-center py-10">
              {countedOnly ? 'No counted plays yet.' : 'No listening sessions yet.'}
            </p>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => (
                <div key={session._id} className="bg-gray-800 rounded-lg px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      {session.user?._id ? (
                        <Link to={`/user/${session.user._id}`} className="text-sm font-medium text-white hover:text-purple-300">
                          {session.user.username}
                        </Link>
                      ) : (
                        <span className="text-sm text-gray-400">Unknown listener</span>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        {session.lastPlayedAt ? new Date(session.lastPlayedAt).toLocaleString() : 'Unknown time'}
                        {' · '}
                        {labelFor(session.sourceType)}
                        {' · '}
                        {labelFor(session.client)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm text-gray-200">{formatListenTime(session.listenDurationSeconds)} listened</div>
                      <div className="text-xs text-gray-500">{Math.round(session.completionPercent || 0)}% through</div>
                    </div>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs ${session.countedAsPlay ? 'bg-green-500/20 text-green-300' : 'bg-gray-700 text-gray-300'}`}>
                      {session.countedAsPlay ? 'Counted' : 'Not counted'}
                    </span>
                    <span className="px-2 py-0.5 rounded text-xs bg-gray-700 text-gray-300">
                      {labelFor(session.status)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 px-5 py-3 border-t border-gray-800">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 bg-gray-800 text-white rounded disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-sm text-gray-400">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((current) => current + 1)}
              disabled={page >= pagination.totalPages}
              className="px-3 py-1.5 bg-gray-800 text-white rounded disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MediaPlaysModal;
