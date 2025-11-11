import React, { useState, useEffect, useRef } from 'react';
import { X, Mail, Send, Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { emailAPI } from '../lib/api';

interface EmailInviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  inviteCode: string;
  inviterUsername: string;
}

const EmailInviteModal: React.FC<EmailInviteModalProps> = ({
  isOpen,
  onClose,
  inviteCode,
  inviterUsername: _inviterUsername
}) => {
  const [emailInput, setEmailInput] = useState('');
  const [emails, setEmails] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);

  // Close modal on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      // Focus email input when modal opens
      setTimeout(() => {
        emailInputRef.current?.focus();
      }, 100);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setEmailInput('');
      setEmails([]);
    }
  }, [isOpen]);

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  };

  const handleAddEmail = () => {
    const trimmedEmail = emailInput.trim();
    
    if (!trimmedEmail) {
      toast.error('Please enter an email address');
      return;
    }

    if (!validateEmail(trimmedEmail)) {
      toast.error('Please enter a valid email address');
      return;
    }

    if (emails.includes(trimmedEmail.toLowerCase())) {
      toast.error('This email is already in the list');
      return;
    }

    setEmails([...emails, trimmedEmail.toLowerCase()]);
    setEmailInput('');
    emailInputRef.current?.focus();
  };

  const handleRemoveEmail = (emailToRemove: string) => {
    setEmails(emails.filter(email => email !== emailToRemove));
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddEmail();
    }
  };

  const handleSubmit = async () => {
    if (emails.length === 0) {
      toast.error('Please add at least one email address');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await emailAPI.sendInvite(emails);
      
      if (response.errors && response.errors.length > 0) {
        const errorCount = response.errors.length;
        const successCount = response.results?.length || 0;
        
        if (successCount > 0) {
          toast.success(`Successfully sent ${successCount} invite(s). ${errorCount} failed.`);
        } else {
          toast.error(`Failed to send invites. Please try again.`);
        }
      } else {
        toast.success(`Successfully sent ${emails.length} invite email(s)!`);
        onClose();
      }
    } catch (error: any) {
      console.error('Error sending invite emails:', error);
      const errorMessage = error.response?.data?.error || 'Failed to send invite emails. Please try again.';
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div
        ref={modalRef}
        className="bg-gray-900 border border-purple-500/30 rounded-lg shadow-xl w-full max-w-md"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-purple-500/20">
          <div className="flex items-center gap-3">
            <Mail className="h-6 w-6 text-purple-400" />
            <h2 className="text-xl font-semibold text-white">Send Invite Emails</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
            disabled={isSubmitting}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Email Addresses
            </label>
            <div className="flex gap-2">
              <input
                ref={emailInputRef}
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Enter email address"
                className="flex-1 px-4 py-2 bg-black/40 border border-purple-500/30 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                disabled={isSubmitting}
              />
              <button
                onClick={handleAddEmail}
                disabled={isSubmitting || !emailInput.trim()}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Press Enter or click Add to add an email to the list
            </p>
          </div>

          {/* Email List */}
          {emails.length > 0 && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-300">
                Recipients ({emails.length})
              </label>
              <div className="max-h-48 overflow-y-auto bg-black/20 border border-purple-500/20 rounded-lg p-3 space-y-2">
                {emails.map((email, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between bg-black/40 rounded px-3 py-2"
                  >
                    <span className="text-sm text-gray-300">{email}</span>
                    <button
                      onClick={() => handleRemoveEmail(email)}
                      disabled={isSubmitting}
                      className="text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Info */}
          <div className="bg-purple-900/20 border border-purple-500/20 rounded-lg p-3">
            <p className="text-xs text-gray-300">
              Recipients will receive an email with a link to sign up. The invite code{' '}
              <span className="font-mono text-purple-400">{inviteCode}</span> will be automatically
              prefilled in the sign-up form.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-purple-500/20">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-gray-300 hover:text-white transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || emails.length === 0}
            className="flex items-center gap-2 px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Send Invites
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmailInviteModal;

