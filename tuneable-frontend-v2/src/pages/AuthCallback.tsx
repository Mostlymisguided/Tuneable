import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-toastify';
import { getPostAuthPath } from '../utils/authHelpers';

const AuthCallback: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { handleOAuthCallback } = useAuth();
  const hasRun = React.useRef(false);

  useEffect(() => {
    // Prevent duplicate runs (React StrictMode / unstable callback identity)
    if (hasRun.current) return;
    hasRun.current = true;

    const handleAuth = async () => {
      const token = searchParams.get('token');
      const error = searchParams.get('error');

      if (error) {
        const errorDetails = searchParams.get('details');
        const errorReason = searchParams.get('reason');
        const errorMessageParam = searchParams.get('message');

        let errorMessage = 'Authentication failed. Please try again.';

        if (error === 'oauth_state_mismatch') {
          errorMessage = 'Security verification failed. Please try signing in again.';
        } else if (error === 'oauth_session_missing') {
          errorMessage = 'Session expired. Please try signing in again.';
        } else if (error === 'account_already_linked' || error === 'account_linking_failed') {
          errorMessage = errorMessageParam
            ? decodeURIComponent(errorMessageParam)
            : 'Account linking failed. Please try again.';
        } else if (errorDetails) {
          errorMessage = `Authentication error: ${decodeURIComponent(errorDetails)}`;
        } else if (errorReason) {
          errorMessage = `Authentication failed: ${errorReason}`;
        } else if (errorMessageParam) {
          errorMessage = decodeURIComponent(errorMessageParam);
        }

        toast.error(errorMessage, {
          autoClose: 10000,
          pauseOnHover: true,
        });

        // Account-linking failures (e.g. Spotify import) don't invalidate the
        // existing session - send the user back where they came from instead
        // of the login page.
        const isLinkingError = error === 'spotify_auth_failed'
          || error === 'account_already_linked'
          || error === 'account_linking_failed';
        if (isLinkingError && localStorage.getItem('token')) {
          const returnUrlParam = searchParams.get('returnUrl');
          navigate(returnUrlParam || '/import', { replace: true });
          return;
        }

        navigate('/login', { replace: true });
        return;
      }

      if (token) {
        try {
          const user = await handleOAuthCallback(token);

          const returnUrlParam = searchParams.get('returnUrl');
          const linked = searchParams.get('oauth_success') === 'true'
            || Boolean(returnUrlParam);

          toast.success(linked ? 'Account connected successfully!' : 'Login successful!');
          navigate(getPostAuthPath(user, returnUrlParam), { replace: true });
        } catch (err: any) {
          console.error('Error during OAuth callback:', err);

          let errorMessage = 'Authentication failed. Please try again.';

          if (err?.response?.status === 401) {
            errorMessage = 'Authentication token is invalid. Please try signing in again.';
          } else if (err?.response?.status >= 500) {
            errorMessage = 'Server error during authentication. Please try again in a moment.';
          } else if (err?.message) {
            errorMessage = `Authentication error: ${err.message}`;
          }

          toast.error(errorMessage, {
            autoClose: 10000,
            pauseOnHover: true,
          });
          navigate('/login', { replace: true });
        }
        return;
      }

      toast.error('No authentication token received. Please try signing in again.', {
        autoClose: 10000,
        pauseOnHover: true,
      });
      navigate('/login', { replace: true });
    };

    void handleAuth();
    // Only run once on mount for the initial query string
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
