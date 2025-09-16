import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import 'react-toastify/dist/ReactToastify.css';

import { AuthProvider, useAuth } from './contexts/AuthContext';
import Navbar from './components/Navbar';
import PersistentWebPlayer from './components/PersistentWebPlayer';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Parties from './pages/Parties';
import Party from './pages/Party';
import CreateParty from './pages/CreateParty';
import Profile from './pages/Profile';
import Payment from './pages/Payment';
import Search from './pages/Search';
import LoadingSpinner from './components/LoadingSpinner';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '');

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading } = useAuth();
  
  if (isLoading) {
    return <LoadingSpinner />;
  }
  
  return user ? <>{children}</> : <Navigate to="/login" />;
};

const AppContent = () => {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
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
              element={
                <ProtectedRoute>
                  <Parties />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/party/:partyId" 
              element={
                <ProtectedRoute>
                  <Party />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/create-party" 
              element={
                <ProtectedRoute>
                  <CreateParty />
                </ProtectedRoute>
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
              path="/profile" 
              element={
                <ProtectedRoute>
                  <Profile />
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
          </Routes>
        </main>
        <PersistentWebPlayer />
        <ToastContainer
          position="top-right"
          autoClose={5000}
          hideProgressBar={false}
          newestOnTop={false}
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
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