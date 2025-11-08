import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { emailAPI } from '../lib/api';
import { toast } from 'react-toastify';

type VerificationStatus = 'idle' | 'verifying' | 'success' | 'error';

const VerifyEmail: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<VerificationStatus>('idle');
  const [message, setMessage] = useState<string>('');
  const token = searchParams.get('token');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Verification token missing. Please request a new verification email from your profile.');
      return;
    }

    const verifyEmail = async () => {
      try {
        setStatus('verifying');
        await emailAPI.confirmVerification(token);
        setStatus('success');
        setMessage('Your email has been verified successfully. You can now continue using Tuneable.');
        toast.success('Email verified!');
      } catch (error: any) {
        console.error('Email verification failed:', error);
        setStatus('error');
        const apiMessage = error?.response?.data?.error || error?.response?.data?.message;
        setMessage(apiMessage || 'Verification failed. Your link may have expired. Please request a new verification email.');
      }
    };

    void verifyEmail();
  }, [token]);

  const handleResend = async () => {
    try {
      await emailAPI.resendVerification();
      toast.success('Verification email resent! Please check your inbox.');
    } catch (error: any) {
      console.error('Failed to resend verification email:', error);
      const apiMessage = error?.response?.data?.error || error?.response?.data?.message;
      toast.error(apiMessage || 'Could not resend verification email. Please log in and try again.');
    }
  };

  const handleGoToLogin = () => {
    navigate('/login');
  };

  const handleGoToDashboard = () => {
    navigate('/dashboard');
  };

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-6rem)] px-4">
      <div className="max-w-lg w-full bg-gray-900/80 border border-purple-500/20 rounded-2xl shadow-xl p-8 text-center space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Email Verification</h1>
          <p className="text-gray-300">
            {status === 'verifying' && 'We are confirming your email address. This should only take a second.'}
            {status !== 'verifying' && message}
          </p>
        </div>

        {status === 'verifying' && (
          <div className="flex justify-center">
            <div className="w-12 h-12 border-4 border-purple-500/40 border-t-purple-400 rounded-full animate-spin" />
          </div>
        )}

        {status === 'success' && (
          <div className="space-y-3">
            <button
              onClick={handleGoToDashboard}
              className="w-full px-4 py-3 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-semibold transition-colors"
            >
              Go to Dashboard
            </button>
            <button
              onClick={handleGoToLogin}
              className="w-full px-4 py-3 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 font-semibold transition-colors"
            >
              Back to Login
            </button>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-3">
            <button
              onClick={handleResend}
              className="w-full px-4 py-3 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-semibold transition-colors"
            >
              Resend Verification Email
            </button>
            <button
              onClick={handleGoToLogin}
              className="w-full px-4 py-3 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 font-semibold transition-colors"
            >
              Back to Login
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default VerifyEmail;

