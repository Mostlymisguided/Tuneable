import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from '../utils/toast';
import { userAPI } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

const DeleteAccountSection: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!user) return null;

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await userAPI.deleteAccount();
      logout();
      toast.success('Account deleted');
      navigate('/');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Could not delete the account. Email hi@tuneable.stream.');
      setIsDeleting(false);
    }
  };

  return (
    <div className="card p-6 mt-6 border border-red-500/30">
      <h2 className="text-xl font-bold text-white mb-2">Delete account</h2>
      <p className="text-gray-400 text-sm mb-4">
        This signs you out and removes your name, email, phone, password, profile photo, location,
        and connected logins. Unspent wallet balance is cleared and is not refunded. Tips you have
        already placed, payment records, and any creator earnings still owed stay on an anonymized
        account so that money can be accounted for. This cannot be undone.
      </p>
      {confirming ? (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="px-4 py-2 rounded-lg bg-red-600 text-white disabled:opacity-50 inline-flex items-center gap-2"
          >
            {isDeleting && <Loader2 className="h-4 w-4 animate-spin" />}
            Delete forever
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={isDeleting}
            className="px-4 py-2 rounded-lg bg-gray-700 text-white"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="px-4 py-2 rounded-lg border border-red-500 text-red-300 hover:bg-red-500/10"
        >
          Delete account
        </button>
      )}
    </div>
  );
};

export default DeleteAccountSection;
