import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { toast } from '../utils/toast';
import { 
  Eye, 
  EyeOff,
  Gift,
  CheckCircle,
  XCircle,
  X,
  Mail,
  AlertTriangle
} from 'lucide-react';
import axios from 'axios';
import { Browser } from '@capacitor/browser';
import { authAPI } from '../lib/api';
import { buildOAuthStartUrl, isNativeApp } from '../utils/platform';
import {
  isAppleWebSignInConfigured,
  signInWithAppleWeb,
} from '../utils/appleSignIn';
import { buildRegisterUrl, buildLoginUrl, getPostAuthPath } from '../utils/authHelpers';

const socialBtnClass =
  'w-full h-11 inline-flex items-center justify-center gap-2.5 rounded-lg border border-white/15 bg-zinc-900 px-4 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-800 hover:border-white/25 focus:outline-none focus:ring-2 focus:ring-white/20 focus:ring-offset-2 focus:ring-offset-zinc-950 disabled:cursor-not-allowed disabled:opacity-50';

const primaryBtnClass =
  'w-full h-11 inline-flex items-center justify-center rounded-lg bg-white px-4 text-sm font-semibold text-zinc-950 transition-colors hover:bg-zinc-200 focus:outline-none focus:ring-2 focus:ring-white/30 focus:ring-offset-2 focus:ring-offset-zinc-950 disabled:cursor-not-allowed disabled:opacity-50';

const inputClass =
  'block w-full h-11 rounded-lg border border-white/10 bg-zinc-900/80 px-3.5 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition-colors focus:border-white/30 focus:ring-1 focus:ring-white/20 disabled:cursor-not-allowed disabled:opacity-50';

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path d="M16.365 1.43c0 1.14-.422 2.21-1.18 3.03-.792.86-2.1 1.52-3.216 1.43-.144-1.1.406-2.26 1.17-3.05.79-.83 2.16-1.43 3.226-1.41zM20.69 17.2c-.54 1.24-.79 1.79-1.48 2.89-.96 1.53-2.31 3.44-4 3.47-1.5.03-1.89-.98-3.94-.96-2.04.01-2.48 1-3.98.97-1.69-.04-2.98-1.74-3.94-3.27C1.7 17.4.5 12.7 2.4 9.53c.95-1.58 2.47-2.58 4.18-2.61 1.55-.03 3.02 1.05 3.94 1.05.91 0 2.62-1.3 4.42-1.11.75.03 2.86.3 4.21 2.27-3.61 1.98-3.03 7.14.54 8.07z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path d="M13.5 22v-8.16h2.74l.41-3.18H13.5V8.63c0-.92.25-1.55 1.58-1.55H16.8V4.23c-.28-.04-1.22-.12-2.32-.12-2.3 0-3.88 1.4-3.88 3.98v2.22H8v3.18h2.6V22h2.9z" />
    </svg>
  );
}

function SoundCloudIcon() {
  return (
    <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path d="M1.175 12.225c-.075 0-.125.05-.125.125v5.025c0 .075.05.125.125.125h.825c.075 0 .125-.05.125-.125v-5.025c0-.075-.05-.125-.125-.125h-.825zm2.15-1.8c-.1 0-.175.075-.175.175v6.8c0 .1.075.175.175.175h.825c.1 0 .175-.075.175-.175v-6.8c0-.1-.075-.175-.175-.175h-.825zm2.225-.225c-.1 0-.175.075-.175.175v7.025c0 .1.075.175.175.175h.825c.1 0 .175-.075.175-.175v-7.025c0-.1-.075-.175-.175-.175h-.825zm2.225.55c-.1 0-.175.075-.175.175v6.475c0 .1.075.175.175.175h.825c.1 0 .175-.075.175-.175v-6.475c0-.1-.075-.175-.175-.175h-.825zm2.15-2.325v8.8c0 .075.05.125.125.125h.975V8.35c.55-.375 1.225-.6 1.95-.6 1.975 0 3.575 1.6 3.575 3.575 0 .2-.025.4-.05.6.4-.175.85-.275 1.325-.275 1.8 0 3.25 1.45 3.25 3.25s-1.45 3.25-3.25 3.25H11.15c-.1 0-.175-.075-.175-.175V8.425c0-.1.075-.175.175-.175h.8c.1 0 .175.075.175.175z" />
    </svg>
  );
}

const AuthPage: React.FC = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [inviteCodeValid, setInviteCodeValid] = useState<boolean | null>(null);
  const [inviterUsername, setInviterUsername] = useState<string>('');
  const [isValidatingCode, setIsValidatingCode] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  
  // Account lockout state
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [accountLockedUntil, setAccountLockedUntil] = useState<Date | null>(null);
  const [countdownTick, setCountdownTick] = useState(0); // Force re-render for countdown
  
  // Login error message
  const [loginError, setLoginError] = useState<string>('');
  
  // Field-specific error messages
  const [fieldErrors, setFieldErrors] = useState({
    email: '',
    username: ''
  });
  
  // Refs for error fields
  const usernameInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    cellPhone: '',
    givenName: '',
    familyName: '',
    parentInviteCode: '',
  });

  const { login, register, handleOAuthCallback } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const appleConfigured = isAppleWebSignInConfigured();

  // Check if we're on the register page
  const isRegisterPage = location.pathname === '/register';
  const returnPathParam = new URLSearchParams(location.search).get('returnUrl');
  const registerLink = buildRegisterUrl(returnPathParam ? { returnPath: returnPathParam } : undefined);
  const loginLink = buildLoginUrl(returnPathParam ?? undefined);

  // Countdown timer for account lockout
  useEffect(() => {
    if (!accountLockedUntil || accountLockedUntil <= new Date()) {
      return;
    }

    const interval = setInterval(() => {
      const now = new Date();
      if (accountLockedUntil <= now) {
        // Lockout expired, reset state
        setAccountLockedUntil(null);
        setFailedAttempts(0);
        setCountdownTick(0);
        clearInterval(interval);
      } else {
        // Force re-render to update countdown display
        setCountdownTick(prev => prev + 1);
      }
    }, 1000); // Update every second

    return () => clearInterval(interval);
  }, [accountLockedUntil]);

  // Capture optional invite from URL (referral attribution) and handle OAuth errors
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const inviteParam = params.get('invite');

    if (isRegisterPage && inviteParam) {
      const code = inviteParam.toUpperCase().slice(0, 5);
      setFormData(prev => ({ ...prev, parentInviteCode: code }));
      if (code.length === 5) {
        validateInviteCode(code);
      }
    }

    // Handle OAuth errors from URL parameters
    const errorParam = params.get('error');
    const errorDetails = params.get('details');
    const errorReason = params.get('reason');
    const errorMessageParam = params.get('message');
    
    if (errorParam) {
      let errorMessage = 'Authentication failed. Please try again.';
      
      // Map OAuth error codes to user-friendly messages
      switch (errorParam) {
        case 'facebook_auth_failed':
          errorMessage = errorMessageParam
            ? decodeURIComponent(errorMessageParam)
            : 'Facebook authentication failed. Please try again or use email/password to sign in.';
          break;
        case 'google_auth_failed':
          errorMessage = 'Google authentication failed. Please try again or use email/password to sign in.';
          break;
        case 'soundcloud_auth_failed':
          if (errorReason === 'no_user') {
            errorMessage = 'SoundCloud account not found. Please sign up first or use email/password to sign in.';
          } else if (errorDetails) {
            errorMessage = `SoundCloud authentication failed: ${decodeURIComponent(errorDetails)}. Please try again.`;
          } else {
            errorMessage = 'SoundCloud authentication failed. Please try again or use email/password to sign in.';
          }
          break;
        case 'instagram_auth_failed':
          errorMessage = 'Instagram authentication failed. Please try again or use email/password to sign in.';
          break;
        case 'apple_auth_failed':
          errorMessage = errorMessageParam
            ? decodeURIComponent(errorMessageParam)
            : 'Apple authentication failed. Please try again or use email/password to sign in.';
          break;
        case 'oauth_state_mismatch':
          errorMessage = 'Security verification failed. Please try signing in again.';
          break;
        case 'oauth_session_missing':
          errorMessage = 'Session expired. Please try signing in again.';
          break;
        default:
          if (errorDetails) {
            errorMessage = `Authentication error: ${decodeURIComponent(errorDetails)}`;
          }
      }
      
      toast.error(errorMessage, {
        autoClose: 10000, // Show OAuth errors longer
        pauseOnHover: true,
      });
      
      // Clean up URL parameters after showing error
      const newSearch = new URLSearchParams(location.search);
      newSearch.delete('error');
      newSearch.delete('details');
      newSearch.delete('reason');
      newSearch.delete('message');
      const newUrl = location.pathname + (newSearch.toString() ? '?' + newSearch.toString() : '');
      window.history.replaceState({}, '', newUrl);
    }
  }, [location.search, isRegisterPage]);

  // Validate invite code against backend
  const validateInviteCode = async (code: string) => {
    if (!code || code.length !== 5) {
      setInviteCodeValid(false);
      setInviterUsername('');
      return;
    }

    setIsValidatingCode(true);
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
      const response = await axios.get(`${API_URL}/users/validate-invite/${code}`);
      
      if (response.data.valid) {
        setInviteCodeValid(true);
        setInviterUsername(response.data.inviterUsername || '');
        
        // Automatically show email form when invite code is validated
        setShowEmailForm(true);
      } else {
        setInviteCodeValid(false);
        setInviterUsername('');
      }
    } catch (error) {
      setInviteCodeValid(false);
      setInviterUsername('');
    } finally {
      setIsValidatingCode(false);
    }
  };

  const handleSocialAuth = async (provider: 'facebook' | 'google' | 'instagram' | 'soundcloud') => {
    // If a referral invite was provided but is invalid, block so attribution isn't wrong
    if (isRegisterPage && formData.parentInviteCode.length === 5 && inviteCodeValid === false) {
      toast.error('That invite code is invalid. Clear it or use a valid referral link.');
      return;
    }

    const oauthUrl = buildOAuthStartUrl(provider, {
      inviteCode: formData.parentInviteCode || undefined,
    });

    if (isNativeApp()) {
      await Browser.open({ url: oauthUrl });
    } else {
      window.location.href = oauthUrl;
    }
  };

  const handleAppleAuth = async () => {
    if (isRegisterPage && formData.parentInviteCode.length === 5 && inviteCodeValid === false) {
      toast.error('That invite code is invalid. Clear it or use a valid referral link.');
      return;
    }

    if (!appleConfigured) {
      toast.error(
        'Apple Sign In is not configured yet. Set VITE_APPLE_CLIENT_ID to your Apple Services ID.'
      );
      return;
    }

    if (isNativeApp()) {
      toast.info('Use Sign in with Apple in the Tuneable iOS app.');
      return;
    }

    setIsLoading(true);
    try {
      const credential = await signInWithAppleWeb();
      const response = await authAPI.appleSignIn({
        identityToken: credential.identityToken,
        invite: formData.parentInviteCode || undefined,
        email: credential.email,
        fullName: credential.fullName,
      });
      const user = await handleOAuthCallback(response.token);
      toast.success('Login successful!');
      navigate(getPostAuthPath(user, returnPathParam), { replace: true });
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'cancelled' in err && (err as { cancelled?: boolean }).cancelled) {
        return;
      }
      const message =
        axios.isAxiosError(err) && err.response?.data?.error
          ? String(err.response.data.error)
          : err instanceof Error
            ? err.message
            : 'Apple Sign In failed.';
      toast.error(message, { autoClose: 10000, pauseOnHover: true });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    navigate('/explore');
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    // Clear login error when user starts typing in email or password fields
    if (name === 'email' || name === 'password') {
      setLoginError('');
    }
    
    if (name === 'parentInviteCode') {
      const upperCode = value.toUpperCase();
      setFormData({
        ...formData,
        [name]: upperCode,
      });
      
      // Validate invite code if 5 characters
      if (upperCode.length === 5) {
        validateInviteCode(upperCode);
      } else {
        setInviteCodeValid(null);
        setInviterUsername('');
      }
    } else {
      setFormData({
        ...formData,
        [name]: value,
      });
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setLoginError(''); // Clear any previous errors

    try {
      const newUser = await login(formData.email, formData.password);
      // Reset failed attempts on successful login
      setFailedAttempts(0);
      setAccountLockedUntil(null);
      setLoginError(''); // Clear error on success
      toast.success('Login successful!');
      navigate(getPostAuthPath(newUser, returnPathParam));
    } catch (error: any) {
      // Log full error for debugging
      console.error('Login error:', error);
      console.error('Error response:', error.response);
      console.error('Error message:', error.response?.data?.error || error.message);
      
      // Handle different error types with user-friendly messages
      let errorMessage = 'Login failed. Please try again.';
      
      if (!error.response) {
        // Network error - no response from server (show toast, no inline message)
        errorMessage = 'Unable to connect to server. Please check your internet connection and try again.';
        toast.error(errorMessage, {
          autoClose: 7000,
          pauseOnHover: true,
        });
        setLoginError(''); // Clear inline error for network issues
      } else if (error.response.status === 423) {
        // Account locked - inline message will be shown
        const lockedUntil = error.response?.data?.lockedUntil;
        const failedAttemptsCount = error.response?.data?.failedAttempts || 6;
        
        if (lockedUntil) {
          setAccountLockedUntil(new Date(lockedUntil));
          setFailedAttempts(failedAttemptsCount);
        }
        setLoginError(''); // Clear inline error, account locked message is shown separately
      } else if (error.response.status === 401) {
        // Authentication failed - track attempts, show error message
        const failedAttemptsCount = error.response?.data?.failedAttempts || 0;
        setFailedAttempts(failedAttemptsCount);
        // Display the error message from server
        const serverErrorMessage = error.response?.data?.error || 'Invalid email, password or username';
        setLoginError(serverErrorMessage);
      } else if (error.response.status === 400) {
        // Validation error
        const validationError = error.response?.data?.error || error.response?.data?.details?.[0]?.msg;
        errorMessage = validationError || 'Please check your username/email and password format.';
        toast.error(errorMessage, {
          autoClose: 7000,
          pauseOnHover: true,
        });
      } else if (error.response.status === 403) {
        // Account locked or inactive
        errorMessage = error.response?.data?.error || 'Your account is currently inactive. Please contact support.';
        toast.error(errorMessage, {
          autoClose: 7000,
          pauseOnHover: true,
        });
      } else if (error.response.status >= 500) {
        // Server error
        errorMessage = 'Server error. Please try again in a moment. If the problem persists, contact support.';
        toast.error(errorMessage, {
          autoClose: 7000,
          pauseOnHover: true,
        });
      } else {
        // Other errors - use message from server if available
        errorMessage = error.response?.data?.error || error.message || errorMessage;
        toast.error(errorMessage, {
          autoClose: 7000,
          pauseOnHover: true,
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    // Optional invite: if user typed one, it must be valid
    if (formData.parentInviteCode.length === 5 && inviteCodeValid === false) {
      toast.error('That invite code is invalid. Clear it or use a valid referral link.');
      return;
    }
    if (formData.parentInviteCode.length > 0 && formData.parentInviteCode.length < 5) {
      toast.error('Invite codes are 5 characters. Clear the field to continue without one.');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (formData.password.length < 6) {
      toast.error('Password must be at least 6 characters long');
      return;
    }

    setIsLoading(true);

    try {
      const { confirmPassword, ...registerData } = formData;
      // Omit empty invite so backend treats signup as open
      if (!registerData.parentInviteCode) {
        delete (registerData as { parentInviteCode?: string }).parentInviteCode;
      }
      const newUser = await register(registerData);
      toast.success('Registration successful!');
      navigate(getPostAuthPath(newUser, returnPathParam));
    } catch (error: any) {
      console.error('Error registering user:', error);
      const errorResponse = error.response?.data || {};
      const errorMessage = errorResponse.error || error.message || 'Registration failed';
      const errorField = errorResponse.field; // 'email' or 'username'
      
      console.log('Error response:', { errorMessage, errorField, errorResponse });
      
      // Clear previous errors
      setFieldErrors({ email: '', username: '' });
      
      // Set field-specific errors - check field first, then message
      if (errorField === 'email') {
        setFieldErrors(prev => ({ 
          ...prev, 
          email: 'This email is already registered.' 
        }));
        // Scroll to and focus email field
        setTimeout(() => {
          emailInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          emailInputRef.current?.focus();
        }, 100);
      } else if (errorField === 'username') {
        setFieldErrors(prev => ({ 
          ...prev, 
          username: 'This username is already taken. Please choose another. You can change your display name after signing up.' 
        }));
        // Scroll to and focus username field
        setTimeout(() => {
          usernameInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          usernameInputRef.current?.focus();
        }, 100);
      } else if (errorMessage.toLowerCase().includes('email')) {
        setFieldErrors(prev => ({ 
          ...prev, 
          email: 'This email is already registered.' 
        }));
        // Scroll to and focus email field
        setTimeout(() => {
          emailInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          emailInputRef.current?.focus();
        }, 100);
      } else if (errorMessage.toLowerCase().includes('username')) {
        setFieldErrors(prev => ({ 
          ...prev, 
          username: 'This username is already taken. Please choose another. You can change your display name after signing up.' 
        }));
        // Scroll to and focus username field
        setTimeout(() => {
          usernameInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          usernameInputRef.current?.focus();
        }, 100);
      } else {
        // Fallback to toast for other errors
        toast.error(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const isLocked = accountLockedUntil !== null && accountLockedUntil > new Date();

  const renderSocialButtons = () => (
    <div className="flex w-full flex-col gap-2.5">
      <button onClick={() => handleSocialAuth('google')} type="button" className={socialBtnClass}>
        <GoogleIcon />
        Continue with Google
      </button>
      {appleConfigured && (
        <button
          onClick={() => void handleAppleAuth()}
          type="button"
          disabled={isLoading}
          className={socialBtnClass}
        >
          <AppleIcon />
          Continue with Apple
        </button>
      )}
      <button onClick={() => handleSocialAuth('facebook')} type="button" className={socialBtnClass}>
        <FacebookIcon />
        Continue with Facebook
      </button>
      <button onClick={() => handleSocialAuth('soundcloud')} type="button" className={socialBtnClass}>
        <SoundCloudIcon />
        Continue with SoundCloud
      </button>
    </div>
  );

  const renderLoginForm = () => (
    <div className="w-full">
      {renderSocialButtons()}

      <div className="flex w-full items-center gap-3 py-6 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
        <div className="h-px w-full bg-white/10" />
        or
        <div className="h-px w-full bg-white/10" />
      </div>

      {isLocked && (
        <div className="mb-4 rounded-lg border border-white/10 bg-zinc-900 p-3">
          <div className="flex items-start gap-2">
            <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-zinc-400" />
            <div className="flex-1">
              <p className="text-sm font-medium text-zinc-100">Account temporarily locked</p>
              <p className="mt-1 text-xs text-zinc-400">
                Too many failed login attempts. Please try again after {(() => {
                  const now = new Date();
                  const minutesRemaining = Math.ceil((accountLockedUntil!.getTime() - now.getTime()) / 60000);
                  void countdownTick;
                  return minutesRemaining > 0 ? `${minutesRemaining} minute${minutesRemaining > 1 ? 's' : ''}` : 'less than a minute';
                })()}.
              </p>
            </div>
          </div>
        </div>
      )}

      {failedAttempts > 0 && failedAttempts < 6 && !accountLockedUntil && (
        <div className="mb-4 rounded-lg border border-white/10 bg-zinc-900 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-zinc-400" />
            <div className="flex-1">
              <p className="text-sm font-medium text-zinc-100">Sign-in failed</p>
              <p className="mt-1 text-xs text-zinc-400">
                {6 - failedAttempts} attempt{6 - failedAttempts > 1 ? 's' : ''} remaining before lockout.
              </p>
            </div>
          </div>
        </div>
      )}

      {loginError && !accountLockedUntil && (
        <div className="mb-4 rounded-lg border border-white/10 bg-zinc-900 p-3">
          <div className="flex items-start gap-2">
            <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-zinc-400" />
            <div className="flex-1">
              <p className="text-sm font-medium text-zinc-100">{loginError}</p>
            </div>
          </div>
        </div>
      )}

      <form className="w-full space-y-3" onSubmit={handleLogin}>
        <div>
          <label htmlFor="loginIdentifier" className="mb-1.5 block text-xs font-medium text-zinc-400">
            Email or username
          </label>
          <input
            id="loginIdentifier"
            name="email"
            type="text"
            autoComplete="username"
            required
            disabled={isLocked}
            className={inputClass}
            placeholder="you@example.com"
            value={formData.email}
            onChange={handleChange}
          />
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="password" className="text-xs font-medium text-zinc-400">
              Password
            </label>
            <Link to="/forgot-password" className="text-xs text-zinc-500 transition-colors hover:text-zinc-200">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              disabled={isLocked}
              className={`${inputClass} pr-10`}
              placeholder="Password"
              value={formData.password}
              onChange={handleChange}
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
        <button
          type="submit"
          disabled={isLoading || isLocked}
          className={`${primaryBtnClass} mt-1`}
        >
          {isLoading ? 'Signing in…' : (isLocked ? 'Account locked' : 'Continue')}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-zinc-500">
        Don&apos;t have an account?{' '}
        <Link to={registerLink} className="font-medium text-zinc-100 underline-offset-2 hover:underline">
          Sign up
        </Link>
      </p>
    </div>
  );

  const renderRegisterForm = () => (
    <div className="w-full">
      <div className="flex w-full flex-col gap-2.5">
        {renderSocialButtons()}
        <button
          onClick={() => setShowEmailForm(!showEmailForm)}
          type="button"
          className={`${socialBtnClass} ${showEmailForm ? 'border-white/25 bg-zinc-800' : ''}`}
          aria-expanded={showEmailForm}
        >
          <Mail className="h-[18px] w-[18px]" />
          Continue with email
        </button>
      </div>

      {(formData.parentInviteCode || inviterUsername) && (
        <div className="mt-5">
          {inviterUsername && inviteCodeValid && (
            <div className="mb-2 flex items-center text-sm text-zinc-300">
              <Gift className="mr-1.5 h-4 w-4 text-zinc-400" />
              <span>Invited by <strong className="font-medium text-zinc-100">@{inviterUsername}</strong></span>
            </div>
          )}
          <div className="relative w-full">
            <input
              id="parentInviteCode"
              name="parentInviteCode"
              type="text"
              maxLength={5}
              className={`${inputClass} pr-10 ${
                inviteCodeValid === true
                  ? 'border-white/40'
                  : inviteCodeValid === false
                    ? 'border-white/40'
                    : ''
              }`}
              placeholder="Invite code (optional)"
              value={formData.parentInviteCode}
              onChange={handleChange}
            />
            {isValidatingCode ? (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-200" />
              </div>
            ) : inviteCodeValid === true ? (
              <CheckCircle className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-300" />
            ) : inviteCodeValid === false ? (
              <XCircle className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            ) : null}
          </div>
          {inviteCodeValid === false && formData.parentInviteCode.length === 5 && (
            <p className="mt-1 text-xs text-zinc-400">Invalid invite code</p>
          )}
        </div>
      )}

      {showEmailForm && (
        <form className="mt-5 w-full space-y-3" onSubmit={handleRegister}>
          <div>
            <label htmlFor="username" className="mb-1.5 block text-xs font-medium text-zinc-400">
              Username
            </label>
            <input
              ref={usernameInputRef}
              id="username"
              name="username"
              type="text"
              required
              className={`${inputClass} ${fieldErrors.username ? 'border-white/40' : ''}`}
              placeholder="Choose a username"
              value={formData.username}
              onChange={(e) => {
                handleChange(e);
                if (fieldErrors.username) {
                  setFieldErrors(prev => ({ ...prev, username: '' }));
                }
              }}
            />
            {fieldErrors.username && (
              <p className="mt-1 text-xs text-zinc-400">{fieldErrors.username}</p>
            )}
          </div>

          <div>
            <label htmlFor="registerEmail" className="mb-1.5 block text-xs font-medium text-zinc-400">
              Email
            </label>
            <input
              ref={emailInputRef}
              id="registerEmail"
              name="email"
              type="email"
              autoComplete="email"
              required
              className={`${inputClass} ${fieldErrors.email ? 'border-white/40' : ''}`}
              placeholder="you@example.com"
              value={formData.email}
              onChange={(e) => {
                handleChange(e);
                if (fieldErrors.email) {
                  setFieldErrors(prev => ({ ...prev, email: '' }));
                }
              }}
            />
            {fieldErrors.email && (
              <p className="mt-1 text-xs text-zinc-400">{fieldErrors.email}</p>
            )}
          </div>

          <div>
            <label htmlFor="registerPassword" className="mb-1.5 block text-xs font-medium text-zinc-400">
              Password
            </label>
            <div className="relative">
              <input
                id="registerPassword"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                className={`${inputClass} pr-10`}
                placeholder="At least 6 characters"
                value={formData.password}
                onChange={handleChange}
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
                autoComplete="new-password"
                required
                className={`${inputClass} pr-10`}
                placeholder="Confirm password"
                value={formData.confirmPassword}
                onChange={handleChange}
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
            {isLoading ? 'Creating account…' : 'Create account'}
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-zinc-500">
        Already have an account?{' '}
        <Link to={loginLink} className="font-medium text-zinc-100 underline-offset-2 hover:underline">
          Sign in
        </Link>
      </p>
      <p className="mt-3 text-center text-sm text-zinc-500">
        Are you an artist?{' '}
        <button
          type="button"
          onClick={() => {
            const code = formData.parentInviteCode;
            navigate(code
              ? `/creator/register?invite=${encodeURIComponent(code)}`
              : '/creator/register');
          }}
          className="font-medium text-zinc-100 underline-offset-2 hover:underline"
        >
          Sign up as a creator
        </button>
      </p>
    </div>
  );

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      style={{ zIndex: 10000 }}
      onClick={handleClose}
    >
      <div
        className="relative w-full max-w-[400px] max-h-[90vh] overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-zinc-950 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <img
              src="/Tuneable-Logo-180x180.svg"
              alt=""
              className="h-7 w-7"
            />
            <h2 className="text-base font-semibold tracking-tight text-zinc-100">
              {isRegisterPage ? 'Create account' : 'Sign in'}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[calc(90vh-64px)] overflow-y-auto px-5 py-5">
          <p className="mb-5 text-sm text-zinc-400">
            {isRegisterPage ? 'Join Tuneable to start sharing music.' : 'Welcome back.'}
          </p>
          {isRegisterPage ? renderRegisterForm() : renderLoginForm()}
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
