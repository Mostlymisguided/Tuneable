import React, { useState } from 'react';
import { X, UserPlus, Copy, Check } from 'lucide-react';
import { userAPI } from '../lib/api';
import { toast } from 'react-toastify';

interface CreateTestUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

const CreateTestUserModal: React.FC<CreateTestUserModalProps> = ({
  isOpen,
  onClose,
  onCreated,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [balance, setBalance] = useState('11.11');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [created, setCreated] = useState<{
    username: string;
    password: string;
    generated: boolean;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const reset = () => {
    setUsername('');
    setPassword('');
    setBalance('11.11');
    setCreated(null);
    setCopied(false);
  };

  const handleClose = () => {
    if (isSubmitting) return;
    reset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = username.trim();
    if (!trimmed) {
      toast.error('Username is required');
      return;
    }

    const amount = parseFloat(balance);
    if (balance !== '' && (Number.isNaN(amount) || amount < 0)) {
      toast.error('Starting balance must be 0 or greater');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await userAPI.createTestUser({
        username: trimmed,
        password: password.trim() || undefined,
        balance: Number.isNaN(amount) ? 0 : amount,
      });
      setCreated({
        username: result.user.username,
        password: result.password,
        generated: result.passwordGenerated,
      });
      toast.success(`Created test user ${result.user.username}`);
      onCreated?.();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to create test user');
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyPassword = async () => {
    if (!created?.password) return;
    try {
      await navigator.clipboard.writeText(created.password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy password');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50" style={{ zIndex: 10000 }}>
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <UserPlus className="w-5 h-5" />
            Create Test User
          </h2>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="text-gray-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {created ? (
          <div className="p-6 space-y-4">
            <p className="text-sm text-gray-300">
              Account created. Copy the password now — it will not be shown again.
            </p>
            <div className="bg-gray-900 rounded-lg p-4 space-y-2 text-sm">
              <div>
                <span className="text-gray-400">Username: </span>
                <span className="text-white font-semibold">{created.username}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="text-gray-400">Password: </span>
                  <span className="text-white font-mono">{created.password}</span>
                </div>
                <button
                  type="button"
                  onClick={copyPassword}
                  className="text-purple-400 hover:text-purple-300"
                  title="Copy password"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <p className="text-sm text-gray-400">
              Creates a flagged test account you can tip with and later delete from this screen.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="testuser1"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                autoComplete="off"
              />
              <p className="mt-1 text-xs text-gray-500">3–20 letters and numbers.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Password <span className="text-gray-500 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Leave blank to auto-generate"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Starting balance (£)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleClose}
                disabled={isSubmitting}
                className="px-4 py-2 text-gray-300 hover:text-white disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white rounded-lg"
              >
                {isSubmitting ? 'Creating…' : 'Create'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default CreateTestUserModal;
