import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  BookOpen,
  Headphones,
  Heart,
  Globe,
  Library,
  Music,
  Users,
  Shield,
  Waves,
  Coins,
  Zap,
  Percent,
  Landmark,
  Vote,
} from 'lucide-react';

const About: React.FC = () => {
  const { hash } = useLocation();

  useEffect(() => {
    if (!hash) return;
    const id = hash.replace('#', '');
    const scrollToHash = () => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    const timer = window.setTimeout(scrollToHash, 50);
    return () => window.clearTimeout(timer);
  }, [hash]);

  const aims = [
    {
      icon: <Heart className="h-8 w-8 text-pink-500" />,
      title: 'Promote healing and communication through music',
      description:
        'We believe music has the power to heal and connect people across all boundaries.',
    },
    {
      icon: <Globe className="h-8 w-8 text-blue-500" />,
      title: 'Democratically and transparently chart the global music catalogue',
      description:
        'Creating a fair and open system for discovering and promoting music worldwide.',
    },
    {
      icon: <Music className="h-8 w-8 text-purple-500" />,
      title: 'Empower artists by encouraging users to pay a fair price for music',
      description:
        'Supporting creators through fair compensation and direct fan engagement.',
    },
    {
      icon: <Waves className="h-8 w-8 text-green-500" />,
      title:
        'Promote the adoption of more resonant musical tuning standards such as A4 = 432hz',
      description:
        'Advocating for natural tuning that resonates with human consciousness and nature.',
    },
    {
      icon: <Users className="h-8 w-8 text-orange-500" />,
      title: 'Provide participatory musical experiences in public and private spaces',
      description:
        'Creating inclusive spaces where everyone can contribute to the musical experience.',
    },
    {
      icon: <Shield className="h-8 w-8 text-indigo-500" />,
      title: 'Support sound healing initiatives + mobile and floating wellness venues',
      description:
        'Integrating music therapy and healing practices into our platform and community.',
    },
  ];

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="bg-gradient-to-b from-indigo-900 via-purple-900 to-indigo-800 text-white relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="text-center">
            <h1 className="text-5xl md:text-7xl font-bold p-6 leading-tight">
              <span className="text-white">Tip What</span>
              <br />
              <span className="text-pink-400">You Love</span>
            </h1>
            <p
              className="text-xl md:text-2xl p-12 text-gray-200 max-w-3xl mx-auto leading-relaxed"
              style={{ marginTop: '20px' }}
            >
              Tip Your Favourite Media - Support Your Favourite Creators - Influence Global
              Charts
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4 m-6">
              <Link
                to="/party/global?period=all-time"
                className="text-white rounded-lg p-4 border-2 border-white font-semibold hover:bg-gray-100 hover:text-gray-900 transition-colors text-lg text-center"
              >
                Charts
              </Link>
              <Link
                to="/places"
                className="text-white rounded-lg p-4 border-2 border-white font-semibold hover:bg-gray-100 hover:text-gray-900 transition-colors text-lg text-center"
              >
                Places
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* The idea */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold text-gray-900 md:text-4xl">The idea</h2>
            <p className="mt-3 text-lg text-gray-600">A public shelf for your taste.</p>
          </div>

          <div className="grid grid-cols-3 gap-3 sm:gap-6">
            {[
              { icon: Music, label: 'Music', panel: 'bg-purple-100 text-purple-600' },
              { icon: Headphones, label: 'Podcasts', panel: 'bg-pink-100 text-pink-600' },
              { icon: BookOpen, label: 'Books', panel: 'bg-indigo-100 text-indigo-600' },
            ].map(({ icon: Icon, label, panel }) => (
              <div
                key={label}
                className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
              >
                <div className={`flex h-28 items-center justify-center sm:h-40 ${panel}`}>
                  <Icon className="h-10 w-10 sm:h-14 sm:w-14" />
                </div>
                <p className="px-2 py-3 text-center text-sm font-semibold text-gray-900 sm:py-4 sm:text-base">
                  {label}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-center text-sm text-gray-500">More media as we grow.</p>

          <div className="mt-8 grid gap-3 rounded-2xl bg-gradient-to-r from-purple-50 to-indigo-50 p-4 sm:grid-cols-3 sm:p-6">
            {[
              { icon: Heart, label: 'Pays the creator' },
              { icon: Globe, label: 'Moves the charts' },
              { icon: Library, label: 'Stays on your shelf' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center justify-center gap-3 py-2">
                <Icon className="h-5 w-5 shrink-0 text-purple-600" />
                <span className="font-medium text-gray-800">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How Tuneable Works */}
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
              <h3 className="text-xl font-bold text-white mb-3">Tip on Media</h3>
              <p className="text-gray-300 leading-relaxed">Tip Your Favorite Media to the Top</p>
            </div>
            <div className="text-center group">
              <div className="bg-yellow-600/20 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 border-2 border-yellow-500/30 group-hover:border-yellow-400 group-hover:bg-yellow-600/30 transition-all">
                <Zap className="h-10 w-10 text-yellow-400" />
              </div>
              <h3 className="text-xl font-bold text-white mb-3">Support Creators</h3>
              <p className="text-gray-300 leading-relaxed">
                70% of each tip reaches artists today — 90% when we are at scale
              </p>
            </div>
            <div className="text-center group">
              <div className="bg-purple-600/20 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 border-2 border-purple-500/30 group-hover:border-purple-400 group-hover:bg-purple-600/30 transition-all">
                <Music className="h-10 w-10 text-purple-400" />
              </div>
              <h3 className="text-xl font-bold text-white mb-3">Earn TuneBytes</h3>
              <p className="text-gray-300 leading-relaxed">
                Rewards for Discovering Popular Media
              </p>
            </div>
            <div className="text-center group">
              <div className="bg-blue-600/20 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 border-2 border-blue-500/30 group-hover:border-blue-400 group-hover:bg-blue-600/30 transition-all">
                <Users className="h-10 w-10 text-blue-400" />
              </div>
              <h3 className="text-xl font-bold text-white mb-3">Discover</h3>
              <p className="text-gray-300 leading-relaxed">
                Find Music & Media from All Around the World
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CIC */}
      <section className="py-16 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-2xl p-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6 py-8">
              Community Interest Company
            </h2>
            <p className="text-xl text-gray-600 leading-relaxed mb-8">
              As a registered CIC, Tuneable is legally committed to using our assets and profits
              for the benefit of the community. We're not driven by shareholder returns, but by
              our mission to create positive social impact through music.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <div className="bg-white rounded-lg p-6 shadow-md">
                <h3 className="font-semibold text-gray-900 mb-2">Community First</h3>
                <p className="text-gray-600 text-sm">Profits reinvested in community initiatives</p>
              </div>
              <div className="bg-white rounded-lg p-6 shadow-md">
                <h3 className="font-semibold text-gray-900 mb-2">Transparent Governance</h3>
                <p className="text-gray-600 text-sm">Open reporting on our social impact</p>
              </div>
              <div className="bg-white rounded-lg p-6 shadow-md">
                <h3 className="font-semibold text-gray-900 mb-2">Social Mission</h3>
                <p className="text-gray-600 text-sm">Legally bound to community benefit</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Fair take rate */}
      <section id="how-money-works" className="py-16 bg-indigo-950 text-white scroll-mt-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">Artists keep more as we grow</h2>
            <p className="text-lg md:text-xl text-indigo-100 leading-relaxed">
              Today Tuneable keeps 30% of each tip so we can build and run the platform. That is
              higher than we want long-term. We are committed to cutting our take to{' '}
              <strong className="text-white">10% once Tuneable is running at scale</strong>, so{' '}
              <strong className="text-white">90% of every tip reaches artists</strong>. Those
              percentages are of the tip itself; card and app-store processing fees are charged
              separately by payment providers.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 mb-10">
            <div className="bg-white/10 rounded-xl p-6 border border-white/15">
              <Percent className="h-8 w-8 text-pink-400 mb-4" />
              <h3 className="font-semibold text-white mb-2">Today</h3>
              <p className="text-indigo-100 text-sm leading-relaxed">
                70% of each tip goes to the artist. 30% funds Tuneable while we are still small.
              </p>
            </div>
            <div className="bg-white/10 rounded-xl p-6 border border-white/15">
              <Coins className="h-8 w-8 text-yellow-400 mb-4" />
              <h3 className="font-semibold text-white mb-2">At scale</h3>
              <p className="text-indigo-100 text-sm leading-relaxed">
                Target 90% to artists, 10% to the platform. Our take rate is intended only to fall,
                not to rise.
              </p>
            </div>
            <div className="bg-white/10 rounded-xl p-6 border border-white/15">
              <Vote className="h-8 w-8 text-green-400 mb-4" />
              <h3 className="font-semibold text-white mb-2">At £1 billion</h3>
              <p className="text-indigo-100 text-sm leading-relaxed">
                If Tuneable ever reaches a £1 billion valuation, we commit to moving to full
                community governance — a DAO owned and steered by artists and users.
              </p>
            </div>
          </div>
          <div className="bg-white/5 rounded-xl p-6 border border-white/10 flex items-start gap-4">
            <Landmark className="h-8 w-8 text-purple-300 flex-shrink-0 mt-1" />
            <p className="text-indigo-100 leading-relaxed">
              Tuneable is a UK Community Interest Company: the point is a fairer music economy, not
              private fortune. CIC rules already constrain how much value can be extracted. Nobody
              here is building Tuneable so a founder becomes a billionaire from your tips.
            </p>
          </div>
          <div className="mt-6 bg-white/5 rounded-xl p-6 border border-white/10 flex items-start gap-4">
            <Shield className="h-8 w-8 text-pink-300 flex-shrink-0 mt-1" />
            <div>
              <h3 className="font-semibold text-white mb-2">No billionaires</h3>
              <p className="text-indigo-100 leading-relaxed">
                We pledge that Tuneable will not create billionaires. Anyone whose net worth exceeds
                £1 billion must sell their shares in Tuneable and end their involvement with the
                organisation.
              </p>
            </div>
          </div>
          <p className="text-center text-sm text-indigo-200 mt-8">
            The current split and this direction are also in our{' '}
            <Link to="/terms-of-service" className="underline hover:text-white">
              Terms of Service
            </Link>
            .
          </p>
        </div>
      </section>

      {/* Mission */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Our Mission</h2>
            <p className="text-xl text-gray-600">Building a better musical future for everyone</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {aims.map((aim, index) => (
              <div
                key={index}
                className="bg-white rounded-xl p-8 shadow-lg hover:shadow-xl transition-shadow text-center"
              >
                <div className="flex justify-center mb-4">{aim.icon}</div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">{aim.title}</h3>
                <p className="text-gray-600 leading-relaxed">{aim.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-gradient-to-r from-purple-600 to-indigo-600 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6 py-8">Join The Creative Evolution</h2>
          <p className="text-xl text-purple-100 mb-8">
            Be part of a community that's reshaping how music brings people together
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link
              to="/register"
              className="bg-white text-purple-600 px-8 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
            >
              Get Started
            </Link>
            <Link
              to="/creator/register"
              className="bg-purple-700 text-white px-8 py-3 rounded-lg font-semibold hover:bg-purple-800 transition-colors border-2 border-purple-500"
            >
              Become a Creator
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
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
              <Link to="/party/global?period=all-time" className="text-gray-400 hover:text-white transition-colors">
                Charts
              </Link>
              <Link to="/places" className="text-gray-400 hover:text-white transition-colors">
                Places
              </Link>
              <Link to="/join-us" className="text-gray-400 hover:text-white transition-colors">
                Join Us
              </Link>
              <a
                href="https://discord.gg/hwGMZV89up"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-white transition-colors"
              >
                Discord
              </a>
              <Link to="/help" className="text-gray-400 hover:text-white transition-colors">
                Help
              </Link>
              <Link
                to="/about#how-money-works"
                className="text-gray-400 hover:text-white transition-colors"
              >
                How money works
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

export default About;
