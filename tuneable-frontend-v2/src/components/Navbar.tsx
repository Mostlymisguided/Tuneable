import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { User as UserIcon, Home, LogOut, Plus, BarChart3, Globe } from 'lucide-react';
import AddMediaModal from './AddMediaModal';
import { useAuth } from '../contexts/AuthContext';
import NotificationBell from './NotificationBell';
import { penceToPounds } from '../utils/currency';
import { chartKindPath, isChartsPath, isPlacesPath } from '../utils/chartKind';
import { getUserProfileUrl } from '../utils/profileNavigation';

function ghostNavClass(active: boolean, loggedOut = false) {
  const idle = loggedOut ? 'text-gray-300' : 'text-white';
  return `px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center ${
    active ? 'bg-gray-700 text-white' : `${idle} hover:bg-gray-600 hover:text-white`
  }`;
}

const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [showAddMediaModal, setShowAddMediaModal] = useState(false);
  const chartsActive = isChartsPath(pathname);
  const placesActive = isPlacesPath(pathname);

  const handleLogout = () => {
    logout();
    navigate('/explore');
  };

  return (
    <>
    <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-gray-900/20 shadow-lg border-purple-400">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex justify-between h-12 sm:h-16">
          <div className="flex items-center">
            <Link to="/explore" className="flex items-center space-x-2">
              <img 
                src="/Tuneable-Logo-180x180.svg" 
                alt="Tuneable Logo" 
                className="h-8 w-8"
              />
              <span className="hidden sm:block text-lg sm:text-xl font-bold text-white">Tuneable</span>
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
                  <button
                    onClick={() => setShowAddMediaModal(true)}
                    className="flex items-center justify-center w-10 h-10 sm:w-10 sm:h-10 px-0 py-0 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-medium transition-colors hover:from-purple-500 hover:to-pink-500"
                    title="Add media"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                )}
                <Link
                  to={chartKindPath('music')}
                  className={ghostNavClass(chartsActive)}
                  style={{ textDecoration: 'none' }}
                >
                  <BarChart3 className="h-5 w-5 sm:hidden" />
                  <span className="hidden sm:inline">Charts</span>
                </Link>
                <Link
                  to="/places"
                  className={ghostNavClass(placesActive)}
                  style={{ textDecoration: 'none' }}
                >
                  <Globe className="h-5 w-5 sm:hidden" />
                  <span className="hidden sm:inline">Places</span>
                </Link>
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
                    to={getUserProfileUrl(user)}
                    className="px-2 sm:px-4 py-1 sm:py-2 text-white rounded-lg font-medium transition-colors text-sm sm:text-base hover:bg-gray-600"
                    style={{ textDecoration: 'none' }}
                  >
                    <span className="hidden sm:inline">{user.username}</span>
                    <UserIcon className="h-5 w-5 sm:hidden" />
                  </Link>
                  <NotificationBell />
                  <button
                    onClick={handleLogout}
                    className="px-2 sm:px-3 py-1 sm:py-2 text-gray-300 rounded-lg font-medium transition-colors text-sm sm:text-base flex items-center justify-center hover:bg-gray-600 hover:text-white"
                    style={{ textDecoration: 'none' }}
                  >
                    <LogOut className="h-5 w-5 sm:hidden" />
                    <span className="hidden sm:inline">Logout</span>
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center space-x-3">
                <Link
                  to="/about"
                  className={`hidden sm:flex ${ghostNavClass(pathname === '/about', true)}`}
                  style={{ textDecoration: 'none' }}
                >
                  About
                </Link>
                <Link
                  to={chartKindPath('music')}
                  className={ghostNavClass(chartsActive, true)}
                  style={{ textDecoration: 'none' }}
                >
                  <BarChart3 className="h-5 w-5 sm:hidden" />
                  <span className="hidden sm:inline">Charts</span>
                </Link>
                <Link
                  to="/places"
                  className={ghostNavClass(placesActive, true)}
                  style={{ textDecoration: 'none' }}
                >
                  <Globe className="h-5 w-5 sm:hidden" />
                  <span className="hidden sm:inline">Places</span>
                </Link>
                <Link
                  to="/login"
                  className={ghostNavClass(pathname === '/login', true)}
                  style={{ textDecoration: 'none' }}
                >
                  Login
                </Link>
                <Link
                  to="/register"
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg font-medium transition-colors hover:bg-purple-700"
                  style={{ textDecoration: 'none' }}
                >
                  Sign Up
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
    {showAddMediaModal && (
      <AddMediaModal
        isOpen={showAddMediaModal}
        onClose={() => setShowAddMediaModal(false)}
      />
    )}
    </>
  );
};

export default Navbar;
