import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from '../utils/toast';
import { ArrowLeft, CheckCircle } from 'lucide-react';
import { authAPI } from '../lib/api';

const inputClass =
  'block w-full h-11 rounded-lg border border-white/10 bg-zinc-900/80 px-3.5 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition-colors focus:border-white/30 focus:ring-1 focus:ring-white/20';

const primaryBtnClass =
  'w-full h-11 inline-flex items-center justify-center rounded-lg bg-white px-4 text-sm font-semibold text-zinc-950 transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50';

const ghostBtnClass =
  'w-full h-11 inline-flex items-center justify-center rounded-lg border border-white/15 bg-zinc-900 px-4 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-800';

const ForgotPassword: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [email, setEmail] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email) {
      toast.error('Please enter your email address');
      return;
    }

    setIsLoading(true);

    try {
      await authAPI.requestPasswordReset(email);
      setSubmitted(true);
      toast.success('Password reset email sent! Check your inbox.');
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || 'Failed to send password reset email';
      toast.error(errorMsg);
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
            <h1 className="text-lg font-semibold tracking-tight text-zinc-100">Check your email</h1>
            <p className="mt-2 text-sm text-zinc-400">
              We sent a reset link to <span className="text-zinc-100">{email}</span>. It expires in 1 hour.
            </p>
            <div className="mt-6 space-y-2.5">
              <Link to="/login" className={primaryBtnClass}>
                Back to sign in
              </Link>
              <button
                type="button"
                onClick={() => {
                  setSubmitted(false);
                  setEmail('');
                }}
                className={ghostBtnClass}
              >
                Send another email
              </button>
            </div>
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
            <h1 className="text-lg font-semibold tracking-tight text-zinc-100">Reset password</h1>
            <p className="mt-2 text-sm text-zinc-400">
              Enter your email and we&apos;ll send you a reset link.
            </p>
            <form onSubmit={handleSubmit} className="mt-5 space-y-3">
              <div>
                <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-zinc-400">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                />
              </div>
              <button type="submit" disabled={isLoading} className={`${primaryBtnClass} mt-1`}>
                {isLoading ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
            <p className="mt-6 text-center text-sm text-zinc-500">
              Don&apos;t have an account?{' '}
              <Link to="/register" className="font-medium text-zinc-100 underline-offset-2 hover:underline">
                Sign up
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ForgotPassword;
