import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, TrendingUp, MessageCircle, Music, Sparkles, Shield, Zap, ArrowRight, Check, Plus, Minus } from 'lucide-react';
import { paymentAPI } from '../lib/api';
import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';

const JoinUs: React.FC = () => {
  const { user } = useAuth();
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [customShares, setCustomShares] = useState(1);
  const sharePrice = 10; // £10 per share

  // Share packages - you can customize these
  const sharePackages = [
    {
      id: 'leg-up',
      name: 'Leg Up',
      shares: 1,
      price: 10,
      description: 'Get started with a single share',
      features: [
        '1 share in Tuneable',
        'Discord access',
        'Quarterly updates'
      ],
      popular: false
    },
    {
      id: 'starter',
      name: 'Starter',
      shares: 10,
      price: 100,
      description: 'Perfect for early supporters',
      features: [
        '10 shares in Tuneable',
        'Discord access',
        'Quarterly updates',
        'Early feature access'
      ],
      popular: false
    },
    {
      id: 'supporter',
      name: 'Supporter',
      shares: 50,
      price: 500,
      description: 'For dedicated music enthusiasts',
      features: [
        '50 shares in Tuneable',
        'Discord access',
        'Quarterly updates',
        'Early feature access',
        'Priority support'
      ],
      popular: true
    }
  ];

  const handlePurchase = async (packageId: string, amount: number) => {
    if (!user) {
      toast.error('Please log in to purchase shares');
      return;
    }

    setSelectedPackage(packageId);
    setIsLoading(true);
    try {
      // For now, using the existing wallet top-up endpoint
      // You'll need to create a dedicated shares purchase endpoint
      const response = await paymentAPI.createCheckoutSession(amount, 'gbp');
      
      if (response.url) {
        // Store package info in sessionStorage for after payment
        sessionStorage.setItem('pendingSharePurchase', JSON.stringify({
          packageId,
          amount,
          timestamp: Date.now()
        }));
        
        // Redirect to Stripe Checkout
        window.location.href = response.url;
      } else {
        throw new Error('No checkout URL received');
      }
    } catch (error: any) {
      console.error('Payment error:', error);
      toast.error(error.response?.data?.error || 'Failed to create payment session');
      setIsLoading(false);
      setSelectedPackage(null);
    }
  };

  const handleCustomPurchase = () => {
    const amount = customShares * sharePrice;
    if (customShares < 1) {
      toast.error('Please select at least 1 share');
      return;
    }
    if (!user) {
      toast.error('Please log in to purchase shares');
      return;
    }
    handlePurchase('custom', amount);
  };

  const handleSharesChange = (delta: number) => {
    const newShares = Math.max(1, customShares + delta);
    setCustomShares(newShares);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-900 via-purple-900 to-indigo-800">
      {/* Hero Section */}
      <section className="text-white relative overflow-hidden pt-24 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            {/* Badge */}
            <div className="flex justify-center mb-8">
              <div className="bg-gradient-to-r from-purple-700 to-pink-700 px-6 py-3 rounded-full flex items-center space-x-2 shadow-lg">
                <TrendingUp className="h-5 w-5 text-yellow-400" />
                <span className="text-white text-xl font-semibold">Join Our Journey</span>
              </div>
            </div>
            
            {/* Main Title */}
            <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
              <span className="text-white">Own a Piece of</span>
              <br />
              <span className="text-pink-400">Tuneable</span>
            </h1>
            
            {/* Description */}
            <p className="text-xl md:text-2xl text-gray-200 max-w-3xl mx-auto leading-relaxed mb-8">
              Invest in the future of music discovery. Join us in building a platform that empowers artists and connects music lovers worldwide.
            </p>
          </div>
        </div>
      </section>

      {/* Share Packages Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
              Investment Packages
            </h2>
            <p className="text-xl text-gray-300 max-w-2xl mx-auto">
              Choose the package that fits your investment goals
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-12">
            {sharePackages.map((pkg) => (
              <div
                key={pkg.id}
                className={`bg-gray-900/80 backdrop-blur-sm rounded-2xl p-8 border-2 transition-all ${
                  pkg.popular
                    ? 'border-purple-500 shadow-[0_0_30px_rgba(168,85,247,0.5)] scale-105'
                    : 'border-gray-700 hover:border-purple-500/50'
                }`}
              >
                {pkg.popular && (
                  <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-bold px-4 py-1 rounded-full inline-block mb-4">
                    Most Popular
                  </div>
                )}
                
                <h3 className="text-3xl font-bold text-white mb-2">{pkg.name}</h3>
                <p className="text-gray-400 mb-6">{pkg.description}</p>
                
                <div className="mb-6">
                  <div className="text-5xl font-bold text-white mb-2">
                    £{pkg.price.toLocaleString()}
                  </div>
                  <div className="text-gray-400">
                    {pkg.shares} shares
                  </div>
                </div>

                <ul className="space-y-3 mb-8">
                  {pkg.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start">
                      <Check className="h-5 w-5 text-green-400 mr-3 flex-shrink-0 mt-0.5" />
                      <span className="text-gray-300">{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handlePurchase(pkg.id, pkg.price)}
                  disabled={isLoading}
                  className={`w-full py-4 rounded-lg font-semibold text-lg transition-all ${
                    pkg.popular
                      ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700 shadow-lg'
                      : 'bg-gray-800 text-white hover:bg-gray-700 border border-gray-600'
                  } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {isLoading && selectedPackage === pkg.id ? 'Processing...' : 'Purchase Shares'}
                </button>
              </div>
            ))}
          </div>

          {/* Custom Amount */}
          <div className="bg-gray-900/80 backdrop-blur-sm rounded-2xl p-8 border-2 border-gray-700 max-w-2xl mx-auto">
            <h3 className="text-2xl font-bold text-white mb-4 text-center">Custom Investment</h3>
            <p className="text-gray-400 text-center mb-6">
              Choose the number of shares you'd like to purchase (£10 per share)
            </p>
            <div className="space-y-6">
              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={() => handleSharesChange(-1)}
                  disabled={customShares <= 1 || isLoading}
                  className="p-3 bg-gray-800 border border-gray-600 rounded-lg text-white hover:bg-gray-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Decrease shares"
                >
                  <Minus className="h-5 w-5" />
                </button>
                
                <div className="text-center min-w-[200px]">
                  <div className="text-4xl font-bold text-white mb-2">
                    {customShares}
                  </div>
                  <div className="text-gray-400 text-sm">
                    {customShares === 1 ? 'share' : 'shares'}
                  </div>
                  <div className="text-2xl font-semibold text-purple-400 mt-2">
                    £{(customShares * sharePrice).toLocaleString()}
                  </div>
                </div>
                
                <button
                  onClick={() => handleSharesChange(1)}
                  disabled={isLoading}
                  className="p-3 bg-gray-800 border border-gray-600 rounded-lg text-white hover:bg-gray-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Increase shares"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </div>
              
              <div className="flex justify-center">
                <button
                  onClick={handleCustomPurchase}
                  disabled={isLoading}
                  className="w-full sm:w-auto px-8 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-semibold hover:from-purple-700 hover:to-pink-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Processing...' : `Purchase ${customShares} ${customShares === 1 ? 'Share' : 'Shares'}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
              Why Invest in Tuneable?
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="bg-gray-900/60 backdrop-blur-sm rounded-xl p-6 border border-purple-500/30">
              <div className="bg-purple-600/20 w-16 h-16 rounded-full flex items-center justify-center mb-4">
                <TrendingUp className="h-8 w-8 text-purple-400" />
              </div>
              <h3 className="text-xl font-bold text-white mb-3">Growth Potential</h3>
              <p className="text-gray-300">
                Be part of a platform that's revolutionizing how music is discovered and artists are supported.
              </p>
            </div>

            <div className="bg-gray-900/60 backdrop-blur-sm rounded-xl p-6 border border-purple-500/30">
              <div className="bg-purple-600/20 w-16 h-16 rounded-full flex items-center justify-center mb-4">
                <Music className="h-8 w-8 text-purple-400" />
              </div>
              <h3 className="text-xl font-bold text-white mb-3">Support Artists</h3>
              <p className="text-gray-300">
                Your investment directly supports our mission to create fair compensation for artists worldwide.
              </p>
            </div>

            <div className="bg-gray-900/60 backdrop-blur-sm rounded-xl p-6 border border-purple-500/30">
              <div className="bg-purple-600/20 w-16 h-16 rounded-full flex items-center justify-center mb-4">
                <Users className="h-8 w-8 text-purple-400" />
              </div>
              <h3 className="text-xl font-bold text-white mb-3">Join the Community</h3>
              <p className="text-gray-300">
                Connect with other investors and music enthusiasts in our exclusive Discord community.
              </p>
            </div>

            <div className="bg-gray-900/60 backdrop-blur-sm rounded-xl p-6 border border-purple-500/30">
              <div className="bg-purple-600/20 w-16 h-16 rounded-full flex items-center justify-center mb-4">
                <Zap className="h-8 w-8 text-purple-400" />
              </div>
              <h3 className="text-xl font-bold text-white mb-3">Early Access</h3>
              <p className="text-gray-300">
                Get first access to new features and help shape the future of Tuneable.
              </p>
            </div>

            <div className="bg-gray-900/60 backdrop-blur-sm rounded-xl p-6 border border-purple-500/30">
              <div className="bg-purple-600/20 w-16 h-16 rounded-full flex items-center justify-center mb-4">
                <Shield className="h-8 w-8 text-purple-400" />
              </div>
              <h3 className="text-xl font-bold text-white mb-3">Transparent</h3>
              <p className="text-gray-300">
                Regular updates on our progress, financials, and roadmap. You'll always know where we're headed.
              </p>
            </div>

            <div className="bg-gray-900/60 backdrop-blur-sm rounded-xl p-6 border border-purple-500/30">
              <div className="bg-purple-600/20 w-16 h-16 rounded-full flex items-center justify-center mb-4">
                <Sparkles className="h-8 w-8 text-purple-400" />
              </div>
              <h3 className="text-xl font-bold text-white mb-3">Innovation</h3>
              <p className="text-gray-300">
                Support cutting-edge technology that's changing how people discover and interact with music.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-gradient-to-r from-purple-600/20 to-pink-600/20 backdrop-blur-sm rounded-2xl p-12 border-2 border-purple-500/50 text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
              Ready to Join Us?
            </h2>
            <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
              Connect with our community, become a creator, or invest in our future. Choose your path.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="https://discord.gg/hwGMZV89up"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg font-semibold text-lg hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg"
              >
                <MessageCircle className="h-5 w-5 mr-2" />
                Join Discord
                <ArrowRight className="h-5 w-5 ml-2" />
              </a>
              
              <Link
                to="/creator/register"
                className="inline-flex items-center justify-center px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-semibold text-lg hover:from-purple-700 hover:to-pink-700 transition-all shadow-lg"
              >
                <Music className="h-5 w-5 mr-2" />
                Become a Creator
                <ArrowRight className="h-5 w-5 ml-2" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer Note */}
      <section className="py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-gray-400 text-sm">
            * Investment involves risk. Please review all terms and conditions before investing. 
            Share ownership and terms are subject to our investment agreement.
          </p>
        </div>
      </section>
    </div>
  );
};

export default JoinUs;

