import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-toastify';
import { 
  Eye, 
  EyeOff,
  Gift,
  CheckCircle,
  XCircle,
  X,
  Mail
} from 'lucide-react';
import axios from 'axios';
import { userAPI } from '../lib/api';

const AuthPage: React.FC = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [inviteCodeValid, setInviteCodeValid] = useState<boolean | null>(null);
  const [inviterUsername, setInviterUsername] = useState<string>('');
  const [isValidatingCode, setIsValidatingCode] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [showInviteCodeError, setShowInviteCodeError] = useState(false);
  
  // Field-specific error messages
  const [fieldErrors, setFieldErrors] = useState({
    email: '',
    username: ''
  });
  
  // Refs for error fields
  const usernameInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  
  // Location detection state
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [locationDetectionStatus, setLocationDetectionStatus] = useState<'idle' | 'success' | 'failed'>('idle');
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    cellPhone: '',
    givenName: '',
    familyName: '',
    parentInviteCode: '',
    homeLocation: {
      city: '',
      region: '',
      country: '',
    },
    secondaryLocation: null as {
      city: string;
      region: string;
      country: string;
    } | null,
  });

  const { login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Check if we're on the register page
  const isRegisterPage = location.pathname === '/register';

  // Check if we're coming from a redirect (like after OAuth)
  const isFromOAuth = location.search.includes('error=') || location.search.includes('success=');

  // Capture invite code from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const inviteParam = params.get('invite');
    
    if (inviteParam && isRegisterPage) {
      setFormData(prev => ({ ...prev, parentInviteCode: inviteParam.toUpperCase() }));
      validateInviteCode(inviteParam.toUpperCase());
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
        
        // Trigger location detection after successful invite code validation
        detectUserLocation();
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

  // Separate location detection function
  const detectUserLocation = async () => {
    setIsDetectingLocation(true);
    setLocationDetectionStatus('idle');
    
    try {
      const response = await userAPI.detectLocation();
      if (response.success && response.location) {
        setFormData(prev => ({
          ...prev,
          homeLocation: {
            ...prev.homeLocation,
            country: response.location.country,
            city: prev.homeLocation.city || response.location.city,
            region: prev.homeLocation.region || response.location.region,
          }
        }));
        
        setLocationDetectionStatus('success');
        toast.success(`Auto-detected location: ${response.location.country}`);
      } else {
        setLocationDetectionStatus('failed');
      }
    } catch (error) {
      console.log('Location detection failed:', error);
      setLocationDetectionStatus('failed');
    } finally {
      setIsDetectingLocation(false);
    }
  };

  // Trigger visual error on invite code input
  const triggerInviteCodeError = () => {
    setShowInviteCodeError(true);
    // Focus on the invite code input and scroll into view
    setTimeout(() => {
      const inviteInput = document.getElementById('parentInviteCode');
      if (inviteInput) {
        inviteInput.focus();
        inviteInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
    // Reset error state after animation
    setTimeout(() => setShowInviteCodeError(false), 3000);
  };

  const handleSocialAuth = (provider: 'facebook' | 'google' | 'instagram' | 'soundcloud') => {
    // Check if invite code is required for registration
    if (isRegisterPage && !inviteCodeValid) {
      triggerInviteCodeError();
      return;
    }

    // VITE_API_URL already includes /api, so don't add it again
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
    
    // Pass invite code as state parameter for OAuth
    const inviteParam = formData.parentInviteCode ? `?invite=${formData.parentInviteCode}` : '';
    
    if (provider === 'facebook') {
      window.location.href = `${baseUrl}/auth/facebook${inviteParam}`;
    } else if (provider === 'google') {
      window.location.href = `${baseUrl}/auth/google${inviteParam}`;
    } else if (provider === 'instagram') {
      window.location.href = `${baseUrl}/auth/instagram${inviteParam}`;
    } else if (provider === 'soundcloud') {
      window.location.href = `${baseUrl}/auth/soundcloud${inviteParam}`;
    }
  };

  const handleClose = () => {
    navigate('/');
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    if (name === 'city' || name === 'region' || name === 'country') {
      setFormData({
        ...formData,
        homeLocation: {
          ...formData.homeLocation,
          [name]: value,
        },
      });
    } else if (name === 'parentInviteCode') {
      const upperCode = value.toUpperCase();
      setFormData({
        ...formData,
        [name]: upperCode,
      });
      
      // Reset error state when user starts typing
      if (showInviteCodeError) {
        setShowInviteCodeError(false);
      }
      
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

    try {
      await login(formData.email, formData.password);
      toast.success('Login successful!');
      navigate('/dashboard');
    } catch (error: any) {
      // Log full error for debugging
      console.error('Login error:', error);
      console.error('Error response:', error.response);
      console.error('Error message:', error.response?.data?.error || error.message);
      
      const errorMessage = error.response?.data?.error || error.message || 'Login failed';
      toast.error(errorMessage, {
        autoClose: 7000, // Show errors for 7 seconds
        pauseOnHover: true,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Check invite code is valid
    if (!inviteCodeValid) {
      toast.error('Please enter a valid invite code to sign up');
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
      await register(registerData);
      toast.success('Registration successful!');
      navigate('/dashboard');
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

  const renderLoginForm = () => (
    <div className="">
      <div className="text-center pb-6">
        <p className="text-2xl font-semibold leading-5 text-slate-900">
          Login to your account
        </p>
      </div>

      <div className="flex items-center justify-center flex-col">
        <button onClick={() => handleSocialAuth('google')} type="button" className="py-2 px-4 w-auto max-w-md flex justify-center items-center bg-white hover:bg-gray-50 focus:ring-gray-500 focus:ring-offset-gray-200 text-gray-700 border border-gray-300 transition ease-in duration-200 text-center text-base font-semibold shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 rounded-lg">
          <svg width="20" height="20" fill="currentColor" className="mr-2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Sign in with Google
        </button>
        <br></br>
        <button onClick={() => handleSocialAuth('facebook')} type="button" className="py-2 px-4 w-auto max-w-md flex justify-center items-center bg-blue-600 hover:bg-blue-700 focus:ring-blue-500 focus:ring-offset-blue-200 text-white transition ease-in duration-200 text-center text-base font-semibold shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 rounded-lg">
          <svg width="20" height="20" fill="currentColor" className="mr-2" viewBox="0 0 1792 1792" xmlns="http://www.w3.org/2000/svg">
            <path d="M1343 12v264h-157q-86 0-116 36t-30 108v189h293l-39 296h-254v759h-306v-759h-255v-296h255v-218q0-186 104-288.5t277-102.5q147 0 228 12z"></path>
          </svg>
          Sign in with Facebook
        </button>
        <br></br>
        <button onClick={() => handleSocialAuth('soundcloud')} type="button" className="py-2 px-4 w-auto max-w-md flex justify-center items-center bg-[#FF5500] hover:bg-[#FF4400] focus:ring-orange-500 focus:ring-offset-orange-200 text-white transition ease-in duration-200 text-center text-base font-semibold shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 rounded-lg">
          <svg width="20" height="20" fill="currentColor" className="mr-2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.568 17.548c-.188.363-.578.594-1.01.594-.062 0-.125-.006-.188-.02l-7.423-1.36c-.51-.094-.868-.518-.868-1.04V7.298c0-.394.216-.76.568-.95.35-.19.78-.179 1.113.04l6.774 4.18c.356.22.577.615.577 1.037v5.044c0 .387-.216.748-.565.94zm-1.673-6.25l-5.46-3.37v6.74l5.46-1.002v-2.368z"/>
          </svg>
          Sign in with SoundCloud
        </button>
      </div>

      <div className="flex w-full items-center gap-2 py-8 text-sm text-slate-600">
        <div className="h-px w-full bg-slate-200"></div>
        OR
        <div className="h-px w-full bg-slate-200"></div>
      </div>

      <form className="w-full" onSubmit={handleLogin}>
        <label htmlFor="email" className="sr-only">Email address</label>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          className="block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm outline-none text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-black focus:ring-offset-1"
          placeholder="Email Address"
          value={formData.email}
          onChange={handleChange}
        />
        <label htmlFor="password" className="sr-only">Password</label>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-2 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm outline-none text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-black focus:ring-offset-1"
          placeholder="Password"
          value={formData.password}
          onChange={handleChange}
        />
              <div className="mt-7 p-4 flex items-center justify-center flex-col gap-2">
        <button
          type="submit"
          disabled={isLoading}
          className="py-2 px-4 w-auto max-w-md flex justify-center items-center bg-gray-600 hover:bg-blue-700 focus:ring-blue-500 focus:ring-offset-blue-200 text-white transition ease-in duration-200 text-center text-base font-semibold shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 rounded-lg"
        >
          {isLoading ? 'Loading...' : 'Continue'}
        </button>
        </div>
      </form>
      <p className="mb-3 mt-2 text-sm text-gray-500 text-center">
          <Link to="/forgot-password" className="text-blue-800 hover:text-blue-600">
            Reset your password?
          </Link>
        </p>
      <div className="mt-2 text-center text-sm text-slate-600">
        Don't have an account?{' '}
        <Link to="/register" className="font-medium underline">
          Sign up
        </Link>
      </div>
    </div>
  );

  const renderRegisterForm = () => (
    <div className="">
      <div className="text-center p-4">
      
        <p className="text-sm leading-4 text-slate-600">
          Join Tuneable To Start Sharing Music
        </p>
      </div>

      <div className="flex flex-col p-4 flex items-center justify-center gap-3 items-center">
        <button 
          onClick={() => {
            if (!inviteCodeValid) {
              triggerInviteCodeError();
              return;
            }
            setShowEmailForm(!showEmailForm);
          }} 
          type="button" 
          className="py-2 px-4 w-auto max-w-md flex justify-center items-center bg-gray-600 hover:bg-gray-700 focus:ring-gray-500 focus:ring-offset-gray-200 text-white transition ease-in duration-200 text-center text-base font-semibold shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 rounded-lg"
        >
          <Mail className="w-5 h-5 mr-2" />
          Sign up with Email
        </button>
        
        <button onClick={() => handleSocialAuth('google')} type="button" className="py-2 px-4 w-auto max-w-md flex justify-center items-center bg-white hover:bg-gray-50 focus:ring-gray-500 focus:ring-offset-gray-200 text-gray-700 border border-gray-300 transition ease-in duration-200 text-center text-base font-semibold shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 rounded-lg">
          <svg width="20" height="20" fill="currentColor" className="mr-2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Sign up with Google
        </button>
        
        <button onClick={() => handleSocialAuth('facebook')} type="button" className="py-2 px-4 w-auto max-w-md flex justify-center items-center bg-blue-600 hover:bg-blue-700 focus:ring-blue-500 focus:ring-offset-blue-200 text-white transition ease-in duration-200 text-center text-base font-semibold shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 rounded-lg">
          <svg width="20" height="20" fill="currentColor" className="mr-2" viewBox="0 0 1792 1792" xmlns="http://www.w3.org/2000/svg">
            <path d="M1343 12v264h-157q-86 0-116 36t-30 108v189h293l-39 296h-254v759h-306v-759h-255v-296h255v-218q0-186 104-288.5t277-102.5q147 0 228 12z"></path>
          </svg>
          Sign up with Facebook
        </button>
        
        <button onClick={() => handleSocialAuth('soundcloud')} type="button" className="py-2 px-4 w-auto max-w-md flex justify-center items-center bg-[#FF5500] hover:bg-[#FF4400] focus:ring-orange-500 focus:ring-offset-orange-200 text-white transition ease-in duration-200 text-center text-base font-semibold shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 rounded-lg">
          <svg width="20" height="20" fill="currentColor" className="mr-2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.568 17.548c-.188.363-.578.594-1.01.594-.062 0-.125-.006-.188-.02l-7.423-1.36c-.51-.094-.868-.518-.868-1.04V7.298c0-.394.216-.76.568-.95.35-.19.78-.179 1.113.04l6.774 4.18c.356.22.577.615.577 1.037v5.044c0 .387-.216.748-.565.94zm-1.673-6.25l-5.46-3.37v6.74l5.46-1.002v-2.368z"/>
          </svg>
          Sign up with SoundCloud
        </button>
      </div>

      {/* Invite Code Field */}
      <div className="flex flex-col flex items-center justify-center px-6 pb-4">
        <div className="relative w-full">
          <input
            id="parentInviteCode"
            name="parentInviteCode"
            type="text"
            required
            maxLength={5}
            className={`block w-full rounded-lg border-2 px-3 py-2 pr-10 shadow-sm outline-none text-gray-900 placeholder:text-gray-400 transition-all duration-300 ${
              showInviteCodeError
                ? 'border-red-500 focus:border-red-500 focus:ring-0 shadow-[0_0_20px_rgba(239,68,68,0.6)]'
                : inviteCodeValid === true
                ? 'border-green-500 focus:ring-green-500 focus:ring-offset-1'
                : inviteCodeValid === false
                ? 'border-red-500 focus:ring-red-500 focus:ring-offset-1'
                : 'border-gray-300 focus:ring-black focus:ring-offset-1'
            }`}
            placeholder="Invite Code (Required)"
            value={formData.parentInviteCode}
            onChange={handleChange}
          />
          {isValidatingCode ? (
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
              <div className="animate-spin h-5 w-5 border-2 border-gray-300 border-t-purple-600 rounded-full"></div>
            </div>
          ) : inviteCodeValid === true ? (
            <CheckCircle className="absolute right-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-green-500" />
          ) : inviteCodeValid === false ? (
            <XCircle className="absolute right-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-red-500" />
          ) : null}
        </div>
        {inviterUsername && inviteCodeValid && (
          <div className="flex items-center mt-2 text-sm text-green-600">
            <Gift className="h-4 w-4 mr-1" />
            <span>Invited by <strong>@{inviterUsername}</strong></span>
          </div>
        )}
        {inviteCodeValid === false && formData.parentInviteCode.length === 5 && (
          <p className="text-xs text-red-500 mt-1">Invalid invite code</p>
        )}
        <p className={`text-xs mt-1 text-center transition-all duration-300 ${
          showInviteCodeError
            ? 'text-green-500 drop-shadow-[0_0_8px_rgba(34,197,94,0.8)]'
            : 'text-gray-500'
        }`}>
          Don't have a code? <Link 
            to="/request-invite" 
            className={`hover:underline transition-all duration-300 ${
              showInviteCodeError
                ? 'text-green-400 drop-shadow-[0_0_10px_rgba(34,197,94,1)] font-semibold'
                : 'text-purple-600'
            }`}
          >
            Request an invite
          </Link>
        </p>
      </div>

      {/* Conditionally show OR divider and email form */}
      {showEmailForm && (
        <>
          

          <form className="w-full space-y-4" onSubmit={handleRegister}>
        <div className="flex flex-col flex items-center justify-center">
          {/* <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
            Username
          </label> */}
          <input
            ref={usernameInputRef}
            id="username"
            name="username"
            type="text"
            required
            className={`block w-full rounded-lg border px-3 py-2 shadow-sm outline-none text-gray-900 placeholder:text-gray-400 focus:ring-2 transition-all ${
              fieldErrors.username
                ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                : 'border-gray-300 focus:ring-black focus:ring-offset-1'
            }`}
            placeholder="Choose a username"
            value={formData.username}
            onChange={(e) => {
              handleChange(e);
              // Clear error when user starts typing
              if (fieldErrors.username) {
                setFieldErrors(prev => ({ ...prev, username: '' }));
              }
            }}
          />
          {fieldErrors.username && (
            <p className="text-xs text-red-500 mt-1 w-full text-left">{fieldErrors.username}</p>
          )}
        </div>

        <div className="flex flex-col flex items-center justify-center">
          {/* <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
            Email Address
          </label> */}
          <input
            ref={emailInputRef}
            name="email"
            type="email"
            autoComplete="email"
            required
            className={`block w-full rounded-lg border px-3 py-2 shadow-sm outline-none text-gray-900 placeholder:text-gray-400 focus:ring-2 transition-all ${
              fieldErrors.email
                ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                : 'border-gray-300 focus:ring-black focus:ring-offset-1'
            }`}
            placeholder="Email Address"
            value={formData.email}
            onChange={(e) => {
              handleChange(e);
              // Clear error when user starts typing
              if (fieldErrors.email) {
                setFieldErrors(prev => ({ ...prev, email: '' }));
              }
            }}
          />
          {fieldErrors.email && (
            <p className="text-xs text-red-500 mt-1 w-full text-left">{fieldErrors.email}</p>
          )}
        </div>

        <div className="flex flex-col flex items-center justify-center">       
            <input
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 shadow-sm outline-none text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-black focus:ring-offset-1"
              placeholder="Password"
              value={formData.password}
              onChange={handleChange}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="right-3 mt-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
        </div>
        <div className="flex flex-col flex items-center justify-center">
            <input
              name="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 shadow-sm outline-none text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-black focus:ring-offset-1"
              placeholder="Confirm Password"
              value={formData.confirmPassword}
              onChange={handleChange}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="right-3 top-1/2 mt-2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
        </div>

        {/* Location Fields */}
        <div className="flex flex-col flex items-center justify-center">
          <h3 className="text-sm font-medium text-gray-700 mb-2">
            Home Location (Optional)
            {locationDetectionStatus === 'success' && (
              <span className="ml-2 text-xs text-green-600">
                ✓ Auto-detected
              </span>
            )}
          </h3>
          
          {/* Location detection status */}
          {isDetectingLocation && (
            <div className="flex items-center mb-2 text-xs text-blue-600">
              <div className="animate-spin h-4 w-4 border-2 border-blue-300 border-t-blue-600 rounded-full mr-2"></div>
              <span>Detecting your location...</span>
            </div>
          )}
          
          {locationDetectionStatus === 'failed' && (
            <div className="flex items-center mb-2 text-xs text-orange-600">
              <XCircle className="h-4 w-4 mr-1" />
              <span>Could not auto-detect location</span>
            </div>
          )}
          
          {locationDetectionStatus === 'success' && (
            <div className="flex items-center mb-2 text-xs text-green-600">
              <CheckCircle className="h-4 w-4 mr-1" />
              <span>Location auto-detected successfully</span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 w-full">
            <input
              id="city"
              name="city"
              type="text"
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm outline-none text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-black focus:ring-offset-1"
              placeholder="City"
              value={formData.homeLocation.city}
              onChange={handleChange}
            />
            <input
              id="region"
              name="region"
              type="text"
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm outline-none text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-black focus:ring-offset-1"
              placeholder="State/Region/County"
              value={formData.homeLocation.region}
              onChange={handleChange}
            />
            <select
              id="country"
              name="country"
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm outline-none text-gray-900 focus:ring-2 focus:ring-black focus:ring-offset-1"
              value={formData.homeLocation.country}
              onChange={handleChange}
            >
              <option value="">Select Country</option>
              <option value="United States">United States</option>
              <option value="United Kingdom">United Kingdom</option>
              <option value="Canada">Canada</option>
              <option value="Australia">Australia</option>
              <option value="Germany">Germany</option>
              <option value="France">France</option>
              <option value="Spain">Spain</option>
              <option value="Italy">Italy</option>
              <option value="Netherlands">Netherlands</option>
              <option value="Sweden">Sweden</option>
              <option value="Norway">Norway</option>
              <option value="Denmark">Denmark</option>
              <option value="Finland">Finland</option>
              <option value="Ireland">Ireland</option>
              <option value="Belgium">Belgium</option>
              <option value="Switzerland">Switzerland</option>
              <option value="Austria">Austria</option>
              <option value="Portugal">Portugal</option>
              <option value="Poland">Poland</option>
              <option value="Czech Republic">Czech Republic</option>
              <option value="Hungary">Hungary</option>
              <option value="Romania">Romania</option>
              <option value="Bulgaria">Bulgaria</option>
              <option value="Croatia">Croatia</option>
              <option value="Slovenia">Slovenia</option>
              <option value="Slovakia">Slovakia</option>
              <option value="Estonia">Estonia</option>
              <option value="Latvia">Latvia</option>
              <option value="Lithuania">Lithuania</option>
              <option value="Japan">Japan</option>
              <option value="South Korea">South Korea</option>
              <option value="China">China</option>
              <option value="India">India</option>
              <option value="Brazil">Brazil</option>
              <option value="Mexico">Mexico</option>
              <option value="Argentina">Argentina</option>
              <option value="Chile">Chile</option>
              <option value="Colombia">Colombia</option>
              <option value="Peru">Peru</option>
              <option value="South Africa">South Africa</option>
              <option value="Nigeria">Nigeria</option>
              <option value="Kenya">Kenya</option>
              <option value="Egypt">Egypt</option>
              <option value="Morocco">Morocco</option>
              <option value="Turkey">Turkey</option>
              <option value="Israel">Israel</option>
              <option value="United Arab Emirates">United Arab Emirates</option>
              <option value="Saudi Arabia">Saudi Arabia</option>
              <option value="New Zealand">New Zealand</option>
              <option value="Singapore">Singapore</option>
              <option value="Malaysia">Malaysia</option>
              <option value="Thailand">Thailand</option>
              <option value="Indonesia">Indonesia</option>
              <option value="Philippines">Philippines</option>
              <option value="Vietnam">Vietnam</option>
              <option value="Taiwan">Taiwan</option>
              <option value="Hong Kong">Hong Kong</option>
            </select>
          </div>
          <p className="text-xs text-gray-500 mt-1 text-center">
            {locationDetectionStatus === 'success' 
              ? 'Location auto-detected from your IP address. You can edit or remove it.'
              : locationDetectionStatus === 'failed'
              ? 'Location detection failed. Please enter your location manually.'
              : 'Location will be auto-detected after entering a valid invite code.'
            }
          </p>
        </div>

        <div className="flex flex-col p-4 flex items-center justify-center">
        <button
          type="submit"
          disabled={isLoading}
          className="py-2 px-4 w-auto max-w-md flex justify-center items-center bg-blue-600 hover:bg-blue-700 focus:ring-blue-500 focus:ring-offset-blue-200 text-white transition ease-in duration-200 text-center text-base font-semibold shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 rounded-lg"
        >
          {isLoading ? 'Creating account...' : 'Create Account'}
        </button>
        </div>
      </form>
        </>
      )}

      <div className="mt-6 text-center text-sm text-slate-600">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-blue-700 hover:text-blue-500 hover:underline">
          Sign in
        </Link>
      </div>
    </div>
  );

  return (
    <div 
      className="bg-black/50 fixed inset-0 flex items-center justify-center p-4" 
      style={{ zIndex: 10000 }}
      onClick={handleClose}
    >
      <div 
        className="relative bg-white rounded-lg shadow-lg max-h-[90vh] w-full max-w-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Fixed Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex justify-between items-center z-10">
          <button
            type="button"
            onClick={handleClose}
            className="flex items-center text-gray-600 hover:text-gray-800 transition-colors"
          >
            <span>Back</span>
          </button>
          <h2 className="text-xl font-semibold text-gray-900">
            {isRegisterPage ? 'Create Account' : 'Sign In'}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
        
        {/* Scrollable Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-80px)] p-4">
          {/* Error/Success Messages */}
          {isFromOAuth && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">
                There was an issue with your authentication. Please try again.
              </p>
            </div>
          )}
          
          {/* Main Content */}
          {isRegisterPage ? renderRegisterForm() : renderLoginForm()}
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
