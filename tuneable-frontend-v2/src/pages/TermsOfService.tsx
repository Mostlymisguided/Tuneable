import React from 'react';
import { Link } from 'react-router-dom';

const TermsOfService: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow-lg rounded-lg p-8">
          <div className="mb-8">
            <Link to="/" className="text-primary-600 hover:text-primary-500 font-medium">
              ← Back to Home
            </Link>
          </div>
          
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Terms of Service</h1>
          
          <div className="prose prose-lg max-w-none">
            <p className="text-gray-600 mb-6">
              <strong>Last updated:</strong> {new Date().toLocaleDateString()}
            </p>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">1. Acceptance of Terms</h2>
              <p className="text-gray-700 mb-4">
                By accessing or using Tuneable ("the Service"), you agree to be bound by these Terms of Service 
                ("Terms"). If you do not agree to these Terms, please do not use the Service.
              </p>
              <p className="text-gray-700">
                These Terms apply to all users of the Service, including hosts, partiers, creators, and visitors.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">2. Description of Service</h2>
              <p className="text-gray-700 mb-4">
                Tuneable is a social music platform that allows users to:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-gray-700">
                <li>Create and join music listening parties</li>
                <li>Bid on songs to influence party playlists</li>
                <li>Stream music from various platforms including YouTube, Spotify, and podcasts</li>
                <li>Connect with other music enthusiasts</li>
                <li>Manage a digital wallet for bidding on songs</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">3. User Accounts</h2>
              <div className="space-y-4 text-gray-700">
                <h3 className="text-xl font-medium text-gray-900">3.1 Account Creation</h3>
                <ul className="list-disc pl-6 space-y-2">
                  <li>You must be at least 13 years old to use the Service</li>
                  <li>You must provide accurate and complete information when creating an account</li>
                  <li>You are responsible for maintaining the security of your account credentials</li>
                  <li>You may create an account using email/password or through OAuth providers (Facebook, Google, SoundCloud)</li>
                </ul>

                <h3 className="text-xl font-medium text-gray-900">3.2 Account Security</h3>
                <ul className="list-disc pl-6 space-y-2">
                  <li>You are responsible for all activities that occur under your account</li>
                  <li>You must notify us immediately of any unauthorized use of your account</li>
                  <li>We reserve the right to suspend or terminate accounts that violate these Terms</li>
                </ul>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">4. Bidding and Wallet System</h2>
              <div className="space-y-4 text-gray-700">
                <h3 className="text-xl font-medium text-gray-900">4.1 Digital Wallet</h3>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Users maintain a digital wallet balance for bidding on songs</li>
                  <li>Wallet funds can be added through secure payment processing via Stripe</li>
                  <li>Wallet balances are non-refundable except as required by law</li>
                  <li>Unused wallet funds remain in your account for future use</li>
                </ul>

                <h3 className="text-xl font-medium text-gray-900">4.2 Bidding Rules</h3>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Bids are placed using your wallet balance</li>
                  <li>Bids influence song priority in party queues</li>
                  <li>Once placed, bids cannot be refunded or transferred</li>
                  <li>Hosts may set minimum bid amounts for their parties</li>
                  <li>Bids are final when confirmed and deducted from your wallet</li>
                </ul>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">5. Parties and Content</h2>
              <div className="space-y-4 text-gray-700">
                <h3 className="text-xl font-medium text-gray-900">5.1 Party Hosting</h3>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Users can create and host music parties</li>
                  <li>Hosts have control over party settings, including privacy and access codes</li>
                  <li>Hosts may moderate content and remove songs from their parties</li>
                  <li>Hosts are responsible for ensuring their parties comply with these Terms</li>
                </ul>

                <h3 className="text-xl font-medium text-gray-900">5.2 Content Guidelines</h3>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Do not share content that infringes on intellectual property rights</li>
                  <li>Do not share illegal, harmful, threatening, or abusive content</li>
                  <li>Do not engage in harassment, hate speech, or discriminatory behavior</li>
                  <li>Respect other users' privacy and personal information</li>
                </ul>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">6. Intellectual Property</h2>
              <div className="space-y-4 text-gray-700">
                <h3 className="text-xl font-medium text-gray-900">6.1 Platform Content</h3>
                <p className="mb-2">
                  The Service and its original content, features, and functionality are owned by Tuneable and are 
                  protected by international copyright, trademark, patent, trade secret, and other intellectual property laws.
                </p>

                <h3 className="text-xl font-medium text-gray-900">6.2 Third-Party Content</h3>
                <p className="mb-2">
                  Music and media content streamed through the Service is provided by third-party platforms (YouTube, Spotify, etc.). 
                  Users must comply with the terms of service of these third-party providers.
                </p>

                <h3 className="text-xl font-medium text-gray-900">6.3 User Content</h3>
                <ul className="list-disc pl-6 space-y-2">
                  <li>You retain ownership of any content you submit to the Service (comments, profile information, etc.)</li>
                  <li>By submitting content, you grant Tuneable a non-exclusive license to use, display, and distribute your content on the platform</li>
                  <li>You represent that you have the necessary rights to share any content you submit</li>
                </ul>

                <h3 className="text-xl font-medium text-gray-900">6.3.1 Upload License Agreement</h3>
                <p className="mb-2">
                  <strong>By uploading original music or media content to Tuneable, you represent and warrant that:</strong>
                </p>
                <ul className="list-disc pl-6 space-y-2 mb-4">
                  <li>You are the owner or authorized representative of all rights (composition and master) in the uploaded work</li>
                  <li>You grant Tuneable CIC a non-exclusive, worldwide, royalty-free license to host, stream, display, distribute, and monetise your content within the Tuneable platform</li>
                  <li>You indemnify Tuneable CIC against any third-party claims arising from your uploaded content</li>
                  <li>You may revoke this license at any time by written notice or account deletion, after which Tuneable will remove your content within 30 days</li>
                </ul>
                <p className="text-sm text-gray-600">
                  If you do not have the necessary rights to upload content, or if a third party claims infringement, Tuneable reserves the right to immediately remove such content without notice. 
                  You bear sole responsibility for ensuring you have all necessary permissions before uploading.
                </p>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">7. Payments and Refunds</h2>
              <div className="space-y-4 text-gray-700">
                <ul className="list-disc pl-6 space-y-2">
                  <li>All payments are processed securely through Stripe</li>
                  <li>Wallet funds are generally non-refundable</li>
                  <li>In case of technical errors, we may issue refunds at our discretion</li>
                  <li>Chargebacks may result in account suspension</li>
                  <li>All prices are displayed in GBP (£) unless otherwise stated</li>
                </ul>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">8. Prohibited Activities</h2>
              <p className="text-gray-700 mb-4">You agree not to:</p>
              <ul className="list-disc pl-6 space-y-2 text-gray-700">
                <li>Use the Service for any illegal purpose</li>
                <li>Attempt to gain unauthorized access to the Service or other users' accounts</li>
                <li>Interfere with or disrupt the Service or servers</li>
                <li>Use automated systems (bots, scrapers) without permission</li>
                <li>Manipulate bidding systems or engage in fraudulent activities</li>
                <li>Impersonate others or misrepresent your affiliation</li>
                <li>Upload malicious code or viruses</li>
                <li>Collect user information without consent</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">9. Creator and Verified Status</h2>
              <div className="space-y-4 text-gray-700">
                <p>
                  Users who add original content to the platform may be designated as "creators" and may apply for verified status. 
                  Verified status is granted at Tuneable's discretion and may be revoked at any time.
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Creators must have legitimate rights to the content they upload</li>
                  <li>Verified creators may receive benefits such as priority support and analytics</li>
                  <li>False claims of ownership may result in immediate account termination</li>
                </ul>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">10. Disclaimers and Limitations of Liability</h2>
              <div className="space-y-4 text-gray-700">
                <h3 className="text-xl font-medium text-gray-900">10.1 Service Disclaimer</h3>
                <p className="mb-2">
                  THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED. 
                  WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, SECURE, OR ERROR-FREE.
                </p>

                <h3 className="text-xl font-medium text-gray-900">10.2 Limitation of Liability</h3>
                <p className="mb-2">
                  TO THE MAXIMUM EXTENT PERMITTED BY LAW, TUNEABLE SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, 
                  CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES, WHETHER INCURRED DIRECTLY OR INDIRECTLY.
                </p>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">11. Third-Party Services</h2>
              <p className="text-gray-700 mb-4">
                The Service integrates with third-party platforms including:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-gray-700">
                <li><strong>YouTube:</strong> For music streaming (subject to YouTube Terms of Service)</li>
                <li><strong>Spotify:</strong> For music streaming (subject to Spotify Terms of Service)</li>
                <li><strong>Facebook:</strong> For OAuth authentication</li>
                <li><strong>Google:</strong> For OAuth authentication</li>
                <li><strong>SoundCloud:</strong> For OAuth authentication</li>
                <li><strong>Stripe:</strong> For payment processing</li>
              </ul>
              <p className="text-gray-700 mt-4">
                Your use of these third-party services is subject to their respective terms and privacy policies.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">12. Termination</h2>
              <div className="space-y-4 text-gray-700">
                <p>
                  We reserve the right to suspend or terminate your account at any time for:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Violation of these Terms</li>
                  <li>Fraudulent or illegal activity</li>
                  <li>Abuse of the Service or other users</li>
                  <li>Non-payment or chargebacks</li>
                  <li>Extended periods of inactivity</li>
                </ul>
                <p className="mt-4">
                  You may terminate your account at any time by contacting us. Upon termination, your right to use the Service 
                  will immediately cease, and any remaining wallet balance may be forfeited.
                </p>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">13. Privacy</h2>
              <p className="text-gray-700">
                Your use of the Service is also governed by our{' '}
                <Link to="/privacy-policy" className="text-primary-600 hover:text-primary-500 font-medium">
                  Privacy Policy
                </Link>
                , which explains how we collect, use, and protect your personal information.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">14. Changes to Terms</h2>
              <p className="text-gray-700 mb-4">
                We reserve the right to modify these Terms at any time. We will notify users of material changes by:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-gray-700">
                <li>Posting the updated Terms on this page</li>
                <li>Updating the "Last updated" date</li>
                <li>Sending email notifications to registered users (for significant changes)</li>
              </ul>
              <p className="text-gray-700 mt-4">
                Your continued use of the Service after changes are posted constitutes acceptance of the modified Terms.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">15. Governing Law</h2>
              <p className="text-gray-700">
                These Terms shall be governed by and construed in accordance with the laws of England and Wales, 
                without regard to its conflict of law provisions. Any disputes arising from these Terms or the Service 
                shall be resolved in the courts of England and Wales.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">16. Contact Information</h2>
              <p className="text-gray-700 mb-4">
                If you have any questions about these Terms of Service, please contact us:
              </p>
              <div className="mt-4 p-4 bg-gray-100 rounded-lg">
                <p className="text-gray-700">
                  <strong>Email:</strong> mostlymisguided@icloud.com<br />
                  <strong>Response Time:</strong> We will respond to all inquiries within 7 business days
                </p>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">17. Severability</h2>
              <p className="text-gray-700">
                If any provision of these Terms is found to be unenforceable or invalid, that provision will be limited or 
                eliminated to the minimum extent necessary, and the remaining provisions will remain in full force and effect.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">18. Entire Agreement</h2>
              <p className="text-gray-700">
                These Terms, together with our Privacy Policy, constitute the entire agreement between you and Tuneable 
                regarding the use of the Service and supersede any prior agreements.
              </p>
            </section>

            <div className="mt-12 pt-8 border-t border-gray-200">
              <p className="text-gray-600 text-center">
                By using Tuneable, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TermsOfService;

