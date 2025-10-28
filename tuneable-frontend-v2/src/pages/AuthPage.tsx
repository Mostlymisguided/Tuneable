import React, { useState, useEffect } from 'react';
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
  ArrowLeft
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
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-black focus:ring-offset-1"
              placeholder="City"
              value={formData.homeLocation.city}
              onChange={handleChange}
            />
            <input
              id="region"
              name="region"
              type="text"
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-black focus:ring-offset-1"
              placeholder="State/Region/County"
              value={formData.homeLocation.region}
              onChange={handleChange}
            />
            <select
              id="country"
              name="country"
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm outline-none focus:ring-2 focus:ring-black focus:ring-offset-1"
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

      <div className="mt-6 text-center text-sm text-slate-600">
        Already have an account?{' '}
        <Link to="/login" className="font-medium">
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
            <ArrowLeft className="h-5 w-5 mr-2" />
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
