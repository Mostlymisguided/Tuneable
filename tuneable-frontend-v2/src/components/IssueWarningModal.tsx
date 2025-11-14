import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, Info, AlertCircle, Ban } from 'lucide-react';
import { userAPI } from '../lib/api';
import { toast } from 'react-toastify';

interface IssueWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  username: string;
  onWarningIssued?: () => void;
}

const IssueWarningModal: React.FC<IssueWarningModalProps> = ({
  isOpen,
  onClose,
  userId,
  username,
  onWarningIssued
}) => {
  const [warningType, setWarningType] = useState<'info' | 'warning' | 'final_warning' | 'suspension_notice'>('warning');
  const [message, setMessage] = useState('');
  const [reason, setReason] = useState('');
  const [expiresInDays, setExpiresInDays] = useState<number | ''>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [userWarnings, setUserWarnings] = useState<any>(null);

  useEffect(() => {
    if (isOpen && userId) {
      fetchUserWarnings();
    }
  }, [isOpen, userId]);

  const fetchUserWarnings = async () => {
    try {
      const data = await userAPI.getUserWarnings(userId);
      setUserWarnings(data);
    } catch (error) {
      console.error('Error fetching user warnings:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!message.trim()) {
      toast.error('Please enter a warning message');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await userAPI.issueWarning(
        userId,
        warningType,
        message.trim(),
        reason.trim() || undefined,
        expiresInDays ? parseInt(expiresInDays.toString()) : undefined
      );

      toast.success(`Warning issued to ${username}`);
      
      if (result.accountLocked) {
        toast.warning('User account has been automatically suspended due to multiple warnings');
      }

      // Reset form
      setMessage('');
      setReason('');
      setExpiresInDays('');
      setWarningType('warning');

      if (onWarningIssued) {
        onWarningIssued();
      }

      onClose();
    } catch (error: any) {
      console.error('Error issuing warning:', error);
      toast.error(error.response?.data?.error || 'Failed to issue warning');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const getWarningTypeConfig = (type: string) => {
    switch (type) {
      case 'info':
        return { icon: Info, label: 'Information', color: 'text-blue-400', bgColor: 'bg-blue-900/20' };
      case 'warning':
        return { icon: AlertTriangle, label: 'Warning', color: 'text-yellow-400', bgColor: 'bg-yellow-900/20' };
      case 'final_warning':
        return { icon: AlertCircle, label: 'Final Warning', color: 'text-red-400', bgColor: 'bg-red-900/20' };
      case 'suspension_notice':
        return { icon: Ban, label: 'Suspension Notice', color: 'text-red-500', bgColor: 'bg-red-900/30' };
      default:
        return { icon: AlertTriangle, label: 'Warning', color: 'text-yellow-400', bgColor: 'bg-yellow-900/20' };
    }
  };

  const typeConfig = getWarningTypeConfig(warningType);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10000] p-4">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Issue Warning to {username}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 transition-colors"
            disabled={isSubmitting}
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* User Warning History */}
        {userWarnings && (
          <div className="mb-4 p-3 bg-gray-700 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-300">Warning History</span>
              <div className="flex space-x-4 text-xs text-gray-400">
                <span>Total: {userWarnings.warningCount || 0}</span>
                <span>Final: {userWarnings.finalWarningCount || 0}</span>
              </div>
            </div>
            {userWarnings.warnings && userWarnings.warnings.length > 0 ? (
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {userWarnings.warnings.slice(-5).reverse().map((w: any, idx: number) => (
                  <div key={idx} className="text-xs text-gray-400 bg-gray-800 p-2 rounded">
                    <div className="flex items-center justify-between">
                      <span className="capitalize">{w.type.replace('_', ' ')}</span>
                      <span>{new Date(w.issuedAt).toLocaleDateString()}</span>
                    </div>
                    {w.reason && <div className="mt-1 text-gray-500">Reason: {w.reason}</div>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-500">No previous warnings</p>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Warning Type */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Warning Type
            </label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {(['info', 'warning', 'final_warning', 'suspension_notice'] as const).map((type) => {
                const config = getWarningTypeConfig(type);
                const Icon = config.icon;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setWarningType(type)}
                    className={`p-3 rounded-lg border-2 transition-all ${
                      warningType === type
                        ? `${config.bgColor} border-purple-500`
                        : 'bg-gray-700 border-gray-600 hover:border-gray-500'
                    }`}
                  >
                    <Icon className={`h-5 w-5 ${config.color} mx-auto mb-1`} />
                    <div className={`text-xs text-center ${warningType === type ? 'text-white' : 'text-gray-400'}`}>
                      {config.label}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Message */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Warning Message <span className="text-red-400">*</span>
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-500 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              rows={4}
              placeholder="Enter the warning message that will be displayed to the user..."
              required
              disabled={isSubmitting}
            />
          </div>

          {/* Reason */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Reason (Optional)
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-500 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="e.g., Spam, Harassment, Terms Violation"
              disabled={isSubmitting}
            />
          </div>

          {/* Expiration */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Expires In (Days) - Leave empty for permanent
            </label>
            <input
              type="number"
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value ? parseInt(e.target.value) : '')}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-500 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="e.g., 30"
              min="1"
              disabled={isSubmitting}
            />
          </div>

          {/* Auto-escalation notice */}
          {(userWarnings?.warningCount || 0) >= 2 && (
            <div className="p-3 bg-yellow-900/30 border border-yellow-600 rounded-lg">
              <p className="text-xs text-yellow-300">
                ⚠️ This user has {userWarnings.warningCount} warning(s). Issuing another warning may trigger automatic suspension.
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 hover:bg-gray-600 rounded-md transition-colors"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isSubmitting || !message.trim()}
            >
              {isSubmitting ? 'Issuing...' : 'Issue Warning'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default IssueWarningModal;

