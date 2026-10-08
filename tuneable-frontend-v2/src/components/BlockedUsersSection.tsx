import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ban, Loader2 } from 'lucide-react';
import { toast } from '../utils/toast';
import { userAPI, type BlockedUser } from '../lib/api';
import { DEFAULT_PROFILE_PIC } from '../constants';
import { useBlockedUsersStore } from '../stores/blockedUsersStore';
import { getUserProfileUrl } from '../utils/profileNavigation';

function apiErrorMessage(error: unknown, fallback: string): string {
  return (error as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback;
}

const BlockedUsersSection: React.FC = () => {
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const markUnblocked = useBlockedUsersStore((s) => s.markUnblocked);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await userAPI.getBlockedUsers();
      setBlocked(res.blocked ?? []);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load blocked users'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleUnblock = async (entry: BlockedUser) => {
    setBusyId(entry.id);
    try {
      await userAPI.unblockUser(entry.id);
      markUnblocked(entry.id, [entry.uuid, entry._id, entry.username]);
      setBlocked((prev) => prev.filter((b) => b.id !== entry.id));
      toast.success(`Unblocked @${entry.username ?? 'user'}`);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to unblock user'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="card p-6 mt-6">
      <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
        <Ban className="h-6 w-6" />
        Blocked users
      </h2>
      <p className="text-gray-400 mb-4">
        Blocked users can&apos;t see your profile, reply to your comments, or invite you, and you won&apos;t see
        their activity.
      </p>

      {isLoading ? (
        <div className="flex items-center gap-2 text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : error ? (
        <div className="flex items-center gap-4">
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
          <button type="button" onClick={() => void load()} className="text-sm text-purple-300 hover:text-white">
            Retry
          </button>
        </div>
      ) : blocked.length === 0 ? (
        <p className="text-gray-400">You haven&apos;t blocked anyone.</p>
      ) : (
        <ul className="divide-y divide-white/10 max-w-md">
          {blocked.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-4 py-3">
              <Link
                to={getUserProfileUrl(entry)}
                className="flex items-center gap-3 min-w-0 hover:opacity-90"
              >
                <img
                  src={entry.profilePic || DEFAULT_PROFILE_PIC}
                  alt=""
                  className="h-9 w-9 rounded-full object-cover flex-shrink-0"
                  onError={(e) => {
                    e.currentTarget.src = DEFAULT_PROFILE_PIC;
                  }}
                />
                <span className="text-white font-medium truncate">@{entry.username ?? 'user'}</span>
              </Link>
              <button
                type="button"
                onClick={() => void handleUnblock(entry)}
                disabled={busyId !== null}
                className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busyId === entry.id && <Loader2 className="h-4 w-4 animate-spin" />}
                Unblock
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default BlockedUsersSection;
