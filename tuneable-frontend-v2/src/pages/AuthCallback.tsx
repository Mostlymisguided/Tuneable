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
        // Parse error details from URL
        const errorDetails = searchParams.get('details');
        const errorReason = searchParams.get('reason');
        
        let errorMessage = 'Authentication failed. Please try again.';
        
        if (error === 'oauth_state_mismatch') {
          errorMessage = 'Security verification failed. Please try signing in again.';
        } else if (error === 'oauth_session_missing') {
          errorMessage = 'Session expired. Please try signing in again.';
        } else if (errorDetails) {
          errorMessage = `Authentication error: ${decodeURIComponent(errorDetails)}`;
        } else if (errorReason) {
          errorMessage = `Authentication failed: ${errorReason}`;
        }
        
        toast.error(errorMessage, {
          autoClose: 10000,
          pauseOnHover: true,
        });
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
        } catch (error: any) {
          console.error('Error during OAuth callback:', error);
          
          let errorMessage = 'Authentication failed. Please try again.';
          
          if (error?.response?.status === 401) {
            errorMessage = 'Authentication token is invalid. Please try signing in again.';
          } else if (error?.response?.status >= 500) {
            errorMessage = 'Server error during authentication. Please try again in a moment.';
          } else if (error?.message) {
            errorMessage = `Authentication error: ${error.message}`;
          }
          
          toast.error(errorMessage, {
            autoClose: 10000,
            pauseOnHover: true,
          });
          navigate('/login');
        }
      } else {
        toast.error('No authentication token received. Please try signing in again.', {
          autoClose: 10000,
          pauseOnHover: true,
        });
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
