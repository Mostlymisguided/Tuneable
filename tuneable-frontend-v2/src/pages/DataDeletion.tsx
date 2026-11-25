import React from 'react';
import { Link } from 'react-router-dom';

const DataDeletion: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow-lg rounded-lg p-8">
          <div className="mb-8">
            <Link to="/explore" className="text-primary-600 hover:text-primary-500 font-medium">
              ← Back to Explore
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
                You can delete your account at any time. Here is what that does:
              </p>

              <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-6">
                <div className="flex">
                  <div className="ml-3">
                    <p className="text-sm text-blue-700">
                      <strong>Important:</strong> Account deletion is permanent and cannot be undone.
                      Your sign-in details and profile are removed. Tips and payment records stay in anonymized form.
                      Unspent wallet balance is cleared and is not refunded.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">Method 1: Delete the account yourself</h2>
              <div className="space-y-4">
                <p className="text-gray-700">In the iOS or Android app:</p>
                <ol className="list-decimal pl-6 space-y-3 text-gray-700">
                  <li>Log in to your Tuneable account</li>
                  <li>Open your Profile tab</li>
                  <li>Tap the settings gear, then choose <strong>Delete account</strong></li>
                  <li>Confirm deletion twice when prompted</li>
                </ol>
                <p className="text-gray-700">On the website:</p>
                <ol className="list-decimal pl-6 space-y-3 text-gray-700">
                  <li>Log in and open your profile</li>
                  <li>Open Settings, then the Security tab</li>
                  <li>Choose <strong>Delete account</strong>, then <strong>Delete forever</strong></li>
                </ol>
                <p className="text-gray-700">
                  The account is deactivated immediately. Your name, email, phone, password, profile photo,
                  location, and connected logins are removed.
                </p>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">Method 2: Request Deletion via Email</h2>
              <div className="space-y-4">
                <p className="text-gray-700">
                  If you cannot access your account or prefer to request deletion via email:
                </p>
                <ol className="list-decimal pl-6 space-y-3 text-gray-700">
                  <li>Send an email to <strong>hi@tuneable.stream</strong></li>
                  <li>Use the subject line: "Account Deletion Request"</li>
                  <li>Include the following information:
                    <ul className="list-disc pl-6 mt-2 space-y-1">
                      <li>Your username or email address associated with the account</li>
                      <li>Your full name</li>
                      <li>Confirmation that you want to permanently delete your account</li>
                      <li>Any additional verification information if requested</li>
                    </ul>
                  </li>
                  <li>We will process your request within 30 days</li>
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
                <p className="text-gray-700">When you delete your account, we remove:</p>
                <ul className="list-disc pl-6 space-y-2 text-gray-700">
                  <li>Your name, username, email, phone number, and password</li>
                  <li>Your profile photo and connected logins (Apple, Google, Facebook, Instagram, SoundCloud, Spotify)</li>
                  <li>Saved location, social links, and creator bio</li>
                  <li>Push notification tokens</li>
                  <li>Unspent wallet balance. This is cleared and is not refunded. Spend it or, if you are a creator, request a payout before you delete the account</li>
                </ul>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">Data That May Be Retained</h2>
              <div className="space-y-4">
                <p className="text-gray-700">
                  Some records stay, attached to an anonymized account rather than your name:
                </p>
                <ul className="list-disc pl-6 space-y-2 text-gray-700">
                  <li>Tips you placed, and which parties or tunes they relate to</li>
                  <li>Wallet and payout records required for accounting and tax</li>
                  <li>Creator earnings already owed, so they can still be paid</li>
                  <li>Comments or other content you posted, which may remain visible without your profile</li>
                  <li>Records we need to keep for fraud prevention or a legal claim</li>
                </ul>
                <p className="text-gray-700 mt-4">
                  Backups of the live database are overwritten on the host&apos;s normal backup cycle. We do not run a separate 90-day purge of those backups.
                </p>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">Timeline for Deletion</h2>
              <div className="space-y-4">
                <ul className="list-disc pl-6 space-y-2 text-gray-700">
                  <li><strong>Immediate:</strong> If you delete the account in the app or on the website, sign-in stops and the profile fields above are removed then</li>
                  <li><strong>Email requests:</strong> We process these within 30 days</li>
                  <li><strong>Kept records:</strong> Tips, payment records, and unpaid creator earnings stay as described above</li>
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
                  <strong>Email:</strong> hi@tuneable.stream<br />
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
