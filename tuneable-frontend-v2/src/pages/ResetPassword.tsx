import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from '../utils/toast';
import { ArrowLeft, CheckCircle, Eye, EyeOff } from 'lucide-react';
import { authAPI } from '../lib/api';

const inputClass =
  'block w-full h-11 rounded-lg border border-white/10 bg-zinc-900/80 px-3.5 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition-colors focus:border-white/30 focus:ring-1 focus:ring-white/20';

const primaryBtnClass =
  'w-full h-11 inline-flex items-center justify-center rounded-lg bg-white px-4 text-sm font-semibold text-zinc-950 transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50';

const ResetPassword: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formData, setFormData] = useState({
    password: '',
    confirmPassword: '',
  });
  const [token, setToken] = useState<string | null>(null);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const tokenParam = searchParams.get('token');
    if (!tokenParam) {
      toast.error('Invalid reset link. Please request a new password reset.');
      navigate('/forgot-password');
    } else {
      setToken(tokenParam);
    }
  }, [searchParams, navigate]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.password || !formData.confirmPassword) {
      toast.error('Please fill in all fields');
      return;
    }

    if (formData.password.length < 6) {
      toast.error('Password must be at least 6 characters long');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (!token) {
      toast.error('Invalid reset token');
      return;
    }

    setIsLoading(true);

    try {
      await authAPI.confirmPasswordReset(token, formData.password);
      setSubmitted(true);
      toast.success('Password reset successfully!');
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || 'Failed to reset password';
      toast.error(errorMsg);

      if (error.response?.status === 400) {
        setTimeout(() => {
          navigate('/forgot-password');
        }, 2000);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-[400px] overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl">
        {submitted ? (
          <div className="px-5 py-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-zinc-900">
              <CheckCircle className="h-6 w-6 text-zinc-200" />
            </div>
            <h1 className="text-lg font-semibold tracking-tight text-zinc-100">Password updated</h1>
            <p className="mt-2 text-sm text-zinc-400">You can now sign in with your new password.</p>
            <Link to="/login" className={`${primaryBtnClass} mt-6`}>
              Go to sign in
            </Link>
          </div>
        ) : (
          <div className="px-5 py-6">
            <Link
              to="/login"
              className="mb-6 inline-flex items-center text-sm text-zinc-400 transition-colors hover:text-zinc-100"
            >
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back to sign in
            </Link>
            <h1 className="text-lg font-semibold tracking-tight text-zinc-100">Set new password</h1>
            <p className="mt-2 text-sm text-zinc-400">Enter a new password for your account.</p>
            <form onSubmit={handleSubmit} className="mt-5 space-y-3">
              <div>
                <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-zinc-400">
                  New password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={handleChange}
                    className={`${inputClass} pr-10`}
                    placeholder="At least 6 characters"
                    required
                    autoComplete="new-password"
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-3 flex items-center text-zinc-500 hover:text-zinc-300"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label htmlFor="confirmPassword" className="mb-1.5 block text-xs font-medium text-zinc-400">
                  Confirm password
                </label>
                <div className="relative">
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    className={`${inputClass} pr-10`}
                    placeholder="Confirm password"
                    required
                    autoComplete="new-password"
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute inset-y-0 right-3 flex items-center text-zinc-500 hover:text-zinc-300"
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={isLoading} className={`${primaryBtnClass} mt-1`}>
                {isLoading ? 'Resetting…' : 'Reset password'}
              </button>
            </form>
            <p className="mt-6 text-center text-sm text-zinc-500">
              Remember your password?{' '}
              <Link to="/login" className="font-medium text-zinc-100 underline-offset-2 hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ResetPassword;
