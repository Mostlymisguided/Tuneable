import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer, cssTransition } from 'react-toastify';
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { useState, useEffect, lazy, Suspense } from 'react';
import 'react-toastify/dist/ReactToastify.css';

import { AuthProvider, useAuth } from './contexts/AuthContext';
import { useWebPlayerStore } from './stores/webPlayerStore';
import { usePodcastPlayerStore } from './stores/podcastPlayerStore';
import Navbar from './components/Navbar';
import PersistentWebPlayer from './components/PersistentWebPlayer';
import MP3Player from './components/MP3Player';
import PersistentPodcastPlayer from './components/PersistentPodcastPlayer';
import { isMediaPlayable } from './utils/mediaPlayability';
import About from './pages/About';
import AuthPage from './pages/AuthPage';
import AuthCallback from './pages/AuthCallback';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfService from './pages/TermsOfService';
import DataDeletion from './pages/DataDeletion';
import Help from './pages/Help';
import Dashboard from './pages/Dashboard';
import Parties from './pages/Parties';
import Party from './pages/Party';
import CreateParty from './pages/CreateParty';
// Profile page deprecated - now using unified UserProfile with edit functionality
// import Profile from './pages/Profile';
import Payment from './pages/Payment';
import Search from './pages/Search';
import Wallet from './pages/Wallet';
import LibraryImport from './pages/LibraryImport';
import Podcasts from './pages/Podcasts';
import PodcastSearch from './pages/PodcastSearch';
import TuneProfile from './pages/TuneProfile';
import GearProfile from './pages/GearProfile';
import PodcastEpisodeProfile from './pages/PodcastEpisodeProfile';
import PodcastSeriesProfile from './pages/PodcastSeriesProfile';
import UserProfile from './pages/UserProfile';
import LabelProfile from './pages/LabelProfile';
import CollectiveProfile from './pages/CollectiveProfile';
import Admin from './pages/Admin';
import CreatorRegister from './pages/CreatorRegister';
const CreatorUpload = lazy(() => import('./pages/CreatorUpload'));
import CreatorYouTubeImport from './pages/CreatorYouTubeImport';
import RequestInvite from './pages/RequestInvite';
import LoadingSpinner from './components/LoadingSpinner';
import DefaultTipOnboardingModal from './components/DefaultTipOnboardingModal';
import Notifications from './pages/Notifications';
import { AuthDeepLinkListener } from './capacitor/authDeepLink';
import { getApiOrigin } from './utils/platform';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import VerifyEmail from './pages/VerifyEmail';
import ArtistEscrowDashboard from './pages/ArtistEscrowDashboard';
import JoinUs from './pages/JoinUs';

// Define fade transition for toast notifications
// Duration is controlled by CSS animations (0.3s for fadeIn, 0.2s for fadeOut)
const Fade = cssTransition({
  enter: 'fadeIn',
  exit: 'fadeOut'
});

// Component to handle simple conditional player rendering
const PlayerRenderer = () => {
  const { currentMedia } = useWebPlayerStore();
  const { currentEpisode } = usePodcastPlayerStore();

  // When podcast player has an episode, show only the podcast player (don't touch web player)
  if (currentEpisode) {
    return <PersistentPodcastPlayer />;
  }

  // Helper function to detect media type (upload-only for playback; YouTube is catalog-only)
  const detectMediaType = (media: any): 'audio' | null => {
    if (!media?.sources) return null;

    if (Array.isArray(media.sources)) {
      for (const source of media.sources) {
        if (source?.platform === 'upload' && source.url) return 'audio';
      }
    } else if (typeof media.sources === 'object' && media.sources.upload) {
      return 'audio';
    }

    return null;
  };

  if (!currentMedia) {
    return <PersistentWebPlayer />; // Empty player chrome
  }

  if (isMediaPlayable(currentMedia) && detectMediaType(currentMedia) === 'audio') {
    return <MP3Player media={currentMedia} />;
  }

  // Catalog entries awaiting upload — no audio engine
  return <PersistentWebPlayer />;
};

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading } = useAuth();
  
  if (isLoading) {
    return <LoadingSpinner />;
  }
  
  return user ? <>{children}</> : <Navigate to="/login" />;
};

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading } = useAuth();
  
  if (isLoading) {
    return <LoadingSpinner />;
  }
  
  if (!user) {
    return <Navigate to="/login" />;
  }
  
  if (!user.role?.includes('admin')) {
    return <Navigate to="/dashboard" />;
  }
  
  return <>{children}</>;
};

// Redirect /profile to /user/:uuid for unified profile experience
const ProfileRedirect = () => {
  const { user } = useAuth();
  
  if (!user || (!user._id && !user.uuid)) {
    return <Navigate to="/login" />;
  }
  
  return <Navigate to={`/user/${user._id || user.uuid}`} replace />;
};

const AppContent = () => {
  return (
    <Router>
      <AuthDeepLinkListener />
      <div className="min-h-screen">
        <Navbar />
        <DefaultTipOnboardingModal />
        <main className="pt-16 pb-32">
          <Routes>
            <Route path="/" element={<Navigate to="/party/global?period=all-time" replace />} />
            <Route path="/home" element={<Navigate to="/about" replace />} />
            <Route path="/about" element={<About />} />
            <Route path="/login" element={<AuthPage />} />
            <Route path="/register" element={<AuthPage />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/request-invite" element={<RequestInvite />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/terms-of-service" element={<TermsOfService />} />
            <Route path="/data-deletion" element={<DataDeletion />} />
            <Route path="/help" element={<Help />} />
            <Route path="/join-us" element={<JoinUs />} />
            <Route path="/explore" element={<Navigate to="/party/global?period=all-time" replace />} />
            <Route 
              path="/dashboard" 
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/parties" 
              element={<Parties />} 
            />
            <Route 
              path="/party/:partyId" 
              element={<Party headerVariant={2} />} 
            />
            <Route 
              path="/party-v2/:partyId" 
              element={<Party headerVariant={2} />} 
            />
            <Route 
              path="/create-party" 
              element={
                <AdminRoute>
                  <CreateParty />
                </AdminRoute>
              } 
            />
            <Route 
              path="/search" 
              element={
                <ProtectedRoute>
                  <Search />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/gear/:gearName" 
              element={<GearProfile />} 
            />
            <Route 
              path="/podcasts" 
              element={<Podcasts />} 
            />
            <Route 
              path="/podcasts/search" 
              element={<PodcastSearch />} 
            />
            <Route 
              path="/profile" 
              element={
                <ProtectedRoute>
                  <ProfileRedirect />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/creator/register" 
              element={<CreatorRegister />} 
            />
            <Route 
              path="/creator/upload" 
              element={
                <ProtectedRoute>
                  <Suspense fallback={<LoadingSpinner />}>
                    <CreatorUpload />
                  </Suspense>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/creator/import-youtube" 
              element={
                <ProtectedRoute>
                  <CreatorYouTubeImport />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/artist-escrow" 
              element={
                <ProtectedRoute>
                  <ArtistEscrowDashboard />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/payment" 
              element={
                <ProtectedRoute>
                  <Payment />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/wallet" 
              element={
                <ProtectedRoute>
                  <Wallet />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/import" 
              element={
                <ProtectedRoute>
                  <LibraryImport />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/tune/:mediaId" 
              element={<TuneProfile />} 
            />
            <Route 
              path="/podcasts/:mediaId" 
              element={<PodcastEpisodeProfile />} 
            />
            <Route 
              path="/podcast/:seriesId" 
              element={<PodcastSeriesProfile />} 
            />
            <Route 
              path="/user/:userId" 
              element={<UserProfile />} 
            />
            <Route 
              path="/label/:slug" 
              element={<LabelProfile />} 
            />
            <Route 
              path="/collective/:slug" 
              element={<CollectiveProfile />} 
            />
            <Route 
              path="/admin" 
              element={
                <ProtectedRoute>
                  <Admin />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/notifications" 
              element={
                <ProtectedRoute>
                  <Notifications />
                </ProtectedRoute>
              } 
            />
          </Routes>
        </main>
        <PlayerRenderer />
        <ToastContainer
          position="top-right"
          autoClose={5000}
          hideProgressBar={true}
          newestOnTop={false}
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
          transition={Fade}
          style={{ zIndex: 10001 }}
        />
      </div>
    </Router>
  );
};

function App() {
  const [stripePromise, setStripePromise] = useState<ReturnType<typeof loadStripe> | null>(null);
  const [isLoadingStripe, setIsLoadingStripe] = useState(true);

  useEffect(() => {
    // Fetch the Stripe publishable key from the backend
    const fetchStripeKey = async () => {
      try {
        const response = await fetch(`${getApiOrigin()}/api/search/stripe/publishable-key`);
        if (response.ok) {
          const data = await response.json();
          if (data.publishableKey) {
            setStripePromise(loadStripe(data.publishableKey));
          } else {
            console.error('Stripe publishable key not returned from backend');
            setStripePromise(null);
          }
        } else {
          console.error('Failed to fetch Stripe publishable key from backend:', response.status);
          setStripePromise(null);
        }
      } catch (error) {
        console.error('Error fetching Stripe publishable key:', error);
        setStripePromise(null);
      } finally {
        setIsLoadingStripe(false);
      }
    };

    fetchStripeKey();
  }, []);

  if (isLoadingStripe) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <Elements stripe={stripePromise}>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </Elements>
  );
}

export default App;