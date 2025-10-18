import React from 'react';
import { Link } from 'react-router-dom';
import { Music, Users, DollarSign, Zap } from 'lucide-react';

const Home: React.FC = () => {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="bg-gradient-to-b from-indigo-900 via-purple-900 to-indigo-800 text-white relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="text-center">
            
            {/* Social Music Democracy Badge */}
            <div className="flex justify-center mb-8" style={{ marginTop: '20px' }}>
              <div className="bg-gradient-to-r from-purple-700 to-purple-800 px-6 py-3 rounded-full flex items-center space-x-2 shadow-lg">
                <Zap className="h-5 w-5 text-yellow-400" />
                <span className="text-white font-semibold">Social Music Democracy</span>
              </div>
            </div>
            
            {/* Main Title */}
            <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
              <span className="text-white">Let The Crowd</span>
              <br />
              <span className="text-pink-400">Control The Vibe</span>
            </h1>
            
            {/* Description */}
            <p className="text-xl md:text-2xl mb-12 text-gray-200 max-w-3xl mx-auto leading-relaxed" style={{ marginTop: '20px' }}>
              The Social Music App - Bid To Boost Tunes - Democratically Shape The Party
            </p>
            
            {/* CTA Button */}
            <div className="flex justify-center">
              <Link
                to="/register"
                className="text-white rounded-lg border-2 border-white font-semibold hover:bg-gray-100 transition-colors text-lg"
                style={{ 
                  textDecoration: 'none', 
                  padding: '10px 24px',
                  marginTop: '20px',
                  marginBottom: '20px'
                }}
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="bg-gradient-to-br from-indigo-900 via-purple-900 to-indigo-800 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              How Tuneable Works
            </h2>
            <p className="text-xl text-gray-300">
              Create Parties, Bid on Tunes, and Control The Music Together
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="text-center group">
              <div className="bg-purple-600/20 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 border-2 border-purple-500/30 group-hover:border-purple-400 group-hover:bg-purple-600/30 transition-all">
                <Music className="h-10 w-10 text-purple-400" />
              </div>
              <h3 className="text-xl font-bold text-white mb-3">
                Create Parties
              </h3>
              <p className="text-gray-300 leading-relaxed">
                Start a party and invite friends to join the music experience
              </p>
            </div>

            <div className="text-center group">
              <div className="bg-green-600/20 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 border-2 border-green-500/30 group-hover:border-green-400 group-hover:bg-green-600/30 transition-all">
                <DollarSign className="h-10 w-10 text-green-400" />
              </div>
              <h3 className="text-xl font-bold text-white mb-3">
                Bid on Tunes
              </h3>
              <p className="text-gray-300 leading-relaxed">
                Bid your credits to get your favorite Tunes to the top
              </p>
            </div>

            <div className="text-center group">
              <div className="bg-blue-600/20 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 border-2 border-blue-500/30 group-hover:border-blue-400 group-hover:bg-blue-600/30 transition-all">
                <Users className="h-10 w-10 text-blue-400" />
              </div>
              <h3 className="text-xl font-bold text-white mb-3">
                Social Music
              </h3>
              <p className="text-gray-300 leading-relaxed">
                Connect with friends and discover new music together
              </p>
            </div>

            <div className="text-center group">
              <div className="bg-yellow-600/20 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 border-2 border-yellow-500/30 group-hover:border-yellow-400 group-hover:bg-yellow-600/30 transition-all">
                <Zap className="h-10 w-10 text-yellow-400" />
              </div>
              <h3 className="text-xl font-bold text-white mb-3">
                Real-time Updates
              </h3>
              <p className="text-gray-300 leading-relaxed">
                Live queue updates and synchronized playback for everyone
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-gray-900 text-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Ready to Start Your Party?
          </h2>
          <p className="text-xl text-gray-300 mb-8">
            Join thousands of music lovers creating unforgettable experiences
          </p>
          <Link
            to="/register"
            className="bg-primary-600 hover:bg-primary-700 text-white px-8 py-3 rounded-lg font-semibold transition-colors"
          >
            Create Your Account
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="mb-4 md:mb-0">
              <p className="text-gray-400">&copy; 2025 Tuneable. All rights reserved.</p>
            </div>
            <div className="flex space-x-6">
              <Link 
                to="/privacy-policy" 
                className="text-gray-400 hover:text-white transition-colors"
              >
                Privacy Policy
              </Link>
              <Link 
                to="/terms-of-service" 
                className="text-gray-400 hover:text-white transition-colors"
              >
                Terms of Service
              </Link>
              <Link 
                to="/data-deletion" 
                className="text-gray-400 hover:text-white transition-colors"
              >
                Data Deletion
              </Link>
              <Link 
                to="/about" 
                className="text-gray-400 hover:text-white transition-colors"
              >
                About
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Home;
