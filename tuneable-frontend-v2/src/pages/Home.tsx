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
              The Social Music App - Bid To Boost Songs - Democratically Shape The Party
            </p>
            
            {/* CTA Button */}
            <div className="flex justify-center">
              <Link
                to="/register"
                className="bg-white text-white rounded-lg font-semibold hover:bg-gray-100 transition-colors text-lg"
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
      <section className="bg-white" style={{ paddingTop: '4rem', paddingBottom: '5rem' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              How Tuneable Works
            </h2>
            <p className="text-xl text-gray-600">
              Create parties, bid on songs, and control the music together
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="bg-primary-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <Music className="h-8 w-8 text-primary-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Create Parties
              </h3>
              <p className="text-gray-600">
                Start a party and invite friends to join the music experience
              </p>
            </div>

            <div className="text-center">
              <div className="bg-primary-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <DollarSign className="h-8 w-8 text-primary-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Bid on Songs
              </h3>
              <p className="text-gray-600">
                Bid your credits to get your favorite songs played next
              </p>
            </div>

            <div className="text-center">
              <div className="bg-primary-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <Users className="h-8 w-8 text-primary-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Social Music
              </h3>
              <p className="text-gray-600">
                Connect with friends and discover new music together
              </p>
            </div>

            <div className="text-center">
              <div className="bg-primary-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <Zap className="h-8 w-8 text-primary-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Real-time Updates
              </h3>
              <p className="text-gray-600">
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
              <p className="text-gray-400">&copy; 2024 Tuneable. All rights reserved.</p>
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
