import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer, cssTransition } from 'react-toastify';
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import 'react-toastify/dist/ReactToastify.css';

import { AuthProvider, useAuth } from './contexts/AuthContext';
import { useWebPlayerStore } from './stores/webPlayerStore';
import Navbar from './components/Navbar';
import PersistentWebPlayer from './components/PersistentWebPlayer';
import MP3Player from './components/MP3Player';
import WarningBanner from './components/WarningBanner';
import Home from './pages/Home';
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
import PodcastDiscovery from './pages/PodcastDiscovery';
import TuneProfile from './pages/TuneProfile';
import UserProfile from './pages/UserProfile';
import LabelProfile from './pages/LabelProfile';
import CollectiveProfile from './pages/CollectiveProfile';
import Admin from './pages/Admin';
import CreatorRegister from './pages/CreatorRegister';
import CreatorUpload from './pages/CreatorUpload';
import RequestInvite from './pages/RequestInvite';
import LoadingSpinner from './components/LoadingSpinner';
import Notifications from './pages/Notifications';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import VerifyEmail from './pages/VerifyEmail';
import ArtistEscrowDashboard from './pages/ArtistEscrowDashboard';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '');

// Define fade transition for toast notifications
// Duration is controlled by CSS animations (0.3s for fadeIn, 0.2s for fadeOut)
const Fade = cssTransition({
  enter: 'fadeIn',
  exit: 'fadeOut'
});

// Component to handle simple conditional player rendering
const PlayerRenderer = () => {
  const { currentMedia } = useWebPlayerStore();
  
  // Helper function to detect media type
  const detectMediaType = (media: any): 'youtube' | 'audio' | null => {
    if (!media?.sources) return null;
    
    if (Array.isArray(media.sources)) {
      for (const source of media.sources) {
        if (source?.platform === 'youtube' && source.url) return 'youtube';
        if (source?.platform === 'upload' && source.url) return 'audio';
      }
    } else if (typeof media.sources === 'object') {
      if (media.sources.youtube) return 'youtube';
      if (media.sources.upload) return 'audio';
    }
    
    return null;
  };

  if (!currentMedia) {
    return <PersistentWebPlayer />; // Default to YouTube player
  }

  const mediaType = detectMediaType(currentMedia);

  // Simple conditional rendering - one player at a time
  if (mediaType === 'audio') {
    return <MP3Player media={currentMedia} />;
  }

  // Default to YouTube player for YouTube media or unknown types
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
      <div className="min-h-screen">
        <Navbar />
        <WarningBanner />
        <main className="pt-16 pb-32">
          <Routes>
            <Route path="/" element={<Home />} />
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
              element={<Party />} 
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
              path="/podcasts" 
              element={
                <ProtectedRoute>
                  <PodcastDiscovery />
                </ProtectedRoute>
              } 
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
                  <CreatorUpload />
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
              path="/tune/:mediaId" 
              element={<TuneProfile />} 
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
  return (
    <Elements stripe={stripePromise}>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </Elements>
  );
}

export default App;