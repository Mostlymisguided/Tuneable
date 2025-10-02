import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Music } from 'lucide-react';

const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <nav className="bg-gray-900 shadow-lg border-b border-purple-400">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link to="/" className="flex items-center space-x-2">
              <Music className="h-8 w-8 text-purple-400" />
              <span className="text-xl font-bold text-white">Tuneable</span>
            </Link>
          </div>

          <div className="flex items-center space-x-3">
            {user ? (
              <>
                <Link
                  to="/dashboard"
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg font-medium transition-colors"
                  style={{ textDecoration: 'none' }}
                >
                  Home
                </Link>
                {user.role.includes('admin') && (
                  <Link
                    to="/create-party"
                    className="px-4 py-2 text-white rounded-lg font-medium transition-colors"
                    style={{ textDecoration: 'none' }}
                    onMouseEnter={(e) => (e.target as HTMLElement).style.backgroundColor = '#4B5563'}
                    onMouseLeave={(e) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}
                  >
                    Create Party
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
                  to="/top-tunes"
                  className="px-4 py-2 text-white rounded-lg font-medium transition-colors"
                  style={{ textDecoration: 'none' }}
                  onMouseEnter={(e) => (e.target as HTMLElement).style.backgroundColor = '#4B5563'}
                  onMouseLeave={(e) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}
                >
                  Music
                </Link>
                <Link
                  to="/podcasts"
                  className="px-4 py-2 text-white rounded-lg font-medium transition-colors"
                  style={{ textDecoration: 'none' }}
                  onMouseEnter={(e) => (e.target as HTMLElement).style.backgroundColor = '#4B5563'}
                  onMouseLeave={(e) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}
                >
                  Podcasts
                </Link>
                <Link
                  to="/wallet"
                  className="px-4 py-2 text-white rounded-lg font-medium transition-colors"
                  style={{ textDecoration: 'none' }}
                  onMouseEnter={(e) => (e.target as HTMLElement).style.backgroundColor = '#4B5563'}
                  onMouseLeave={(e) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}
                >
                  Wallet
                </Link>
                <Link
                  to="/about"
                  className="px-4 py-2 text-white rounded-lg font-medium transition-colors"
                  style={{ textDecoration: 'none' }}
                  onMouseEnter={(e) => (e.target as HTMLElement).style.backgroundColor = '#4B5563'}
                  onMouseLeave={(e) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}
                >
                  About
                </Link>
                <div className="flex items-center space-x-3 ml-4">
                  <span className="text-sm text-gray-300">
                    £{user.balance?.toFixed(2) || '0.00'}
                  </span>
                  <Link
                    to="/profile"
                    className="px-4 py-2 text-white rounded-lg font-medium transition-colors"
                    style={{ textDecoration: 'none' }}
                    onMouseEnter={(e) => (e.target as HTMLElement).style.backgroundColor = '#4B5563'}
                    onMouseLeave={(e) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}
                  >
                    {user.username}
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="px-3 py-2 text-gray-300 rounded-lg font-medium transition-colors"
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
                    Logout
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
