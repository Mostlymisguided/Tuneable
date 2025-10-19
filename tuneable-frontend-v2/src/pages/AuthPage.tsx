import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-toastify';
import { 
  Eye, 
  EyeOff,
  Gift,
  CheckCircle,
  XCircle
} from 'lucide-react';
import axios from 'axios';

const AuthPage: React.FC = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [inviteCodeValid, setInviteCodeValid] = useState<boolean | null>(null);
  const [inviterUsername, setInviterUsername] = useState<string>('');
  const [isValidatingCode, setIsValidatingCode] = useState(false);
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
      country: '',
    },
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

  const handleSocialAuth = (provider: 'facebook' | 'google' | 'instagram' | 'soundcloud') => {
    // Check if invite code is required for registration
    if (isRegisterPage && !inviteCodeValid) {
      toast.error('Please enter a valid invite code to sign up');
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    
    if (name === 'city' || name === 'country') {
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
      toast.error(error.response?.data?.error || 'Login failed');
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
      toast.error(error.response?.data?.error || 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  const renderLoginForm = () => (
    <div className="p-5">
      <div className="text-center p-4">
        <p className="mb-3 text-2xl font-semibold leading-5 text-slate-900">
          Login to your account
        </p>
        <p className="mt-2 text-sm leading-4 text-slate-600">
          You must be logged in to perform this action.
        </p>
      </div>

      <div className="mt-7 flex items-center justify-center flex-col gap-2">
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
        <button onClick={() => handleSocialAuth('instagram')} type="button" className="py-2 px-4 w-auto max-w-md flex justify-center items-center bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 focus:ring-pink-500 focus:ring-offset-pink-200 text-white transition ease-in duration-200 text-center text-base font-semibold shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 rounded-lg">
          <svg width="20" height="20" fill="currentColor" className="mr-2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
          </svg>
          Sign in with Instagram
        </button>
        <button onClick={() => handleSocialAuth('soundcloud')} type="button" className="py-2 px-4 w-auto max-w-md flex justify-center items-center bg-orange-600 hover:bg-orange-700 focus:ring-orange-500 focus:ring-offset-orange-200 text-white transition ease-in duration-200 text-center text-base font-semibold shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 rounded-lg">
          <svg width="20" height="20" fill="currentColor" className="mr-2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M1.175 12.225c-.051 0-.094.046-.101.1l-.233 2.154v.002l.233 2.105c.007.058.05.098.101.098.05 0 .09-.04.099-.098l.255-2.105-.255-2.154c-.01-.057-.05-.102-.1-.102zm-.928 1.566c-.051 0-.092.04-.101.093l-.179 1.514.179 1.498c.009.055.05.095.101.095s.091-.04.101-.095l.201-1.498-.201-1.514c-.009-.055-.05-.093-.101-.093zm1.86.089c-.058 0-.1.05-.109.112l-.215 1.803.215 1.77c.008.062.05.11.109.11.053 0 .098-.048.107-.11l.241-1.77-.241-1.803c-.009-.062-.054-.112-.107-.112zm-.934-.153c-.053 0-.097.047-.106.108l-.227 1.914.227 1.893c.009.06.053.107.106.107.053 0 .097-.046.106-.107l.253-1.893-.253-1.914c-.009-.061-.053-.108-.106-.108zm1.87.153c-.063 0-.11.055-.12.126l-.201 1.689.201 1.666c.01.071.057.125.12.125.061 0 .111-.054.12-.125l.227-1.666-.227-1.689c-.009-.071-.059-.126-.12-.126zm.927-.223c-.068 0-.119.057-.128.134l-.186 1.543.186 1.517c.009.077.06.134.128.134.067 0 .118-.057.127-.134l.211-1.517-.211-1.543c-.009-.077-.06-.134-.127-.134zm.936-.155c-.071 0-.125.061-.134.139l-.174 1.439.174 1.416c.009.077.063.139.134.139.072 0 .126-.062.134-.139l.197-1.416-.197-1.439c-.008-.078-.062-.139-.134-.139zm.924-.167c-.074 0-.131.065-.141.151l-.161 1.351.161 1.331c.01.085.067.15.141.15.075 0 .131-.065.14-.15l.182-1.331-.182-1.351c-.009-.086-.065-.151-.14-.151z"/>
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
          className="block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-black focus:ring-offset-1"
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
          className="mt-2 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-black focus:ring-offset-1"
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
      <div className="mt-6 text-center text-sm text-slate-600">
        Don't have an account?{' '}
        <Link to="/register" className="font-medium text-white">
          Sign up
        </Link>
      </div>
    </div>
  );

  const renderRegisterForm = () => (
    <div className="p-6">
      <div className="text-center p-6">
        <p className="mb-3 text-2xl font-semibold leading-5 text-slate-900">
          Create your account
        </p>
        <p className="mt-2 text-sm leading-4 text-slate-600">
          Join Tuneable to start sharing your music
        </p>
      </div>

      <div className="mt-7 flex flex-col p-4 flex items-center justify-center gap-2 items-center">
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
        <button onClick={() => handleSocialAuth('instagram')} type="button" className="py-2 px-4 w-auto max-w-md flex justify-center items-center bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 focus:ring-pink-500 focus:ring-offset-pink-200 text-white transition ease-in duration-200 text-center text-base font-semibold shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 rounded-lg">
          <svg width="20" height="20" fill="currentColor" className="mr-2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
          </svg>
          Sign up with Instagram
        </button>
        <button onClick={() => handleSocialAuth('soundcloud')} type="button" className="py-2 px-4 w-auto max-w-md flex justify-center items-center bg-orange-600 hover:bg-orange-700 focus:ring-orange-500 focus:ring-offset-orange-200 text-white transition ease-in duration-200 text-center text-base font-semibold shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 rounded-lg">
          <svg width="20" height="20" fill="currentColor" className="mr-2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M1.175 12.225c-.051 0-.094.046-.101.1l-.233 2.154v.002l.233 2.105c.007.058.05.098.101.098.05 0 .09-.04.099-.098l.255-2.105-.255-2.154c-.01-.057-.05-.102-.1-.102zm-.928 1.566c-.051 0-.092.04-.101.093l-.179 1.514.179 1.498c.009.055.05.095.101.095s.091-.04.101-.095l.201-1.498-.201-1.514c-.009-.055-.05-.093-.101-.093zm1.86.089c-.058 0-.1.05-.109.112l-.215 1.803.215 1.77c.008.062.05.11.109.11.053 0 .098-.048.107-.11l.241-1.77-.241-1.803c-.009-.062-.054-.112-.107-.112zm-.934-.153c-.053 0-.097.047-.106.108l-.227 1.914.227 1.893c.009.06.053.107.106.107.053 0 .097-.046.106-.107l.253-1.893-.253-1.914c-.009-.061-.053-.108-.106-.108zm1.87.153c-.063 0-.11.055-.12.126l-.201 1.689.201 1.666c.01.071.057.125.12.125.061 0 .111-.054.12-.125l.227-1.666-.227-1.689c-.009-.071-.059-.126-.12-.126zm.927-.223c-.068 0-.119.057-.128.134l-.186 1.543.186 1.517c.009.077.06.134.128.134.067 0 .118-.057.127-.134l.211-1.517-.211-1.543c-.009-.077-.06-.134-.127-.134zm.936-.155c-.071 0-.125.061-.134.139l-.174 1.439.174 1.416c.009.077.063.139.134.139.072 0 .126-.062.134-.139l.197-1.416-.197-1.439c-.008-.078-.062-.139-.134-.139zm.924-.167c-.074 0-.131.065-.141.151l-.161 1.351.161 1.331c.01.085.067.15.141.15.075 0 .131-.065.14-.15l.182-1.331-.182-1.351c-.009-.086-.065-.151-.14-.151z"/>
          </svg>
          Sign up with SoundCloud
        </button>
      </div>

      <div className="flex w-full items-center gap-2 p-4 text-sm text-slate-600">
        <div className="h-px w-full bg-slate-200"></div>
        OR
        <div className="h-px w-full bg-slate-200"></div>
      </div>

      <form className="w-full space-y-4" onSubmit={handleRegister}>
        {/* Invite Code Field */}
        <div className="flex flex-col flex items-center justify-center">
          <div className="relative w-full">
            <input
              id="parentInviteCode"
              name="parentInviteCode"
              type="text"
              required
              maxLength={5}
              className={`block w-full rounded-lg border px-3 py-2 pr-10 shadow-sm outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-offset-1 ${
                inviteCodeValid === true
                  ? 'border-green-500 focus:ring-green-500'
                  : inviteCodeValid === false
                  ? 'border-red-500 focus:ring-red-500'
                  : 'border-gray-300 focus:ring-black'
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
          <p className="text-xs text-gray-500 mt-1 text-center">
            Don't have a code? <Link to="/request-invite" className="text-purple-600 hover:underline">Request an invite</Link>
          </p>
        </div>

        <div className="flex flex-col flex items-center justify-center">
          {/* <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
            Username
          </label> */}
          <input
            id="username"
            name="username"
            type="text"
            required
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-black focus:ring-offset-1"
            placeholder="Choose a username"
            value={formData.username}
            onChange={handleChange}
          />
        </div>

        <div className="flex flex-col flex items-center justify-center">
          {/* <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
            Email Address
          </label> */}
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-black focus:ring-offset-1"
            placeholder="Email Address"
            value={formData.email}
            onChange={handleChange}
          />
        </div>

        <div className="flex flex-col flex items-center justify-center">       
            <input
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 shadow-sm outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-black focus:ring-offset-1"
              placeholder="Password"
              value={formData.password}
              onChange={handleChange}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className=" right-3 mt-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
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
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 shadow-sm outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-black focus:ring-offset-1"
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

      <div className="mt-6 text-center text-sm text-slate-600">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-[#4285f4]">
          Sign in
        </Link>
      </div>
    </div>
  );

  return (
    <div className="bg-black/50 overflow-y-auto overflow-x-hidden fixed top-0 right-0 left-0 z-50 h-full items-center justify-center flex">
      <div className="relative p-4 w-2/3 max-w-xl h-full md:h-auto">
        <div className="relative bg-white p-4 rounded-lg shadow">
          {/* Close Button */}
          <button
            type="button"
            onClick={handleClose}
            className="lucide-x py-2 px-4 w-auto max-w-md flex justify-center items-center hover:bg-blue-700 focus:ring-blue-500 focus:ring-offset-blue-200 text-black transition ease-in duration-200 text-center text-base font-semibold shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 rounded-lg"
          >
            <span>Back</span>
          </button>

          {/* Error/Success Messages */}
          {isFromOAuth && (
            <div className="m-5 mb-0 p-4 bg-red-50 border border-red-200 rounded-lg">
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
