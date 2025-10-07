import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-toastify';
import { 
  Eye, 
  EyeOff,
  User,
  Phone,
  Building,
  Flag,
  X
} from 'lucide-react';

const AuthPage: React.FC = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    cellPhone: '',
    givenName: '',
    familyName: '',
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
  const urlParams = new URLSearchParams(location.search);
  const message = urlParams.get('message');

  const handleSocialAuth = (provider: 'facebook' | 'google') => {
    // VITE_API_URL already includes /api, so don't add it again
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
    if (provider === 'facebook') {
      window.location.href = `${baseUrl}/auth/facebook`;
    } else if (provider === 'google') {
      window.location.href = `${baseUrl}/auth/google`;
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
      <div className="text-center">
        <p className="mb-3 text-2xl font-semibold leading-5 text-slate-900">
          Login to your account
        </p>
        <p className="mt-2 text-sm leading-4 text-slate-600">
          You must be logged in to perform this action.
        </p>
      </div>

      <div className="mt-7 flex flex-col gap-2">
        <button
          onClick={() => handleSocialAuth('facebook')}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded border border-[#1877F2] bg-[#1877F2] p-2 text-sm font-medium text-white outline-none focus:ring-2 focus:ring-[#1877F2] focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60 hover:bg-[#166fe5] transition-colors"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" fill="#1877F2"/>
            <path d="M16 8.25H14.5C13.75 8.25 13.25 8.75 13.25 9.5V11.25H16L15.5 14H13.25V18.75H11V14H9V11.25H11V9.5C11 7.45 12.45 6 14.5 6H16V8.25Z" fill="white"/>
          </svg>
          Continue with Facebook
        </button>
      </div>

      <div className="flex w-full items-center gap-2 py-6 text-sm text-slate-600">
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
        <p className="mb-3 mt-2 text-sm text-gray-500">
          <Link to="/forgot-password" className="text-blue-800 hover:text-blue-600">
            Reset your password?
          </Link>
        </p>
        <button
          type="submit"
          disabled={isLoading}
          className="inline-flex w-full items-center justify-center rounded-lg bg-black p-2 py-3 text-sm font-medium text-white outline-none focus:ring-2 focus:ring-black focus:ring-offset-1 disabled:bg-gray-400"
        >
          {isLoading ? 'Loading...' : 'Continue'}
        </button>
      </form>

      <div className="mt-6 text-center text-sm text-slate-600">
        Don't have an account?{' '}
        <Link to="/register" className="font-medium text-[#4285f4]">
          Sign up
        </Link>
      </div>
    </div>
  );

  const renderRegisterForm = () => (
    <div className="p-5">
      <div className="text-center">
        <p className="mb-3 text-2xl font-semibold leading-5 text-slate-900">
          Create your account
        </p>
        <p className="mt-2 text-sm leading-4 text-slate-600">
          Join Tuneable to start sharing your music
        </p>
      </div>

      <div className="mt-7 flex flex-col gap-2">
        <button
          onClick={() => handleSocialAuth('facebook')}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded border border-[#1877F2] bg-[#1877F2] p-2 text-sm font-medium text-white outline-none focus:ring-2 focus:ring-[#1877F2] focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60 hover:bg-[#166fe5] transition-colors"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" fill="#1877F2"/>
            <path d="M16 8.25H14.5C13.75 8.25 13.25 8.75 13.25 9.5V11.25H16L15.5 14H13.25V18.75H11V14H9V11.25H11V9.5C11 7.45 12.45 6 14.5 6H16V8.25Z" fill="white"/>
          </svg>
          Continue with Facebook
        </button>
      </div>

      <div className="flex w-full items-center gap-2 py-6 text-sm text-slate-600">
        <div className="h-px w-full bg-slate-200"></div>
        OR
        <div className="h-px w-full bg-slate-200"></div>
      </div>

      <form className="w-full space-y-3" onSubmit={handleRegister}>
        <div>
          <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
            Username
          </label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              id="username"
              name="username"
              type="text"
              required
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 pl-10 shadow-sm outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-black focus:ring-offset-1"
              placeholder="Choose a username"
              value={formData.username}
              onChange={handleChange}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="givenName" className="block text-sm font-medium text-gray-700 mb-1">
              First Name
            </label>
            <input
              id="givenName"
              name="givenName"
              type="text"
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-black focus:ring-offset-1"
              placeholder="First name"
              value={formData.givenName}
              onChange={handleChange}
            />
          </div>
          <div>
            <label htmlFor="familyName" className="block text-sm font-medium text-gray-700 mb-1">
              Last Name
            </label>
            <input
              id="familyName"
              name="familyName"
              type="text"
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-black focus:ring-offset-1"
              placeholder="Last name"
              value={formData.familyName}
              onChange={handleChange}
            />
          </div>
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Email Address
          </label>
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

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            Password
          </label>
          <div className="relative">
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
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
            Confirm Password
          </label>
          <div className="relative">
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
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="cellPhone" className="block text-sm font-medium text-gray-700 mb-1">
            Phone (Optional)
          </label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              id="cellPhone"
              name="cellPhone"
              type="tel"
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 pl-10 shadow-sm outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-black focus:ring-offset-1"
              placeholder="+1 (555) 123-4567"
              value={formData.cellPhone}
              onChange={handleChange}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="city" className="block text-sm font-medium text-gray-700 mb-1">
              City
            </label>
            <div className="relative">
              <Building className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                id="city"
                name="city"
                type="text"
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 pl-10 shadow-sm outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-black focus:ring-offset-1"
                placeholder="City"
                value={formData.homeLocation.city}
                onChange={handleChange}
              />
            </div>
          </div>
          <div>
            <label htmlFor="country" className="block text-sm font-medium text-gray-700 mb-1">
              Country
            </label>
            <div className="relative">
              <Flag className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                id="country"
                name="country"
                type="text"
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 pl-10 shadow-sm outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-black focus:ring-offset-1"
                placeholder="Country"
                value={formData.homeLocation.country}
                onChange={handleChange}
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="inline-flex w-full items-center justify-center rounded-lg bg-black p-2 py-3 text-sm font-medium text-white outline-none focus:ring-2 focus:ring-black focus:ring-offset-1 disabled:bg-gray-400"
        >
          {isLoading ? 'Creating account...' : 'Create Account'}
        </button>
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
      <div className="relative p-4 w-full max-w-md h-full md:h-auto">
        <div className="relative bg-white rounded-lg shadow">
          {/* Close Button */}
          <button
            type="button"
            onClick={handleClose}
            className="absolute top-3 right-2.5 text-gray-400 bg-transparent hover:bg-gray-200 hover:text-gray-900 rounded-lg text-sm p-1.5 ml-auto inline-flex items-center"
          >
            <X className="w-5 h-5" />
            <span className="sr-only">Close popup</span>
          </button>

          {/* Error/Success Messages */}
          {isFromOAuth && (
            <div className="m-5 mb-0 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">
                There was an issue with your authentication. Please try again.
              </p>
            </div>
          )}

          {/* Google Coming Soon Message */}
          {message === 'google_coming_soon' && (
            <div className="m-5 mb-0 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-600">
                Google authentication is coming soon! Please use Facebook or email for now.
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
