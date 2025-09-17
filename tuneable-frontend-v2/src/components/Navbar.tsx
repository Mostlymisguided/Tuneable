import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Music, User, LogOut, Plus, Home, Users } from 'lucide-react';

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
                  className="flex items-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-lg font-medium transition-colors"
                >
                  <Home className="h-4 w-4" />
                  <span>Home</span>
                </Link>
                <Link
                  to="/create-party"
                  className="flex items-center space-x-2 px-4 py-2 bg-gray-700 text-white rounded-lg font-medium hover:bg-gray-600 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  <span>Create Party</span>
                </Link>
                <Link
                  to="/parties"
                  className="flex items-center space-x-2 px-4 py-2 bg-gray-700 text-white rounded-lg font-medium hover:bg-gray-600 transition-colors"
                >
                  <Users className="h-4 w-4" />
                  <span>Parties</span>
                </Link>
                <Link
                  to="/wallet"
                  className="flex items-center space-x-2 px-4 py-2 text-white hover:text-purple-400 transition-colors"
                >
                  <Music className="h-4 w-4" />
                  <span>Wallet</span>
                </Link>
                <div className="flex items-center space-x-3 ml-4">
                  <span className="text-sm text-gray-300">
                    £{user.balance?.toFixed(2) || '0.00'}
                  </span>
                  <Link
                    to="/profile"
                    className="flex items-center space-x-2 px-4 py-2 bg-gray-700 text-white rounded-lg font-medium hover:bg-gray-600 transition-colors"
                  >
                    <User className="h-4 w-4" />
                    <span>{user.username}</span>
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="flex items-center space-x-2 px-3 py-2 text-gray-300 hover:text-red-400 transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Logout</span>
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center space-x-3">
                <Link
                  to="/login"
                  className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
                >
                  Login
                </Link>
                <Link
                  to="/register"
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors"
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
