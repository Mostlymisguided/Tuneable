import React from 'react';
import { Link } from 'react-router-dom';
import { Music, Users, Coins, Zap, Heart, Globe, Waves, Shield, Users2, Eye, Target } from 'lucide-react';

const Home: React.FC = () => {
  const aims: Array<{ icon: React.ReactElement; title: string }> = [
    {
      icon: <Globe className="h-8 w-8 text-blue-400" />,
      title: "Democratically + Transparently Chart The Global Music Catalogue",
     // description: "Creating a fair and open system for discovering and promoting music worldwide."
    },
    {
      icon: <Music className="h-8 w-8 text-purple-400" />,
      title: "Encourage Users To Pay A Fair Price For Music",
      //description: "Supporting creators through fair compensation and direct fan engagement."
    },
    {
      icon: <Users className="h-8 w-8 text-orange-400" />,
      title: "Empower Artists by Maximising their Earnings",
      //description: "Creating inclusive spaces where everyone can contribute to the musical experience."
    },
    {
      icon: <Waves className="h-8 w-8 text-green-400" />,
      title: "The Adoption Of More Resonant Musical Tuning Standards (e.g. A4 = 432hz)",
     // description: "Advocating for natural tuning that resonates with human consciousness and nature."
    },
    {
      icon: <Heart className="h-8 w-8 text-pink-400" />,
      title: "Promote Healing and Communication Through Music",
      //description: "We believe music has the power to heal and connect people across all boundaries."
    },
    {
      icon: <Shield className="h-8 w-8 text-indigo-400" />,
      title: "Support Sound Healing Initiatives + Wellness Venues",
     // description: "Integrating music therapy and healing practices into our platform and community."
    }
  ];

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="bg-gradient-to-b from-indigo-900 via-purple-900 to-indigo-800 text-white relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="text-center">
            
            {/* Social Music Democracy Badge */}
            <div className="flex justify-center mb-8">
              <div className="bg-gradient-to-r from-purple-700 to-purple-800 px-6 py-3 rounded-full flex items-center space-x-2 shadow-lg">
                <Zap className="h-5 w-5 text-yellow-400" />
                <span className="text-white text-xl font-semibold">The Social Music App</span>
              </div>
            </div>
            
            {/* Main Title */}
            <h1 className="text-5xl md:text-7xl font-bold p-6 leading-tight">
              <span className="text-white">Musical</span>
              <br />
              <span className="text-pink-400">Democracy</span>
            </h1>
            
            {/* Description */}
            <p className="text-xl md:text-2xl p-12 text-gray-200 max-w-3xl mx-auto leading-relaxed" style={{ marginTop: '20px' }}>
              Support Your Favourite Artists - Contribute To Global Charts
            </p>
            
            {/* CTA Button */}
            <div className="flex justify-center">
              <Link
                to="/register"
                className="text-white rounded-lg p-4 m-6 border-2 border-white font-semibold hover:bg-gray-100 transition-colors text-lg"
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
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="text-center group">
              <div className="bg-green-600/20 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 border-2 border-green-500/30 group-hover:border-green-400 group-hover:bg-green-600/30 transition-all">
                <Coins className="h-10 w-10 text-green-400" />
              </div>
              <h3 className="text-xl font-bold text-white mb-3">
                Bid on Tunes
              </h3>
              <p className="text-gray-300 leading-relaxed">
                Bid to get your favorite Tunes to the top
              </p>
            </div>

            <div className="text-center group">
              <div className="bg-yellow-600/20 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 border-2 border-yellow-500/30 group-hover:border-yellow-400 group-hover:bg-yellow-600/30 transition-all">
                <Zap className="h-10 w-10 text-yellow-400" />
              </div>
              <h3 className="text-xl font-bold text-white mb-3">
                Support Artists
              </h3>
              <p className="text-gray-300 leading-relaxed">
                Artists earn most of what you bid on Tuneable
              </p>
            </div>
            <div className="text-center group">
              <div className="bg-purple-600/20 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 border-2 border-purple-500/30 group-hover:border-purple-400 group-hover:bg-purple-600/30 transition-all">
                <Music className="h-10 w-10 text-purple-400" />
              </div>
              <h3 className="text-xl font-bold text-white mb-3">
                Earn TuneBytes
              </h3>
              <p className="text-gray-300 leading-relaxed">
                Get rewarded for discovering popular music
              </p>
            </div>

            <div className="text-center group">
              <div className="bg-blue-600/20 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 border-2 border-blue-500/30 group-hover:border-blue-400 group-hover:bg-blue-600/30 transition-all">
                <Users className="h-10 w-10 text-blue-400" />
              </div>
              <h3 className="text-xl font-bold text-white mb-3">
                Discover Music
              </h3>
              <p className="text-gray-300 leading-relaxed">
                Find music from all around the world
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* Our Mission Section */}
      <section className="bg-gradient-to-br from-indigo-900 via-purple-900 to-indigo-800 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Our Mission
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {aims.map((aim, index) => (
              <div key={index} className="bg-white/10 backdrop-blur-sm rounded-xl p-8 border border-white/20 hover:bg-white/15 hover:border-white/30 transition-all text-center">
                <div className="flex justify-center mb-4">
                  {aim.icon}
                </div>
                <h3 className="text-xl font-semibold text-white mb-3">
                  {aim.title}
                </h3>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Community Interest Company Section */}
      <section className="bg-gradient-to-br from-purple-900 via-indigo-900 to-purple-800 py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-12 border border-white/20">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
              Community Interest Company
            </h2>
            <p className="text-xl text-gray-200 leading-relaxed mb-8">
              As a registered CIC, Tuneable is legally committed to using its assets and profits 
              for the benefit of the community. Not driven by shareholder returns, but a 
               mission to create positive social impact through music.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 border border-white/20 text-center">
                <div className="flex justify-center mb-3">
                  <Users2 className="h-6 w-6 text-blue-400" />
                </div>
                <h3 className="font-semibold text-white mb-2">Community First</h3>
                <p className="text-gray-300 text-sm">Profits Reinvested</p>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 border border-white/20 text-center">
                <div className="flex justify-center mb-3">
                  <Eye className="h-6 w-6 text-green-400" />
                </div>
                <h3 className="font-semibold text-white mb-2">Transparency</h3>
                <p className="text-gray-300 text-sm">Open Governance</p>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 border border-white/20 text-center">
                <div className="flex justify-center mb-3">
                  <Target className="h-6 w-6 text-purple-400" />
                </div>
                <h3 className="font-semibold text-white mb-2">Social Mission</h3>
                <p className="text-gray-300 text-sm">Community Benefit</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Join Our Musical Evolution
          </h2>
        
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link
              to="/register"
              className="bg-white text-purple-600 px-8 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
            >
              Get Started
            </Link>
            <Link
              to="/parties"
              className="border-2 border-white text-white px-8 py-3 rounded-lg font-semibold hover:bg-white hover:text-purple-600 transition-colors"
            >
              Explore Music
            </Link>
          </div>
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
                to="/help" 
                className="text-gray-400 hover:text-white transition-colors"
              >
                Help
              </Link>
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
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Home;
