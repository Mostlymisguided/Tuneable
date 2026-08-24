import React, { useEffect, useState } from 'react';
import { X, Trash2, AlertTriangle } from 'lucide-react';
import { userAPI } from '../lib/api';
import { toast } from 'react-toastify';
import { penceToPounds } from '../utils/currency';

interface DeleteUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  username: string;
  isTestUser?: boolean;
  onDeleted?: () => void;
}

const DeleteUserModal: React.FC<DeleteUserModalProps> = ({
  isOpen,
  onClose,
  userId,
  username,
  isTestUser,
  onDeleted,
}) => {
  const [confirmUsername, setConfirmUsername] = useState('');
  const [confirmNotTest, setConfirmNotTest] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof userAPI.getUserPurgePreview>> | null>(null);

  useEffect(() => {
    if (!isOpen || !userId) return;
    setConfirmUsername('');
    setConfirmNotTest(false);
    setPreview(null);
    setIsLoading(true);
    userAPI.getUserPurgePreview(userId)
      .then(setPreview)
      .catch((error: any) => {
        toast.error(error.response?.data?.error || 'Failed to load delete preview');
      })
      .finally(() => setIsLoading(false));
  }, [isOpen, userId]);

  const handleClose = () => {
    if (isDeleting) return;
    onClose();
  };

  const usernameMatches = confirmUsername.trim().toLowerCase() === username.trim().toLowerCase();
  const flaggedTest = preview?.user.isTestUser ?? isTestUser;
  const canDelete = usernameMatches && (flaggedTest || confirmNotTest) && !isDeleting && !isLoading;

  const handleDelete = async () => {
    if (!canDelete) return;
    setIsDeleting(true);
    try {
      const result = await userAPI.purgeUser(userId, confirmUsername.trim(), !flaggedTest);
      const tipCount = result?.tips?.refundedCount ?? 0;
      toast.success(
        tipCount > 0
          ? `Deleted ${username} and unwound ${tipCount} tip${tipCount === 1 ? '' : 's'}`
          : `Deleted ${username}`
      );
      onDeleted?.();
      onClose();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to delete user');
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isOpen) return null;

  const counts = preview?.counts;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50" style={{ zIndex: 10000 }}>
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-red-400" />
            Delete User
          </h2>
          <button
            onClick={handleClose}
            disabled={isDeleting}
            className="text-gray-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-300">
            Permanently delete <span className="font-semibold text-white">{username}</span> and unwind their tips
            from charts, escrow, and party queues. Media they uploaded is left in place.
          </p>

          {isLoading ? (
            <div className="text-center py-6">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500 mx-auto" />
            </div>
          ) : counts ? (
            <div className="bg-gray-900 rounded-lg p-4 grid grid-cols-2 gap-2 text-sm">
              <div className="text-gray-400">Active tips</div>
              <div className="text-white">
                {counts.activeBids} ({penceToPounds(counts.activeBidPence)})
              </div>
              <div className="text-gray-400">All tips</div>
              <div className="text-white">{counts.bids}</div>
              <div className="text-gray-400">Ledger rows</div>
              <div className="text-white">{counts.ledgerEntries}</div>
              <div className="text-gray-400">Parties joined</div>
              <div className="text-white">{counts.parties}</div>
              <div className="text-gray-400">Media added</div>
              <div className="text-white">{counts.mediaAdded} (kept)</div>
              <div className="text-gray-400">Media owned</div>
              <div className="text-white">{counts.mediaOwned} (unlinked)</div>
            </div>
          ) : null}

          {!flaggedTest && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-900/30 border border-yellow-700 text-yellow-200 text-sm">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                This account is not flagged as a test user. Deleting it still unwinds tips and removes the account.
                <label className="mt-2 flex items-center gap-2 text-yellow-100">
                  <input
                    type="checkbox"
                    checked={confirmNotTest}
                    onChange={(e) => setConfirmNotTest(e.target.checked)}
                  />
                  I understand this is not a test account
                </label>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Type <span className="text-white font-semibold">{username}</span> to confirm
            </label>
            <input
              type="text"
              value={confirmUsername}
              onChange={(e) => setConfirmUsername(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-red-500"
              autoComplete="off"
              disabled={isDeleting}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isDeleting}
              className="px-4 py-2 text-gray-300 hover:text-white disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={!canDelete}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg"
            >
              {isDeleting ? 'Deleting…' : 'Delete user and tips'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeleteUserModal;
