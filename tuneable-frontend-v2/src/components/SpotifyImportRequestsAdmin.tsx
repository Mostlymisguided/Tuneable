import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { CheckCircle, Clock, XCircle } from 'lucide-react';
import { userAPI } from '../lib/api';

type RequestStatus = 'pending' | 'allowlisted' | 'rejected';

interface SpotifyImportRequestRow {
  _id: string;
  email: string;
  spotifyAccount: string;
  note?: string | null;
  status: RequestStatus;
  createdAt: string;
  reviewedAt?: string | null;
  rejectedReason?: string | null;
  userId?: { username?: string; email?: string } | string;
}

const SpotifyImportRequestsAdmin: React.FC = () => {
  const [requests, setRequests] = useState<SpotifyImportRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | RequestStatus>('pending');
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadRequests = async () => {
    try {
      setLoading(true);
      const statusParam = filter === 'all' ? undefined : filter;
      const response = await userAPI.getSpotifyImportRequests(statusParam);
      setRequests(response.requests || []);
    } catch (error) {
      console.error('Error loading Spotify import requests:', error);
      toast.error('Failed to load Spotify import requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRequests();
  }, [filter]);

  const handleAllowlist = async (requestId: string) => {
    try {
      setProcessingId(requestId);
      await userAPI.allowlistSpotifyImportRequest(requestId);
      toast.success('Marked allowlisted — add this email in Spotify Developer Dashboard → Users');
      await loadRequests();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to update request');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (requestId: string) => {
    const reason = prompt('Reason for rejection (optional):');
    try {
      setProcessingId(requestId);
      await userAPI.rejectSpotifyImportRequest(requestId, reason || undefined);
      toast.success('Request rejected');
      await loadRequests();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to reject request');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-4 mt-10">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold text-white">Spotify import requests</h3>
          <p className="text-sm text-gray-400">
            Development-mode allowlist. Add the Spotify account email in the developer dashboard, then mark allowlisted.
          </p>
        </div>
        <div className="flex gap-2">
          {(['pending', 'allowlisted', 'rejected', 'all'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`px-3 py-1.5 rounded-lg text-sm ${
                filter === value ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-300'
              }`}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-gray-400 text-sm">Loading…</div>
      ) : requests.length === 0 ? (
        <div className="bg-gray-800 rounded-lg p-6 text-gray-400 text-sm">No requests</div>
      ) : (
        <div className="space-y-3">
          {requests.map((request) => (
            <div key={request._id} className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-white font-medium truncate">
                    {typeof request.userId === 'object' ? request.userId.username : request.email}
                  </div>
                  <div className="text-sm text-gray-400 truncate">Tuneable: {request.email}</div>
                  <div className="text-sm text-green-300 truncate">Spotify: {request.spotifyAccount}</div>
                  {request.note ? <div className="text-xs text-gray-500 mt-1">{request.note}</div> : null}
                  <div className="text-xs text-gray-500 mt-1">
                    {new Date(request.createdAt).toLocaleString()}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded border ${
                    request.status === 'pending'
                      ? 'border-amber-600 text-amber-200'
                      : request.status === 'allowlisted'
                        ? 'border-emerald-600 text-emerald-200'
                        : 'border-red-600 text-red-200'
                  }`}>
                    {request.status === 'pending' && <Clock className="inline w-3 h-3 mr-1" />}
                    {request.status === 'allowlisted' && <CheckCircle className="inline w-3 h-3 mr-1" />}
                    {request.status === 'rejected' && <XCircle className="inline w-3 h-3 mr-1" />}
                    {request.status}
                  </span>
                  {request.status === 'pending' ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={processingId === request._id}
                        onClick={() => void handleAllowlist(request._id)}
                        className="px-2 py-1 text-xs rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50"
                      >
                        Allowlisted
                      </button>
                      <button
                        type="button"
                        disabled={processingId === request._id}
                        onClick={() => void handleReject(request._id)}
                        className="px-2 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SpotifyImportRequestsAdmin;
