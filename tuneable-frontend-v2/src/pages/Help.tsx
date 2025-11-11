import React from 'react';
import { Link } from 'react-router-dom';
import { HelpCircle, Music, Users, CreditCard, PartyPopper, Settings, MessageCircle } from 'lucide-react';

const Help: React.FC = () => {
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
              Tuneable is a music discovery and bidding platform where you can bid on songs, join parties, 
              and discover new music. Your bids help determine what gets played, and you earn credits when 
              others bid on your favorite tracks.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Creating an Account</h3>
            <p className="text-gray-300">
              To get started, you'll need an invite code from an existing user. Once you have a code, 
              register with your email or social media account. New users receive £11.11 in welcome credits 
              during our beta period.
            </p>
          </div>
        </div>
      )
    },
    {
      id: 'bidding',
      icon: <CreditCard className="h-6 w-6" />,
      title: 'Bidding & Credits',
      content: (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">How Bidding Works</h3>
            <p className="text-gray-300">
              When you bid on a song, you're voting for it to be played. Higher bids give songs more weight 
              in the queue. The minimum bid is usually £0.33, but party hosts can set their own minimum.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Earning Credits</h3>
            <p className="text-gray-300">
              You earn credits when other users bid on songs you've bid on. The more your songs get bid on, 
              the more you earn. Credits can be used to bid on more songs or withdrawn to your account.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Adding Credits</h3>
            <p className="text-gray-300">
              You can add credits to your account through the Wallet page. We accept secure payments via 
              Stripe. Your balance is always displayed in your profile and wallet.
            </p>
          </div>
        </div>
      )
    },
    {
      id: 'parties',
      icon: <PartyPopper className="h-6 w-6" />,
      title: 'Parties & Events',
      content: (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Joining a Party</h3>
            <p className="text-gray-300">
              Browse available parties from the Parties page. Click on any party to view the queue and 
              start bidding on songs. You can bid on songs already in the queue or search for new tracks 
              to add.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Adding Songs</h3>
            <p className="text-gray-300">
              Use the search feature in any party to find songs from our library or YouTube. When adding 
              a new track, you'll be prompted to add tags to help others discover it. Set your bid amount 
              and add the song to the queue.
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
      id: 'content',
      icon: <Music className="h-6 w-6" />,
      title: 'Creating Content',
      content: (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Uploading Music</h3>
            <p className="text-gray-300">
              Creators can upload their own music through the Creator Dashboard. You'll need to provide 
              the track file, artwork, and metadata. Once uploaded, your tracks can be discovered and 
              bid on by other users.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Labels</h3>
            <p className="text-gray-300">
              Labels represent record companies or music collectives. Label owners can invite admins and 
              artists, manage their catalog, and view analytics. You can create multiple labels if needed.
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
      id: 'profile',
      icon: <Users className="h-6 w-6" />,
      title: 'Profile & Account',
      content: (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Managing Your Profile</h3>
            <p className="text-gray-300">
              Edit your profile from your user page. You can update your username, profile picture, 
              location, and bio. Your profile shows your bidding statistics, top tunes, and activity.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Privacy Settings</h3>
            <p className="text-gray-300">
              Control your privacy through your profile settings. You can manage who can see your 
              activity, bids, and profile information.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Notifications</h3>
            <p className="text-gray-300">
              Stay updated with notifications about bids, party updates, and platform activity. 
              Manage your notification preferences in your account settings.
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
              If songs aren't playing, check your internet connection and browser settings. Make sure 
              pop-ups aren't blocked, as some media players may require this. Try refreshing the page 
              or clearing your browser cache.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Bid Not Going Through</h3>
            <p className="text-gray-300">
              Ensure you have sufficient credits in your account. Check that your bid meets the minimum 
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
            <p className="text-gray-300">
              If you need additional help, you can report issues through the platform's reporting system 
              or contact administrators through the admin panel if you have access.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Reporting Problems</h3>
            <p className="text-gray-300">
              Use the report feature to flag inappropriate content, technical issues, or other concerns. 
              Reports are reviewed by our moderation team.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Feature Requests</h3>
            <p className="text-gray-300">
              We're always improving Tuneable! Share your ideas and feedback through the platform. Your 
              suggestions help shape the future of Tuneable.
            </p>
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
                Can't find what you're looking for? Check out our other resources:
              </p>
              <div className="flex flex-wrap gap-4">
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
    </div>
  );
};

export default Help;

