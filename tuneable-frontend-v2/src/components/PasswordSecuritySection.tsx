import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff, KeyRound, Loader2, Mail } from 'lucide-react';
import { toast } from '../utils/toast';
import { authAPI } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import {
  PASSWORD_HINT,
  PASSWORD_MAX_LENGTH,
  PASSWORD_PLACEHOLDER,
  passwordApiErrorMessage,
  passwordLengthError,
  submitWithPasswordWarnings,
} from '../utils/passwordPolicy';

const PasswordSecuritySection: React.FC = () => {
  const { user, replaceToken, refreshUser } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingLink, setIsSendingLink] = useState(false);
  const [linkSent, setLinkSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!currentPassword) {
      setError('Enter your current password');
      return;
    }
    const lengthError = passwordLengthError(newPassword);
    if (lengthError) {
      setError(lengthError);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    if (newPassword === currentPassword) {
      setError('New password must be different from your current one');
      return;
    }

    setIsSaving(true);
    try {
      const result = await submitWithPasswordWarnings((acceptPasswordWarnings) =>
        authAPI.changePassword(currentPassword, newPassword, acceptPasswordWarnings)
      );
      if (!result) return;
      replaceToken(result.token);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Password changed. Other devices have been signed out.');
    } catch (err) {
      const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code;
      if (code === 'NO_PASSWORD') {
        await refreshUser();
      }
      setError(passwordApiErrorMessage(err, 'Could not change password. Please try again.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendSetPasswordLink = async () => {
    if (!user.email) return;
    setIsSendingLink(true);
    try {
      await authAPI.requestPasswordReset(user.email);
      setLinkSent(true);
    } catch (err) {
      toast.error(passwordApiErrorMessage(err, 'Could not send the email. Please try again.'));
    } finally {
      setIsSendingLink(false);
    }
  };

  const inputType = showPasswords ? 'text' : 'password';

  return (
    <div className="card p-6">
      <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
        <KeyRound className="h-6 w-6" />
        Password
      </h2>

      {user.hasPassword === false ? (
        <div className="space-y-4">
          <p className="text-gray-400">
            You sign in with a connected account (such as Google or Facebook), so there&apos;s no password on your
            Tuneable account yet.
          </p>
          {user.email ? (
            linkSent ? (
              <p className="text-green-400">
                We&apos;ve emailed a link to <span className="text-white">{user.email}</span>. It expires in 1 hour.
              </p>
            ) : (
              <>
                <p className="text-gray-400">
                  To also sign in with a password, we&apos;ll email a secure link to{' '}
                  <span className="text-white">{user.email}</span> so you can set one.
                </p>
                <button
                  type="button"
                  onClick={handleSendSetPasswordLink}
                  disabled={isSendingLink}
                  className="px-6 py-2 bg-purple-600/40 hover:bg-purple-500 text-white rounded-lg transition-colors flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSendingLink ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                  <span>{isSendingLink ? 'Sending…' : 'Email me a link to set a password'}</span>
                </button>
              </>
            )
          ) : (
            <p className="text-gray-400">
              Add an email address to your profile first, so we can send you a secure link to set a password.
            </p>
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
          <p className="text-gray-400">
            Changing your password signs you out on every other device.
          </p>

          {/* Lets password managers associate the new password with this account. */}
          <input
            type="text"
            name="username"
            autoComplete="username"
            value={user.email || user.username}
            readOnly
            hidden
          />

          <div>
            <label htmlFor="current-password" className="block text-white font-medium mb-2">
              Current password
            </label>
            <input
              id="current-password"
              type={inputType}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="input"
              autoComplete="current-password"
              required
            />
          </div>

          <div>
            <label htmlFor="new-password" className="block text-white font-medium mb-2">
              New password
            </label>
            <input
              id="new-password"
              type={inputType}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="input"
              placeholder={PASSWORD_PLACEHOLDER}
              autoComplete="new-password"
              maxLength={PASSWORD_MAX_LENGTH}
              aria-describedby="new-password-hint"
              required
            />
            <p id="new-password-hint" className="mt-1 text-sm text-gray-400">
              {PASSWORD_HINT}
            </p>
          </div>

          <div>
            <label htmlFor="confirm-new-password" className="block text-white font-medium mb-2">
              Confirm new password
            </label>
            <input
              id="confirm-new-password"
              type={inputType}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="input"
              autoComplete="new-password"
              maxLength={PASSWORD_MAX_LENGTH}
              required
            />
          </div>

          <button
            type="button"
            onClick={() => setShowPasswords((v) => !v)}
            className="text-sm text-gray-400 hover:text-white flex items-center gap-1.5"
          >
            {showPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {showPasswords ? 'Hide passwords' : 'Show passwords'}
          </button>

          {error && (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          )}

          <div className="flex items-center justify-between gap-4">
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2 bg-purple-600/40 hover:bg-purple-500 text-white rounded-lg transition-colors flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              <span>{isSaving ? 'Changing…' : 'Change password'}</span>
            </button>
            <Link to="/forgot-password" className="text-sm text-gray-400 hover:text-white">
              Forgot your current password?
            </Link>
          </div>
        </form>
      )}
    </div>
  );
};

export default PasswordSecuritySection;
