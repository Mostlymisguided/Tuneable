import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { HelpCircle, Music, Users, CreditCard, PartyPopper, Settings, MessageCircle, Mail, Flag, Youtube, Wallet } from 'lucide-react';
import { SUPPORT_EMAIL } from '../constants';
import GeneralReportModal from '../components/GeneralReportModal';

const Help: React.FC = () => {
  const [showReportModal, setShowReportModal] = useState(false);

  const sections = [
    {
      id: 'getting-started',
      icon: <HelpCircle className="h-6 w-6" />,
      title: 'Getting Started',
      content: (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">What is Tuneable?</h3>
            <p className="text-gray-300">
              Tuneable is a music platform where you tip on tunes, influence charts, support your favorite artists and discover new music.
            </p>
            <p>
            Your tips help create charts and you earn TuneBytes by tipping on music that becomes popular on the platform.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Creating an Account</h3>
            <p className="text-gray-300">
              To get started, you'll need an invite code from an existing user. Once you have a code, 
              register with your email or social media account. New users receive £1.11 in welcome credits 
              during our beta period.
            </p>
          </div>
        </div>
      )
    },
    {
      id: 'tipping',
      icon: <CreditCard className="h-6 w-6" />,
      title: 'Tipping',
      content: (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">How Tipping Works</h3>
            <p className="text-gray-300">
              When you tip on a tune, you're voting for it to be moved up the charts. It is also added to your Library. Higher tips give tunes more weight 
              in the charts. The minimum tip is usually £0.01, but party hosts can set their own minimum.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Earning TuneBytes</h3>
            <p className="text-gray-300">
              You earn TuneByte Tokens when other users tip on tunes you've tipped on. The more your tunes get tipped on, 
              the more you earn. TuneBytes can't be spent yet but they will be tradeable for all sorts of artist swag in the future.
            </p>
          </div>
        </div>
      )
    },
    {
      id: 'parties',
      icon: <PartyPopper className="h-6 w-6" />,
      title: 'Parties',
      content: (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Joining a Party</h3>
            <p className="text-gray-300">
              Browse available parties from the Parties page. Click on any party to view the queue and 
              start tipping on tunes. You can tip tunes already in the queue or search for new tracks 
              to add.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Adding Tunes</h3>
            <p className="text-gray-300">
              Use the search feature in any party to find tunes from our library or YouTube. When adding 
              a new track, you'll be prompted to add tags to help others discover it. Set your tip amount 
              and add the tune to the queue.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Creating Parties</h3>
            <p className="text-gray-300">
              Party creation is currently limited to platform administrators. If you're interested in 
              hosting events, contact us through the admin panel or support channels.
            </p>
          </div>
        </div>
      )
    },
    {
      id: 'credit-top-ups',
      icon: <Wallet className="h-6 w-6" />,
      title: 'Credit and Top Ups',
      content: (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Adding Credit</h3>
            <p className="text-gray-300">
              You can add credit to your account through the Wallet page. We accept secure payments via 
              Stripe. Your balance is always displayed in your profile and wallet.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Managing Your Balance</h3>
            <p className="text-gray-300">
              Keep track of your credit balance, transaction history, and top-up activity in your Wallet. 
              All transactions are secure and processed through our payment provider.
            </p>
          </div>
        </div>
      )
    },
    {
      id: 'creating-content',
      icon: <Music className="h-6 w-6" />,
      title: 'Creating Content',
      content: (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Uploading Music</h3>
            <p className="text-gray-300">
              Creators can upload their own music through the Creator Dashboard. You'll need to provide 
              the track file, artwork, and metadata. Once uploaded, your tracks can be discovered and 
              tipped on by other users.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Labels</h3>
            <p className="text-gray-300">
              Labels represent record companies or music collectives. Label owners can invite admins and 
              artists, manage their catalog, and view analytics.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Collectives</h3>
            <p className="text-gray-300">
              Collectives are for bands, production companies, and creative groups. Founders can invite 
              members and admins, manage the collective's presence, and collaborate on releases.
            </p>
          </div>
        </div>
      )
    },
    {
      id: 'profiles-accounts',
      icon: <Users className="h-6 w-6" />,
      title: 'Profiles & Accounts',
      content: (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Managing Your Profile</h3>
            <p className="text-gray-300">
              Edit your profile from your user page. You can update your username, profile picture, 
              location, and bio. Your profile shows your tipping statistics, top tunes, and activity.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Privacy Settings</h3>
            <p className="text-gray-300">
              Control your privacy through your profile settings. You can manage who can see your 
              activity, tips, and profile information.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Notifications</h3>
            <p className="text-gray-300">
              Stay updated with notifications about tips, party updates, and platform activity. 
              Manage your notification preferences in your account settings.
            </p>
          </div>
        </div>
      )
    },
    {
      id: 'youtube-third-party',
      icon: <Youtube className="h-6 w-6" />,
      title: 'Youtube and Third Party Platforms',
      content: (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Adding YouTube Tracks</h3>
            <p className="text-gray-300">
              You can search for and add tracks from YouTube to parties and your library. Simply use the 
              search feature and select tracks from YouTube results. These tracks will be playable through 
              YouTube's player.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Third Party Integration</h3>
            <p className="text-gray-300">
              Tuneable integrates with various third-party platforms to provide a rich music experience. 
              Content from these platforms is subject to their respective terms of service and licensing agreements.
            </p>
          </div>
        </div>
      )
    },
    {
      id: 'troubleshooting',
      icon: <Settings className="h-6 w-6" />,
      title: 'Troubleshooting',
      content: (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Playback Issues</h3>
            <p className="text-gray-300">
              If tunes aren't playing, check your internet connection and browser settings. Make sure 
              pop-ups aren't blocked, as some media players may require this. Try refreshing the page 
              or clearing your browser cache.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Tip Not Going Through</h3>
            <p className="text-gray-300">
              Ensure you have sufficient credit in your account. Check that your tip meets the minimum 
              requirement for the party. If issues persist, try refreshing the page or logging out and 
              back in.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Account Issues</h3>
            <p className="text-gray-300">
              For account-related problems, try resetting your password or verifying your email address. 
              If you're locked out, use the "Forgot Password" feature on the login page.
            </p>
          </div>
        </div>
      )
    },
    {
      id: 'support',
      icon: <MessageCircle className="h-6 w-6" />,
      title: 'Getting Support',
      content: (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Contact Us</h3>
            <p className="text-gray-300 mb-3">
              If you need additional help, you can report issues through the platform's reporting system 
              or contact administrators through the admin panel if you have access.
            </p>
            <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-4 mt-4">
              <div className="flex items-center gap-2 mb-2">
                <Mail className="h-5 w-5 text-purple-400" />
                <span className="text-sm font-medium text-purple-300">Email Support</span>
              </div>
              <a 
                href={`mailto:${SUPPORT_EMAIL}`}
                className="text-purple-300 hover:text-purple-200 transition-colors text-lg font-semibold break-all"
              >
                {SUPPORT_EMAIL}
              </a>
            </div>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Reporting Problems</h3>
            <p className="text-gray-300 mb-4">
              Use the report feature to flag inappropriate content, technical issues, or other concerns. 
              Reports are reviewed by our moderation team.
            </p>
            <button
              onClick={() => setShowReportModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors font-medium"
            >
              <Flag className="h-5 w-5" />
              Report a Problem
            </button>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Feature Requests</h3>
            <p className="text-gray-300 mb-4">
              We're always improving Tuneable! Share your ideas and feedback through the platform. Your 
              suggestions help shape the future of Tuneable.
            </p>
            <button
              onClick={() => setShowReportModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors font-medium"
            >
              <Flag className="h-5 w-5" />
              Suggest a Feature
            </button>
          </div>
        </div>
      )
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900 py-12">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-black/30 backdrop-blur-sm border border-white/10 rounded-xl p-8 shadow-2xl">
          <div className="mb-8">
            <Link to="/" className="text-purple-300 hover:text-purple-200 font-medium transition-colors inline-flex items-center gap-2">
              ← Back to Home
            </Link>
          </div>
          
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-white mb-4 flex items-center gap-3">
              <HelpCircle className="h-10 w-10 text-purple-400" />
              Help & Support
            </h1>
            <p className="text-gray-300 text-lg">
              Everything you need to know about using Tuneable
            </p>
          </div>

          <div className="space-y-8">
            {sections.map((section) => (
              <section 
                key={section.id} 
                id={section.id}
                className="bg-gray-900/50 border border-white/10 rounded-lg p-6 hover:border-purple-500/50 transition-colors"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="text-purple-400">
                    {section.icon}
                  </div>
                  <h2 className="text-2xl font-semibold text-white">{section.title}</h2>
                </div>
                {section.content}
              </section>
            ))}
          </div>

          <div className="mt-12 pt-8 border-t border-white/10">
            <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-6">
              <h3 className="text-xl font-semibold text-white mb-3">Still Need Help?</h3>
              <p className="text-gray-300 mb-4">
                Can't find what you're looking for? Contact us directly or check out our other resources:
              </p>
              <div className="flex flex-wrap gap-4 pt-4 border-t border-purple-500/20">
                <Link 
                  to="/privacy-policy" 
                  className="text-purple-300 hover:text-purple-200 transition-colors"
                >
                  Privacy Policy
                </Link>
                <Link 
                  to="/terms-of-service" 
                  className="text-purple-300 hover:text-purple-200 transition-colors"
                >
                  Terms of Service
                </Link>
                <Link 
                  to="/data-deletion" 
                  className="text-purple-300 hover:text-purple-200 transition-colors"
                >
                  Data Deletion
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* General Report Modal */}
      <GeneralReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
      />
    </div>
  );
};

export default Help;

