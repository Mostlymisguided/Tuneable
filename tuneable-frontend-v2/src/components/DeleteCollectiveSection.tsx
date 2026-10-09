import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { toast } from '../utils/toast';
import { collectiveAPI } from '../lib/api';

interface DeleteCollectiveSectionProps {
  collectiveId: string;
  collectiveName: string;
  noun: 'collective' | 'venue';
}

const DeleteCollectiveSection: React.FC<DeleteCollectiveSectionProps> = ({
  collectiveId,
  collectiveName,
  noun,
}) => {
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const label = noun === 'venue' ? 'Venue' : 'Collective';

  const handleDelete = async () => {
    if (confirmText !== 'DELETE') return;

    setIsDeleting(true);
    try {
      await collectiveAPI.deleteCollective(collectiveId);
      toast.success(`${label} deleted`);
      setShowModal(false);
      navigate('/dashboard');
    } catch (error: any) {
      const data = error?.response?.data;
      const message = data?.error
        ? (data.details ? `${data.error}: ${data.details}` : data.error)
        : `Failed to delete ${noun}`;
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
          Deleting this {noun} removes its public profile. Tunes already credited to it keep that credit.
          The name can be used again for a new {noun}.
        </p>
        <button
          type="button"
          onClick={() => {
            setConfirmText('');
            setShowModal(true);
          }}
          className="px-4 py-2 bg-red-600/80 hover:bg-red-600 text-white font-semibold rounded-lg transition-colors flex items-center space-x-2"
        >
          <Trash2 className="h-4 w-4" />
          <span>Delete {label}</span>
        </button>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[10000] p-4">
          <div className="card max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="h-6 w-6 text-red-400" />
                <h2 className="text-xl font-bold text-white">Delete {label}</h2>
              </div>
              <button
                onClick={() => !isDeleting && setShowModal(false)}
                className="text-gray-400 hover:text-white transition-colors"
                disabled={isDeleting}
                type="button"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <p className="text-gray-300 mb-4">
              Are you sure you want to delete <span className="font-semibold text-white">&quot;{collectiveName}&quot;</span>?
              This removes the {noun} from Tuneable.
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
                type="button"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting || confirmText !== 'DELETE'}
                type="button"
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
              >
                {isDeleting ? 'Deleting...' : `Delete ${label}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default DeleteCollectiveSection;
