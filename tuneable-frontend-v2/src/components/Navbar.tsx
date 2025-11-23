import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User as UserIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import NotificationBell from './NotificationBell';
import { penceToPounds } from '../utils/currency';
import { partyAPI } from '../lib/api';

const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [globalPartyId, setGlobalPartyId] = useState<string | null>(null);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  // Fetch Global Party ID dynamically
  useEffect(() => {
    const fetchGlobalPartyId = async () => {
      try {
        const res = await partyAPI.getParties();
        const globalParty = (res.parties || []).find((p: any) => p.type === 'global');
        if (globalParty) {
          // Handle both _id (MongoDB) and id (transformed) formats
          const partyId = globalParty._id || globalParty.id;
          if (partyId) {
            setGlobalPartyId(partyId);
          }
        }
      } catch (error) {
        console.error('Failed to fetch Global Party ID:', error);
        // Fallback to hardcoded ID if fetch fails
        setGlobalPartyId('67c6a02895baad05d3a97cf4');
      }
    };

    if (user) {
      fetchGlobalPartyId();
    }
  }, [user]);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-gray-900/20 shadow-lg border-purple-400">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex justify-between h-12 sm:h-16">
          <div className="flex items-center">
            <Link to="/" className="flex items-center space-x-2">
              <img 
                src="/Tuneable-Logo-180x180.svg" 
                alt="Tuneable Logo" 
                className="h-6 w-6 sm:h-8 sm:w-8"
              />
              <span className="hidden sm:block text-lg sm:text-xl font-bold text-white">Tuneable</span>
            </Link>
          </div>

          <div className="flex items-center space-x-1 sm:space-x-3">
            {user ? (
              <>
                <Link
                  to="/dashboard"
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg font-medium transition-colors"
                  style={{ textDecoration: 'none' }}
                >
                  Home
                </Link>
                {user.role?.includes('admin') && (
                  <Link
                    to="/admin"
                    className="hidden sm:block px-4 py-2 bg-blue-600 text-white rounded-lg font-medium transition-colors"
                    style={{ textDecoration: 'none' }}
                  >
                    Admin
                  </Link>
                )}
                {(user.role?.includes('creator') || user.role?.includes('admin')) && (
                  <Link
                    to="/creator/upload"
                    className="hidden sm:block px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-medium transition-colors"
                    style={{ textDecoration: 'none' }}
                  >
                    Upload
                  </Link>
                )}
                <Link
                  to="/parties"
                  className="px-4 py-2 text-white rounded-lg font-medium transition-colors"
                  style={{ textDecoration: 'none' }}
                  onMouseEnter={(e) => (e.target as HTMLElement).style.backgroundColor = '#4B5563'}
                  onMouseLeave={(e) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}
                >
                  Parties
                </Link>
                <Link
                  to={globalPartyId ? `/party/${globalPartyId}` : '/parties'}
                  className="px-4 py-2 text-white rounded-lg font-medium transition-colors"
                  style={{ textDecoration: 'none' }}
                  onMouseEnter={(e) => (e.target as HTMLElement).style.backgroundColor = '#4B5563'}
                  onMouseLeave={(e) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}
                >
                  Tunes
                </Link>
                {/* <Link
                  to="/podcasts"
                  className="px-4 py-2 text-white rounded-lg font-medium transition-colors"
                  style={{ textDecoration: 'none' }}
                  onMouseEnter={(e) => (e.target as HTMLElement).style.backgroundColor = '#4B5563'}
                  onMouseLeave={(e) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}
                >
                  Podcasts
                </Link> */}
                <div className="flex items-center space-x-2 sm:space-x-3 ml-2 sm:ml-4">
                  <Link
                    to="/wallet"
                    className="hidden sm:block text-sm text-gray-300 hover:text-white transition-colors cursor-pointer px-2 py-1 rounded hover:bg-gray-700/50"
                    style={{ textDecoration: 'none' }}
                    title="Wallet"
                  >
                    {penceToPounds(user.balance)}
                  </Link>
                  <Link
                    to={`/user/${user._id || user.uuid}`}
                    className="hidden sm:block text-sm text-purple-300 hover:text-purple-100 transition-colors cursor-pointer px-2 py-1 rounded hover:bg-purple-700/50"
                    style={{ textDecoration: 'none' }}
                    title="Profile"
                  >
                    {(user as any)?.tuneBytes?.toFixed(0) || '0'} TuneBytes
                  </Link>
                  <Link
                    to={`/user/${user._id || user.uuid}`}
                    className="px-2 sm:px-4 py-1 sm:py-2 text-white rounded-lg font-medium transition-colors text-sm sm:text-base"
                    style={{ textDecoration: 'none' }}
                    onMouseEnter={(e) => (e.target as HTMLElement).style.backgroundColor = '#4B5563'}
                    onMouseLeave={(e) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}
                  >
                    <span className="hidden sm:inline">{user.username}</span>
                    <UserIcon className="h-4 w-4 sm:hidden" />
                  </Link>
                  <NotificationBell />
                  <button
                    onClick={handleLogout}
                    className="px-2 sm:px-3 py-1 sm:py-2 text-gray-300 rounded-lg font-medium transition-colors text-sm sm:text-base"
                    style={{ textDecoration: 'none' }}
                    onMouseEnter={(e) => {
                      (e.target as HTMLElement).style.backgroundColor = '#4B5563';
                      (e.target as HTMLElement).style.color = 'white';
                    }}
                    onMouseLeave={(e) => {
                      (e.target as HTMLElement).style.backgroundColor = 'transparent';
                      (e.target as HTMLElement).style.color = '#D1D5DB';
                    }}
                  >
                    <span className="hidden sm:inline">Logout</span>
                    <span className="sm:hidden">Out</span>
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center space-x-3">
                <Link
                  to="/login"
                  className="px-4 py-2 text-gray-300 rounded-lg font-medium transition-colors"
                  style={{ textDecoration: 'none' }}
                  onMouseEnter={(e) => {
                    (e.target as HTMLElement).style.backgroundColor = '#4B5563';
                    (e.target as HTMLElement).style.color = 'white';
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLElement).style.backgroundColor = 'transparent';
                    (e.target as HTMLElement).style.color = '#D1D5DB';
                  }}
                >
                  Login
                </Link>
                <Link
                  to="/register"
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg font-medium transition-colors"
                  style={{ textDecoration: 'none' }}
                  onMouseEnter={(e) => (e.target as HTMLElement).style.backgroundColor = '#7C3AED'}
                  onMouseLeave={(e) => (e.target as HTMLElement).style.backgroundColor = '#9333EA'}
                >
                  Sign Up
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
