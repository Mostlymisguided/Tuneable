import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-toastify';

const AuthCallback: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { handleOAuthCallback } = useAuth();
  const hasRun = React.useRef(false);

  useEffect(() => {
    // Prevent duplicate runs (React StrictMode in development causes double renders)
    if (hasRun.current) return;
    
    const handleAuth = async () => {
      hasRun.current = true;
      const token = searchParams.get('token');
      const error = searchParams.get('error');

      if (error) {
        toast.error('Authentication failed. Please try again.');
        navigate('/login');
        return;
      }

      if (token) {
        try {
          // handleOAuthCallback now fetches user data automatically
          await handleOAuthCallback(token);
          
          // Check if this was a social media OAuth connection
          const oauthSuccess = searchParams.get('oauth_success');
          
          // Check if we're on a custom redirect URL (for account linking)
          // The redirect URL will be in the current URL path, not as a query param
          const currentPath = window.location.pathname;
          const currentSearch = window.location.search;
          
          // If we're not on /auth/callback, we might be on a custom redirect URL
          // Check if the URL contains settings=true (profile settings redirect)
          if (currentSearch.includes('settings=true') || currentSearch.includes('oauth_success=true')) {
            // Extract the path and clean up the token from query params
            const urlParams = new URLSearchParams(currentSearch);
            urlParams.delete('token'); // Remove token from URL
            const cleanPath = currentPath + (urlParams.toString() ? '?' + urlParams.toString() : '');
            toast.success('Account connected successfully!');
            navigate(cleanPath);
          } else if (oauthSuccess === 'true') {
            // Redirect to profile page (will redirect to /user/:userId via ProfileRedirect)
            toast.success('Login successful!');
            navigate('/profile?oauth_success=true');
          } else {
            toast.success('Login successful!');
            navigate('/dashboard');
          }
        } catch (error) {
          console.error('Error during OAuth callback:', error);
          toast.error('Authentication failed. Please try again.');
          navigate('/login');
        }
      } else {
        toast.error('Authentication failed. Please try again.');
        navigate('/login');
      }
    };

    handleAuth();
  }, [searchParams, navigate, handleOAuthCallback]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Completing authentication...</p>
      </div>
    </div>
  );
};

export default AuthCallback;
