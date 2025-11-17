import React from 'react';
import { Link } from 'react-router-dom';

const PrivacyPolicy: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow-lg rounded-lg p-8">
          <div className="mb-8">
            <Link to="/" className="text-primary-600 hover:text-primary-500 font-medium">
              ← Back to Home
            </Link>
          </div>
          
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Privacy Policy</h1>
          
          <div className="prose prose-lg max-w-none">
            <p className="text-gray-600 mb-6">
              <strong>Last updated:</strong> {new Date().toLocaleDateString()}
            </p>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">1. Information We Collect</h2>
              <div className="space-y-4 text-gray-700">
                <h3 className="text-xl font-medium text-gray-900">1.1 Account Information</h3>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Username, email address, and password (for traditional accounts)</li>
                  <li>Profile information including name, profile picture, and location</li>
                  <li>OAuth provider information (Facebook, Google, SoundCloud, Instagram) when using social login</li>
                  <li>Creator profile information (for verified artists and creators)</li>
                </ul>

                <h3 className="text-xl font-medium text-gray-900">1.2 Usage Data</h3>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Music preferences and listening history</li>
                  <li>Party participation, song bids, and queue interactions</li>
                  <li>Payment and transaction information (processed securely through Stripe)</li>
                  <li>Device information, IP address, and browser type</li>
                  <li>Platform usage patterns and feature interactions</li>
                </ul>

                <h3 className="text-xl font-medium text-gray-900">1.3 YouTube Data API Information</h3>
                <p className="mb-2">
                  Tuneable uses the YouTube Data API to access publicly available video metadata in compliance with YouTube's Terms of Service 
                  and API Services Terms. We collect and store:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Video titles, descriptions, and thumbnails (for display and search purposes only)</li>
                  <li>Video duration, channel information, and publication dates</li>
                  <li>YouTube video IDs and URLs (for embedding the official YouTube player)</li>
                  <li>Video category and basic metadata (for content organization)</li>
                </ul>
                <p className="mb-2 mt-4">
                  <strong>Important:</strong>
                </p>
                <ul className="list-disc pl-6 space-y-2 mb-4">
                  <li>Tuneable does <strong>not</strong> collect or store any personal information from YouTube users or YouTube account holders</li>
                  <li>We only access publicly available metadata through the YouTube Data API</li>
                  <li>We do <strong>not</strong> download, store, or rehost any video or audio content from YouTube</li>
                  <li>We do <strong>not</strong> access private or unlisted YouTube videos</li>
                  <li>Video metadata is used solely for platform functionality (display, search, queueing) and is not sold or shared with third parties</li>
                  <li>Playback uses the official YouTube embedded player only (user-initiated)</li>
                  <li>We comply with YouTube API quota limits and usage policies</li>
                </ul>
                <p className="mb-2">
                  <strong>Data Processing Basis:</strong> We process YouTube metadata under our legitimate interest to provide platform functionality 
                  and facilitate user-initiated content discovery and playback. This processing is necessary for the operation of our social music 
                  platform and does not infringe on YouTube users' privacy rights.
                </p>
                <p className="mb-2">
                  <strong>Compliance:</strong> If YouTube or Google requests that we modify or cease using YouTube Data API content, we will comply 
                  immediately. In such cases, we may transition to alternative metadata sources (MusicBrainz, Discogs, Spotify API, Apple Music API, 
                  SoundCloud, ISRC databases, or user-submitted metadata) while maintaining platform functionality.
                </p>

                <h3 className="text-xl font-medium text-gray-900">1.4 Artist Revenue and Escrow Data</h3>
                <p className="mb-2">
                  For artists and rights-holders who claim revenue or have funds in escrow, we collect and process:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Identity verification documents (government-issued ID) - stored securely and encrypted</li>
                  <li>Proof of rights ownership (contracts, ISRC codes, distribution agreements, label affiliations)</li>
                  <li>Payment and banking information for payouts (processed securely through Stripe)</li>
                  <li>Tax information (as required by UK tax law and financial regulations)</li>
                  <li>Revenue and transaction history (for escrow management and payout processing)</li>
                  <li>Contact information for artist verification and payout communications</li>
                </ul>
                <p className="mb-2 mt-4">
                  <strong>Escrow Data Processing:</strong>
                </p>
                <ul className="list-disc pl-6 space-y-2 mb-4">
                  <li>All artist revenue is held in segregated escrow accounts until claimed by the artist or rights-holder</li>
                  <li>Escrow data is processed under our legitimate interest to fulfill our contractual obligations to artists and maintain 
                  financial records as required by law</li>
                  <li>Identity verification documents are processed under legal obligation (anti-fraud and financial compliance requirements)</li>
                  <li>Escrow information is retained for 3 years from the date of the first tip/bid, or until claimed by the artist</li>
                  <li>Unclaimed funds after 3 years may be donated to registered music charities (as outlined in our Terms of Service)</li>
                </ul>
                <p className="mb-2">
                  <strong>Security:</strong> All artist escrow data is stored securely with encryption at rest and in transit. Access is restricted 
                  to authorized personnel only on a need-to-know basis for payout processing and verification purposes.
                </p>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">2. How We Use Your Information</h2>
              <div className="space-y-4 text-gray-700">
                <h3 className="text-xl font-medium text-gray-900">2.1 Service Provision</h3>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Provide and maintain our social music platform and party services</li>
                  <li>Process payments, manage wallet balances, and handle transactions</li>
                  <li>Enable social features like party creation, participation, and bidding</li>
                  <li>Display media metadata and facilitate user-initiated playback through official third-party players</li>
                </ul>

                <h3 className="text-xl font-medium text-gray-900">2.2 Artist Revenue Management</h3>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Maintain escrow accounts for artist revenue</li>
                  <li>Process artist payouts and verify rights ownership</li>
                  <li>Calculate and distribute revenue shares</li>
                  <li>Comply with tax and financial reporting requirements</li>
                </ul>

                <h3 className="text-xl font-medium text-gray-900">2.3 Platform Improvement</h3>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Analyze usage patterns to improve our services</li>
                  <li>Develop new features and functionality</li>
                  <li>Conduct research and analytics (in anonymized form)</li>
                </ul>

                <h3 className="text-xl font-medium text-gray-900">2.4 Communication and Support</h3>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Send account-related notifications and updates</li>
                  <li>Respond to user inquiries and support requests</li>
                  <li>Send important service announcements (with opt-out options for marketing communications)</li>
                </ul>

                <h3 className="text-xl font-medium text-gray-900">2.5 Security and Compliance</h3>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Ensure platform security and prevent fraud</li>
                  <li>Comply with legal obligations and regulatory requirements</li>
                  <li>Enforce our Terms of Service and community guidelines</li>
                  <li>Protect the rights and safety of users and third parties</li>
                </ul>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">3. Information Sharing</h2>
              <div className="space-y-4 text-gray-700">
                <p className="mb-4">
                  <strong>Tuneable does not sell your personal information.</strong> We may share your information only in the following circumstances:
                </p>
                
                <h3 className="text-xl font-medium text-gray-900">3.1 With Your Consent</h3>
                <p className="mb-2">
                  We share information when you explicitly agree to share it, such as when you:
                </p>
                <ul className="list-disc pl-6 space-y-2 mb-4">
                  <li>Connect your account to third-party services</li>
                  <li>Participate in public parties or share content</li>
                  <li>Opt-in to specific features that require data sharing</li>
                </ul>

                <h3 className="text-xl font-medium text-gray-900">3.2 Service Providers</h3>
                <p className="mb-2">
                  We share information with trusted third-party service providers who help us operate our platform:
                </p>
                <ul className="list-disc pl-6 space-y-2 mb-4">
                  <li><strong>Stripe:</strong> Payment processing and financial transactions (see Stripe's privacy policy)</li>
                  <li><strong>OAuth Providers:</strong> Facebook, Google, SoundCloud, Instagram for authentication (see their respective privacy policies)</li>
                  <li><strong>YouTube/Google:</strong> Access to YouTube Data API for metadata (see Google's privacy policy)</li>
                  <li><strong>Hosting Providers:</strong> Cloud infrastructure and data storage services</li>
                  <li><strong>Analytics Services:</strong> Platform usage analytics (in anonymized form where possible)</li>
                </ul>
                <p className="mb-2">
                  All service providers are contractually obligated to protect your information and use it only for the purposes we specify.
                </p>

                <h3 className="text-xl font-medium text-gray-900">3.3 Legal Requirements</h3>
                <p className="mb-2">
                  We may share information when required by law, including:
                </p>
                <ul className="list-disc pl-6 space-y-2 mb-4">
                  <li>Responding to valid legal requests, subpoenas, or court orders</li>
                  <li>Complying with tax, financial, or regulatory reporting requirements</li>
                  <li>Protecting our rights, property, or safety, or that of our users</li>
                  <li>Investigating potential violations of our Terms of Service</li>
                </ul>

                <h3 className="text-xl font-medium text-gray-900">3.4 Business Transfers</h3>
                <p className="mb-2">
                  In the event of a merger, acquisition, or sale of assets, your information may be transferred to the acquiring entity. 
                  We will notify you of any such change in ownership and provide you with options regarding your data.
                </p>

                <h3 className="text-xl font-medium text-gray-900">3.5 Artist Revenue Information</h3>
                <p className="mb-2">
                  For artists receiving revenue payouts, we may share limited information with:
                </p>
                <ul className="list-disc pl-6 space-y-2 mb-4">
                  <li>Payment processors (Stripe) for payout processing</li>
                  <li>Tax authorities as required by law</li>
                  <li>Financial institutions for payment verification</li>
                </ul>
                <p className="mb-2">
                  We do not share detailed revenue information publicly without your explicit consent.
                </p>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">4. Data Security</h2>
              <p className="text-gray-700 mb-4">
                We implement appropriate security measures to protect your personal information against unauthorized access, 
                alteration, disclosure, or destruction. This includes:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-gray-700">
                <li>Encryption of sensitive data in transit and at rest</li>
                <li>Secure authentication and authorization systems</li>
                <li>Regular security audits and updates</li>
                <li>Limited access to personal information on a need-to-know basis</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">5. Your Rights (GDPR/UK GDPR)</h2>
              <div className="space-y-4 text-gray-700">
                <p className="mb-4">
                  Under the General Data Protection Regulation (GDPR) and UK GDPR, you have the following rights regarding your personal data:
                </p>

                <h3 className="text-xl font-medium text-gray-900">5.1 Right of Access</h3>
                <p className="mb-2">
                  You have the right to request a copy of all personal information we hold about you. To request your data, 
                  contact us at <strong>hi@tuneable.stream</strong> with the subject line "Data Access Request".
                </p>

                <h3 className="text-xl font-medium text-gray-900">5.2 Right to Rectification</h3>
                <p className="mb-2">
                  You can update most of your personal information directly through your account settings. For information 
                  that cannot be updated through your account, contact us to request corrections.
                </p>

                <h3 className="text-xl font-medium text-gray-900">5.3 Right to Erasure ("Right to be Forgotten")</h3>
                <p className="mb-2">
                  You can request deletion of your account and associated personal data. We will delete your data within 30 days, 
                  except where we are required to retain it for:
                </p>
                <ul className="list-disc pl-6 space-y-2 mb-4">
                  <li>Legal or regulatory compliance (e.g., financial records, tax information)</li>
                  <li>Ongoing legal proceedings or disputes</li>
                  <li>Artist revenue escrow obligations (funds will be handled according to our escrow terms)</li>
                </ul>

                <h3 className="text-xl font-medium text-gray-900">5.4 Right to Restrict Processing</h3>
                <p className="mb-2">
                  You can request that we limit how we use your personal data in certain circumstances, such as when you 
                  contest the accuracy of the data or object to its processing.
                </p>

                <h3 className="text-xl font-medium text-gray-900">5.5 Right to Data Portability</h3>
                <p className="mb-2">
                  You can request a copy of your data in a structured, machine-readable format. This includes your account 
                  information, usage data, and transaction history.
                </p>

                <h3 className="text-xl font-medium text-gray-900">5.6 Right to Object</h3>
                <p className="mb-2">
                  You can object to processing of your personal data for:
                </p>
                <ul className="list-disc pl-6 space-y-2 mb-4">
                  <li>Direct marketing purposes (you can opt out in your account settings)</li>
                  <li>Legitimate interests processing (we will consider your objection and may stop processing if appropriate)</li>
                </ul>

                <h3 className="text-xl font-medium text-gray-900">5.7 Right to Withdraw Consent</h3>
                <p className="mb-2">
                  Where we process your data based on consent, you can withdraw that consent at any time. This will not affect 
                  the lawfulness of processing that occurred before your withdrawal.
                </p>

                <h3 className="text-xl font-medium text-gray-900">5.8 Exercising Your Rights</h3>
                <p className="mb-2">
                  To exercise any of these rights, contact us at <strong>hi@tuneable.stream</strong>. We will respond to your 
                  request within 30 days (or sooner if required by law). We may need to verify your identity before processing 
                  your request.
                </p>
                <p className="mb-2">
                  If you are not satisfied with our response, you have the right to lodge a complaint with the UK Information 
                  Commissioner's Office (ICO) or your local data protection authority.
                </p>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">6. Third-Party Services</h2>
              <div className="space-y-4 text-gray-700">
                <p className="mb-4">
                  Our platform integrates with third-party services. When you use these services, their privacy policies apply:
                </p>
                
                <h3 className="text-xl font-medium text-gray-900">6.1 Authentication Services</h3>
                <ul className="list-disc pl-6 space-y-2 mb-4">
                  <li><strong>Facebook:</strong> OAuth authentication - <a href="https://www.facebook.com/privacy" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:text-primary-500">Facebook Privacy Policy</a></li>
                  <li><strong>Google:</strong> OAuth authentication - <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:text-primary-500">Google Privacy Policy</a></li>
                  <li><strong>SoundCloud:</strong> OAuth authentication - <a href="https://soundcloud.com/pages/privacy" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:text-primary-500">SoundCloud Privacy Policy</a></li>
                  <li><strong>Instagram:</strong> OAuth authentication - <a href="https://help.instagram.com/519522125107875" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:text-primary-500">Instagram Privacy Policy</a></li>
                </ul>

                <h3 className="text-xl font-medium text-gray-900">6.2 Payment Processing</h3>
                <ul className="list-disc pl-6 space-y-2 mb-4">
                  <li><strong>Stripe:</strong> Payment processing and financial transactions - <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:text-primary-500">Stripe Privacy Policy</a></li>
                  <li>Stripe processes payment information securely and in compliance with PCI DSS standards</li>
                  <li>Tuneable does not store full credit card numbers or sensitive payment details</li>
                </ul>

                <h3 className="text-xl font-medium text-gray-900">6.3 Content and Media Services</h3>
                <ul className="list-disc pl-6 space-y-2 mb-4">
                  <li><strong>YouTube/Google:</strong> YouTube Data API for metadata access and embedded player - <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:text-primary-500">Google Privacy Policy</a></li>
                  <li>Tuneable uses YouTube Data API to access publicly available video metadata only (in compliance with YouTube Terms of Service)</li>
                  <li>Playback uses the official YouTube embedded player (user-initiated only)</li>
                  <li>Tuneable does not collect personal information from YouTube users or YouTube account holders</li>
                  <li>We do not download, store, or rehost any YouTube content</li>
                  <li>We comply with YouTube API quota limits and usage policies</li>
                  <li>If YouTube restricts API access, we will transition to alternative metadata sources (see Terms of Service section 2.1.2)</li>
                </ul>

                <h3 className="text-xl font-medium text-gray-900">6.4 Data Processing by Third Parties</h3>
                <p className="mb-2">
                  When you use third-party services through Tuneable:
                </p>
                <ul className="list-disc pl-6 space-y-2 mb-4">
                  <li>Your interactions with these services are subject to their privacy policies</li>
                  <li>We encourage you to review their privacy policies before using these services</li>
                  <li>Tuneable is not responsible for the privacy practices of third-party services</li>
                  <li>You can control which third-party services you connect to your Tuneable account</li>
                </ul>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">7. Data Retention</h2>
              <div className="space-y-4 text-gray-700">
                <h3 className="text-xl font-medium text-gray-900">7.1 General Data Retention</h3>
                <p className="mb-2">
                  We retain your personal information for as long as necessary to:
                </p>
                <ul className="list-disc pl-6 space-y-2 mb-4">
                  <li>Provide our services to you</li>
                  <li>Comply with legal obligations and regulatory requirements</li>
                  <li>Resolve disputes and enforce our agreements</li>
                  <li>Maintain security and prevent fraud</li>
                </ul>

                <h3 className="text-xl font-medium text-gray-900">7.2 Account Deletion</h3>
                <p className="mb-2">
                  When you delete your account, we will delete your personal information within 30 days, except where we are required 
                  to retain it for:
                </p>
                <ul className="list-disc pl-6 space-y-2 mb-4">
                  <li>Legal or regulatory compliance (e.g., financial records, tax information)</li>
                  <li>Ongoing legal proceedings or disputes</li>
                  <li>Artist revenue escrow obligations (funds held in escrow for 3 years as outlined in our Terms of Service)</li>
                  <li>Fraud prevention and security purposes</li>
                </ul>

                <h3 className="text-xl font-medium text-gray-900">7.3 Artist Revenue Data</h3>
                <p className="mb-2">
                  For artists receiving revenue payouts, we retain:
                </p>
                <ul className="list-disc pl-6 space-y-2 mb-4">
                  <li>Financial records and transaction history: 7 years (as required by UK tax law)</li>
                  <li>Identity verification documents: Until account closure + 7 years</li>
                  <li>Escrow account information: 3 years from last transaction or until claimed</li>
                </ul>

                <h3 className="text-xl font-medium text-gray-900">7.4 Anonymized Data</h3>
                <p className="mb-2">
                  We may retain anonymized, aggregated data indefinitely for analytics, research, and platform improvement purposes. 
                  This data cannot be used to identify individual users.
                </p>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">8. Children's Privacy</h2>
              <p className="text-gray-700">
                Our services are not intended for children under 13 years of age. We do not knowingly collect personal information 
                from children under 13. If you are a parent or guardian and believe your child has provided us with personal information, 
                please contact us immediately.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">9. Changes to This Policy</h2>
              <p className="text-gray-700">
                We may update this privacy policy from time to time. We will notify you of any changes by posting the new privacy policy 
                on this page and updating the "Last updated" date. We encourage you to review this privacy policy periodically.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">10. Related Policies</h2>
              <p className="text-gray-700">
                Please also review our{' '}
                <Link to="/terms-of-service" className="text-primary-600 hover:text-primary-500 font-medium">
                  Terms of Service
                </Link>
                {' '}which govern your use of the Tuneable platform.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">11. International Data Transfers</h2>
              <div className="space-y-4 text-gray-700">
                <p className="mb-2">
                  Tuneable is a UK-based Community Interest Company. Your data is primarily processed and stored in the United Kingdom 
                  and European Economic Area (EEA). However, some of our service providers may process data outside the UK/EEA:
                </p>
                <ul className="list-disc pl-6 space-y-2 mb-4">
                  <li><strong>Stripe:</strong> Payment processing may involve data transfer to the United States (protected by Stripe's 
                  compliance with international data protection standards)</li>
                  <li><strong>Cloud Infrastructure:</strong> Our hosting providers may store data in various locations (protected by 
                  appropriate safeguards)</li>
                  <li><strong>OAuth Providers:</strong> Authentication services may process data in their respective jurisdictions</li>
                </ul>
                <p className="mb-2">
                  We ensure that all international data transfers are protected by appropriate safeguards, including:
                </p>
                <ul className="list-disc pl-6 space-y-2 mb-4">
                  <li>Standard Contractual Clauses (SCCs) approved by the European Commission</li>
                  <li>Service providers' compliance with GDPR-equivalent data protection standards</li>
                  <li>Regular security audits and assessments</li>
                </ul>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">12. Data Controller Information</h2>
              <div className="space-y-4 text-gray-700">
                <p className="mb-2">
                  <strong>Tuneable CIC</strong> is the data controller for your personal information. As a UK Community Interest Company, 
                  we are committed to protecting your privacy and complying with UK GDPR and EU GDPR requirements.
                </p>
                <p className="mb-2">
                  <strong>Our Commitment:</strong> As a UK Community Interest Company (CIC), Tuneable exists to benefit the music community. 
                  We are committed to:
                </p>
                <ul className="list-disc pl-6 space-y-2 mb-4">
                  <li>Transparency in how we collect and use your data</li>
                  <li>Minimizing data collection to what is necessary for platform functionality and legal compliance</li>
                  <li>Protecting your privacy rights in accordance with UK GDPR and EU GDPR</li>
                  <li>Using your data to support artists and the music community (in line with our CIC objectives)</li>
                  <li>Not selling your personal information to third parties</li>
                  <li>Maintaining secure, segregated escrow accounts for artist revenue</li>
                  <li>Complying with all applicable data protection laws and regulations</li>
                </ul>
                <p className="mb-2">
                  <strong>CIC Reporting:</strong> As a CIC, we are required to file annual community interest reports. These reports may include 
                  anonymized, aggregated data about platform usage and revenue distribution, but will not include personally identifiable 
                  information about individual users.
                </p>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">13. Contact Us</h2>
              <p className="text-gray-700 mb-4">
                If you have any questions about this privacy policy, our data practices, or wish to exercise your data protection rights, 
                please contact us:
              </p>
              <div className="mt-4 p-4 bg-gray-100 rounded-lg">
                <p className="text-gray-700 mb-2">
                  <strong>Email:</strong> hi@tuneable.stream<br />
                  <strong>Alternative Email:</strong> mostlymisguided@icloud.com<br />
                  <strong>Response Time:</strong> We will respond to all privacy inquiries within 7 business days<br />
                  <strong>Data Protection Officer:</strong> Contact via the email addresses above
                </p>
                <p className="text-gray-700 mt-4">
                  <strong>UK Information Commissioner's Office (ICO):</strong><br />
                  If you are not satisfied with our response, you can lodge a complaint with the ICO:<br />
                  Website: <a href="https://ico.org.uk" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:text-primary-500">ico.org.uk</a><br />
                  Phone: 0303 123 1113
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
