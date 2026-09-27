import React, { useCallback, useEffect, useState } from 'react';
import { toast } from '../utils/toast';
import { userAPI } from '../lib/api';

type FoundingRequest = {
  userId: string;
  username: string;
  email: string;
  artistName: string | null;
  note: string;
  requestedAt: string | null;
  status: string;
};

const FoundingRequestsAdmin: React.FC = () => {
  const [requests, setRequests] = useState<FoundingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await userAPI.getFoundingRequests('pending');
      setRequests(data.requests || []);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to load founding requests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const review = async (userId: string, action: 'approve' | 'reject') => {
    setBusyId(userId);
    try {
      const result = await userAPI.reviewFoundingRequest(userId, action);
      toast.success(result.message || (action === 'approve' ? 'Approved' : 'Rejected'));
      setRequests((prev) => prev.filter((row) => row.userId !== userId));
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to review request');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return <p className="text-xs text-gray-400">Loading founding requests…</p>;
  }

  if (requests.length === 0) {
    return <p className="text-xs text-gray-400">No pending founding-seat requests.</p>;
  }

  return (
    <ul className="space-y-3">
      {requests.map((row) => (
        <li key={row.userId} className="rounded-lg border border-gray-700 bg-gray-900/40 p-3">
          <p className="text-sm text-white">
            @{row.username}
            {row.artistName ? ` · ${row.artistName}` : ''}
          </p>
          <p className="text-xs text-gray-400">{row.email}</p>
          {row.note && <p className="text-sm text-gray-200 mt-2 whitespace-pre-wrap">{row.note}</p>}
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              disabled={busyId === row.userId}
              onClick={() => review(row.userId, 'approve')}
              className="px-3 py-1.5 bg-green-700 hover:bg-green-600 disabled:bg-gray-600 text-white rounded text-xs"
            >
              Approve
            </button>
            <button
              type="button"
              disabled={busyId === row.userId}
              onClick={() => review(row.userId, 'reject')}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-600 text-white rounded text-xs"
            >
              Reject
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
};

export default FoundingRequestsAdmin;
