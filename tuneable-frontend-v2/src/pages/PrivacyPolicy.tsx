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
                  <li>Facebook account information (when using Facebook login)</li>
                </ul>

                <h3 className="text-xl font-medium text-gray-900">1.2 Usage Data</h3>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Music preferences and listening history</li>
                  <li>Party participation and song bids</li>
                  <li>Payment information (processed securely through Stripe)</li>
                  <li>Device information and IP address</li>
                </ul>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">2. How We Use Your Information</h2>
              <ul className="list-disc pl-6 space-y-2 text-gray-700">
                <li>Provide and maintain our music streaming and party services</li>
                <li>Process payments and manage your account balance</li>
                <li>Enable social features like party creation and participation</li>
                <li>Improve our services and develop new features</li>
                <li>Communicate with you about your account and our services</li>
                <li>Ensure platform security and prevent fraud</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">3. Information Sharing</h2>
              <div className="space-y-4 text-gray-700">
                <p>We do not sell your personal information. We may share your information only in the following circumstances:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li><strong>With your consent:</strong> When you explicitly agree to share information</li>
                  <li><strong>Service providers:</strong> With trusted third parties who help us operate our platform (e.g., Stripe for payments, Facebook for OAuth)</li>
                  <li><strong>Legal requirements:</strong> When required by law or to protect our rights and safety</li>
                  <li><strong>Business transfers:</strong> In connection with a merger, acquisition, or sale of assets</li>
                </ul>
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
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">5. Your Rights</h2>
              <p className="text-gray-700 mb-4">You have the right to:</p>
              <ul className="list-disc pl-6 space-y-2 text-gray-700">
                <li>Access and update your personal information</li>
                <li>Delete your account and associated data</li>
                <li>Opt out of certain data processing activities</li>
                <li>Request a copy of your data</li>
                <li>Withdraw consent for data processing</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">6. Third-Party Services</h2>
              <p className="text-gray-700 mb-4">
                Our platform integrates with third-party services including:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-gray-700">
                <li><strong>Facebook:</strong> For OAuth authentication (see Facebook's privacy policy)</li>
                <li><strong>Stripe:</strong> For payment processing (see Stripe's privacy policy)</li>
                <li><strong>YouTube:</strong> For music streaming (see YouTube's privacy policy)</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">7. Data Retention</h2>
              <p className="text-gray-700">
                We retain your personal information for as long as necessary to provide our services and comply with legal obligations. 
                When you delete your account, we will delete your personal information within 30 days, except where we are required 
                to retain it for legal or regulatory purposes.
              </p>
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
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">11. Contact Us</h2>
              <p className="text-gray-700">
                If you have any questions about this privacy policy or our data practices, please contact us at:
              </p>
              <div className="mt-4 p-4 bg-gray-100 rounded-lg">
                <p className="text-gray-700">
                  <strong>Email:</strong> mostlymisguided@icloud.com<br />
                  <strong>Response Time:</strong> We will respond to all privacy inquiries within 7 business days
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
