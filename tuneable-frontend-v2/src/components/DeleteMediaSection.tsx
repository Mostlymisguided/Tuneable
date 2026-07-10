import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { toast } from 'react-toastify';
import { mediaAPI } from '../lib/api';

interface DeleteMediaSectionProps {
  mediaId: string;
  mediaTitle: string;
  contentLabel: 'Tune' | 'Episode';
  redirectTo: string;
}

const DeleteMediaSection: React.FC<DeleteMediaSectionProps> = ({
  mediaId,
  mediaTitle,
  contentLabel,
  redirectTo,
}) => {
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const handleDelete = async () => {
    if (confirmText !== 'DELETE') return;

    setIsDeleting(true);
    try {
      const result = await mediaAPI.deleteMedia(mediaId);
      const refundNote =
        result.refundedBidsCount > 0
          ? ` ${result.refundedBidsCount} tip(s) refunded.`
          : '';
      toast.success(`${contentLabel} deleted.${refundNote}`);
      setShowModal(false);
      navigate(redirectTo);
    } catch (error: any) {
      const message = error?.response?.data?.error || `Failed to delete ${contentLabel.toLowerCase()}`;
      toast.error(message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div className="mt-8 pt-6 border-t border-gray-700">
        <h3 className="text-sm font-semibold text-red-400 mb-2">Danger Zone</h3>
        <p className="text-sm text-gray-400 mb-4">
          Deleting this {contentLabel.toLowerCase()} removes it from Tuneable and refunds all active tips to supporters.
          An admin can restore it later, but refunded tips will not be re-applied.
        </p>
        <button
          type="button"
          onClick={() => {
            setConfirmText('');
            setShowModal(true);
          }}
          className="px-4 py-2 bg-red-600/80 hover:bg-red-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center space-x-2"
        >
          <Trash2 className="h-4 w-4" />
          <span>Delete {contentLabel}</span>
        </button>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[10000] p-4">
          <div className="card max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="h-6 w-6 text-red-400" />
                <h2 className="text-xl font-bold text-white">Delete {contentLabel}</h2>
              </div>
              <button
                onClick={() => !isDeleting && setShowModal(false)}
                className="text-gray-400 hover:text-white transition-colors"
                disabled={isDeleting}
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <p className="text-gray-300 mb-4">
              Are you sure you want to delete <span className="font-semibold text-white">&quot;{mediaTitle}&quot;</span>?
              This will refund all active tips and remove the {contentLabel.toLowerCase()} from public view.
            </p>

            <label className="block text-sm text-gray-400 mb-2">
              Type <span className="font-mono text-white">DELETE</span> to confirm
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="input w-full mb-6"
              placeholder="DELETE"
              disabled={isDeleting}
            />

            <div className="flex space-x-3">
              <button
                onClick={() => setShowModal(false)}
                className="btn-secondary flex-1"
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting || confirmText !== 'DELETE'}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
              >
                {isDeleting ? 'Deleting...' : `Delete ${contentLabel}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default DeleteMediaSection;
