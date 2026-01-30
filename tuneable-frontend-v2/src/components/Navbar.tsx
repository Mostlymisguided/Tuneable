import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User as UserIcon, Headphones, Music, Home, LogOut, Compass, Podcast } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import NotificationBell from './NotificationBell';
import { penceToPounds } from '../utils/currency';

const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-gray-900/20 shadow-lg border-purple-400">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex justify-between h-12 sm:h-16">
          <div className="flex items-center">
            <Link to="/" className="flex items-center space-x-2">
              <img 
                src="/Tuneable-Logo-180x180.svg" 
                alt="Tuneable Logo" 
                className="h-8 w-8"
              />
              <div className="hidden sm:flex flex-col items-start">
                <span className="text-lg sm:text-xl font-bold text-white">Tuneable</span>
                <span className="text-[10px] font-semibold bg-gradient-to-r from-purple-500 to-pink-500 text-white px-1.5 py-0.5 rounded mt-0.5">
                  BETA
                </span>
              </div>
            </Link>
          </div>

          <div className="flex items-center space-x-1 sm:space-x-3">
            {user ? (
              <>
                <Link
                  to="/dashboard"
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center"
                  style={{ textDecoration: 'none' }}
                >
                  <Home className="h-5 w-5 sm:hidden" />
                  <span className="hidden sm:inline">Home</span>
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
                  to="/podcasts"
                  className="px-4 py-2 text-white rounded-lg font-medium transition-colors flex items-center justify-center"
                  style={{ textDecoration: 'none' }}
                  onMouseEnter={(e) => (e.target as HTMLElement).style.backgroundColor = '#4B5563'}
                  onMouseLeave={(e) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}
                >
                  <Headphones className="h-5 w-5 sm:hidden" />
                  <span className="hidden sm:inline">Podcasts</span>
                </Link>
                <Link
                  to="/party/global"
                  className="px-4 py-2 text-white rounded-lg font-medium transition-colors flex items-center justify-center"
                  style={{ textDecoration: 'none' }}
                  onMouseEnter={(e) => (e.target as HTMLElement).style.backgroundColor = '#4B5563'}
                  onMouseLeave={(e) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}
                >
                  <Music className="h-5 w-5 sm:hidden" />
                  <span className="hidden sm:inline">Tunes</span>
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
                    <UserIcon className="h-5 w-5 sm:hidden" />
                  </Link>
                  <NotificationBell />
                  <button
                    onClick={handleLogout}
                    className="px-2 sm:px-3 py-1 sm:py-2 text-gray-300 rounded-lg font-medium transition-colors text-sm sm:text-base flex items-center justify-center"
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
                    <LogOut className="h-5 w-5 sm:hidden" />
                    <span className="hidden sm:inline">Logout</span>
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center space-x-3">
                <Link
                  to="/explore"
                  className="px-4 py-2 text-gray-300 rounded-lg font-medium transition-colors flex items-center justify-center"
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
                  <Compass className="h-5 w-5 sm:hidden" />
                  <span className="hidden sm:inline">Explore Music</span>
                </Link>
                <a
                  href="https://tuneable.stream/podcasts/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 text-gray-300 rounded-lg font-medium transition-colors flex items-center justify-center"
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
                  <Podcast className="h-5 w-5 sm:hidden" />
                  <span className="hidden sm:inline">Explore Podcasts</span>
                </a>
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
