import React from 'react';
import { Link } from 'react-router-dom';

const DataDeletion: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow-lg rounded-lg p-8">
          <div className="mb-8">
            <Link to="/" className="text-primary-600 hover:text-primary-500 font-medium">
              ← Back to Home
            </Link>
          </div>
          
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Data Deletion Instructions</h1>
          
          <div className="prose prose-lg max-w-none">
            <p className="text-gray-600 mb-6">
              <strong>Last updated:</strong> {new Date().toLocaleDateString()}
            </p>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">How to Delete Your Account and Data</h2>
              <p className="text-gray-700 mb-6">
                You have the right to delete your account and all associated data at any time. Here's how to do it:
              </p>

              <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-6">
                <div className="flex">
                  <div className="ml-3">
                    <p className="text-sm text-blue-700">
                      <strong>Important:</strong> Account deletion is permanent and cannot be undone. 
                      All your data, including music preferences, party history, and account balance, will be permanently removed.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">Method 1: Delete Account Through App</h2>
              <div className="space-y-4">
                <ol className="list-decimal pl-6 space-y-3 text-gray-700">
                  <li>Log in to your Tuneable account</li>
                  <li>Go to your Profile page</li>
                  <li>Click on "Account Settings" or "Privacy Settings"</li>
                  <li>Scroll down to find "Delete Account" option</li>
                  <li>Click "Delete Account" and confirm your decision</li>
                  <li>Enter your password to confirm (if applicable)</li>
                  <li>Your account and all data will be deleted within 24 hours</li>
                </ol>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">Method 2: Request Deletion via Email</h2>
              <div className="space-y-4">
                <p className="text-gray-700">
                  If you cannot access your account or prefer to request deletion via email:
                </p>
                <ol className="list-decimal pl-6 space-y-3 text-gray-700">
                  <li>Send an email to <strong>privacy@tuneable.com</strong></li>
                  <li>Use the subject line: "Account Deletion Request"</li>
                  <li>Include the following information:
                    <ul className="list-disc pl-6 mt-2 space-y-1">
                      <li>Your username or email address associated with the account</li>
                      <li>Your full name</li>
                      <li>Confirmation that you want to permanently delete your account</li>
                      <li>Any additional verification information if requested</li>
                    </ul>
                  </li>
                  <li>We will process your request within 7 business days</li>
                </ol>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">Method 3: Facebook Login Users</h2>
              <div className="space-y-4">
                <p className="text-gray-700">
                  If you signed up using Facebook login, you have additional options:
                </p>
                <ol className="list-decimal pl-6 space-y-3 text-gray-700">
                  <li><strong>Through Tuneable:</strong> Follow Method 1 or 2 above</li>
                  <li><strong>Through Facebook:</strong> 
                    <ul className="list-disc pl-6 mt-2 space-y-1">
                      <li>Go to your Facebook Settings</li>
                      <li>Click "Apps and Websites"</li>
                      <li>Find "Tuneable" in your connected apps</li>
                      <li>Click "Remove" to disconnect the app</li>
                      <li>Note: This only disconnects Facebook from Tuneable but doesn't delete your Tuneable account</li>
                    </ul>
                  </li>
                </ol>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">What Data Will Be Deleted</h2>
              <div className="space-y-4">
                <p className="text-gray-700">When you delete your account, the following data will be permanently removed:</p>
                <ul className="list-disc pl-6 space-y-2 text-gray-700">
                  <li>Account information (username, email, profile details)</li>
                  <li>Music preferences and listening history</li>
                  <li>Party participation history and song bids</li>
                  <li>Payment history and account balance</li>
                  <li>Social connections and friend lists</li>
                  <li>Profile pictures and uploaded content</li>
                  <li>Location data and preferences</li>
                  <li>All personal settings and configurations</li>
                </ul>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">Data That May Be Retained</h2>
              <div className="space-y-4">
                <p className="text-gray-700">
                  Some data may be retained for legal or regulatory purposes:
                </p>
                <ul className="list-disc pl-6 space-y-2 text-gray-700">
                  <li>Transaction records required for tax or accounting purposes</li>
                  <li>Data required to comply with legal obligations</li>
                  <li>Anonymized usage data for service improvement</li>
                  <li>Data necessary to prevent fraud or abuse</li>
                </ul>
                <p className="text-gray-700 mt-4">
                  Any retained data will be anonymized and used only for the purposes stated above.
                </p>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">Timeline for Deletion</h2>
              <div className="space-y-4">
                <ul className="list-disc pl-6 space-y-2 text-gray-700">
                  <li><strong>Immediate:</strong> Account access is disabled</li>
                  <li><strong>Within 24 hours:</strong> Personal data is removed from active systems</li>
                  <li><strong>Within 30 days:</strong> Data is removed from backup systems</li>
                  <li><strong>Within 90 days:</strong> All data is permanently deleted (except legally required data)</li>
                </ul>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">Third-Party Data</h2>
              <div className="space-y-4">
                <p className="text-gray-700">
                  If you've connected third-party services (Facebook, etc.), you may need to manage your data separately:
                </p>
                <ul className="list-disc pl-6 space-y-2 text-gray-700">
                  <li><strong>Facebook:</strong> Manage data through Facebook Settings → Apps and Websites</li>
                  <li><strong>Stripe:</strong> Payment data is managed according to Stripe's policies</li>
                </ul>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">Contact Information</h2>
              <p className="text-gray-700 mb-4">
                If you have questions about data deletion or need assistance, please contact us:
              </p>
              <div className="bg-gray-100 p-4 rounded-lg">
                <p className="text-gray-700">
                  <strong>Email:</strong>mostlymisguided@icloud.com<br />
                  <strong>Subject:</strong> Data Deletion Request<br />
                  <strong>Response Time:</strong> Within 7 business days<br />
                  <strong>Note:</strong> Please include your username or email address for faster processing
                </p>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">Your Rights</h2>
              <p className="text-gray-700 mb-4">
                Under applicable privacy laws, you have the right to:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-gray-700">
                <li>Request access to your personal data</li>
                <li>Request correction of inaccurate data</li>
                <li>Request deletion of your personal data</li>
                <li>Object to processing of your personal data</li>
                <li>Request data portability</li>
                <li>Withdraw consent for data processing</li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DataDeletion;
