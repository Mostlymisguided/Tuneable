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
                <li>Tip on tunes to influence party playlists and support artists</li>
                <li>Stream music from various platforms including YouTube and podcasts</li>
                <li>Upload and host their own content (after declaring rights ownership)</li>
                <li>Connect with other music lovers</li>
                <li>Manage a digital wallet for tipping on songs</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">2.1 Platform Nature & YouTube API Usage</h2>
              <div className="space-y-4 text-gray-700">
                <h3 className="text-xl font-medium text-gray-900">2.1.1 Tuneable is Not a Streaming Service</h3>
                <p className="mb-2">
                  <strong>Tuneable CIC is a community-funded artist support platform, not a music streaming service. </strong> 
                  Tuneable facilitates fan tipping, social queueing, and artist support. Playback of media content is incidental, 
                  user-initiated, and uses official third-party players only.
                </p>
                <p className="mb-4">
                  Tuneable does <strong>not</strong>:
                </p>
                <ul className="list-disc pl-6 space-y-2 mb-4">
                  <li>Host, download, or store video or audio content from third-party sources (YouTube, etc.)</li>
                  <li>Circumvent YouTube API restrictions or terms of service</li>
                  <li>Charge users for access to YouTube or third-party content</li>
                  <li>Replace or compete with streaming services</li>
                  <li>Store or rehost any third-party media content</li>
                </ul>
                <p className="mb-4">
                  Tuneable <strong>does</strong>:
                </p>
                <ul className="list-disc pl-6 space-y-2 mb-4">
                  <li>Allow users to place monetary tips to influence social rankings and party queues</li>
                  <li>Host content uploaded by creators who have declared themselves as rights holders</li>
                  <li>Use public YouTube Data API metadata (title, artist, duration, thumbnails, links) for display purposes only</li>
                  <li>Embed the official YouTube player for user-initiated playback (per YouTube Terms of Service)</li>
                  <li>Share revenue with artists and rights-holders through an escrow and tipping system (70% to artists, 30% to platform)</li>
                  <li>Facilitate community support for musicians and creators</li>
                </ul>

                <h3 className="text-xl font-medium text-gray-900">2.1.2 YouTube Data API Usage</h3>
                <p className="mb-2">
                  Tuneable uses the YouTube Data API in compliance with YouTube's Terms of Service and API Services Terms. 
                  Our use of the API is limited to:
                </p>
                <ul className="list-disc pl-6 space-y-2 mb-4">
                  <li>Accessing video metadata (title, artist, duration, thumbnails) for display and search purposes</li>
                  <li>Linking users to YouTube creators and content</li>
                  <li>Supporting artists financially through our escrow and revenue sharing system</li>
                  <li>Using the official YouTube embedded player for playback (user-initiated only)</li>
                </ul>
                <p className="mb-2">
                  Tuneable complies with all YouTube API requirements:
                </p>
                <ul className="list-disc pl-6 space-y-2 mb-4">
                  <li>We do not charge users for access to YouTube content</li>
                  <li>We do not circumvent YouTube advertisements</li>
                  <li>We use only the official YouTube embed player</li>
                  <li>We follow YouTube branding guidelines</li>
                  <li>We do not download, store, or rehost any YouTube content</li>
                  <li>We respect YouTube API quota limits and usage policies</li>
                </ul>
                <p className="mb-2">
                  <strong>Revenue Model:</strong> Money exchanged on Tuneable is for social influence, ranking, tipping artists, 
                  and party participation—not for streaming or content access. This model is similar to Twitch Bits, TikTok Gifts, 
                  or Patreon support, where users pay to support creators and influence community features, not to access content.
                </p>
                <p className="mb-2">
                  <strong>Community Interest Company Status:</strong> As a UK Community Interest Company (CIC), Tuneable exists 
                  to increase income for musicians and rights-holders by turning passive listening into active community support. 
                  Our CIC status demonstrates that Tuneable is not exploiting third-party content commercially, but rather 
                  redistributing fan support to artists.
                </p>
                <p className="mb-2">
                  <strong>Compliance:</strong> If YouTube or Google requests that we cease using the YouTube Data API or modify 
                  our usage, we will comply immediately. Tuneable can continue operating using alternative metadata sources 
                  (MusicBrainz, Discogs, Spotify API, Apple Music API, SoundCloud, ISRC databases, user-submitted metadata, 
                  or artist uploads) while maintaining all core functionality as a queueing engine, tipping system, and 
                  social jukebox platform.
                </p>
              </div>
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
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">4. Tipping and Wallet System</h2>
              <div className="space-y-4 text-gray-700">
                <h3 className="text-xl font-medium text-gray-900">4.1 Digital Wallet</h3>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Users maintain a digital wallet balance for tipping on songs</li>
                  <li>Wallet funds can be added through secure payment processing via Stripe</li>
                  <li>Wallet balances are non-refundable except as required by law</li>
                  <li>Unused wallet funds remain in your account for future use</li>
                </ul>

                <h3 className="text-xl font-medium text-gray-900">4.2 Tipping Rules</h3>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Tips are placed using your wallet balance</li>
                  <li>Tips influence song priority in party queues and support artists</li>
                  <li>Once placed, tips cannot be refunded or transferred (except as required by law or platform policy)</li>
                  <li>Hosts may set minimum tip amounts for their parties</li>
                  <li>Tips are final when confirmed and deducted from your wallet</li>
                  <li>70% of each tip is allocated to the artist(s) via our escrow system</li>
                  <li>30% of each tip goes to Tuneable as a platform fee</li>
                </ul>

                <h3 className="text-xl font-medium text-gray-900">4.3 Artist Escrow System</h3>
                <ul className="list-disc pl-6 space-y-2">
                  <li>When users tip on media, 70% of the tip amount is allocated to the artist's escrow balance</li>
                  <li>Escrow allocations are split among media owners based on their ownership percentages</li>
                  <li>For registered artists, escrow is immediately added to their balance</li>
                  <li>For unregistered artists, escrow is stored and can be claimed when they register and verify their identity</li>
                  <li>Artists can view their escrow balance and request payouts through their dashboard</li>
                  <li>Payouts are processed manually by Tuneable staff</li>
                  <li>Revenue is accrued and reserved for creators until claimed, but not held in trust</li>
                  <li>Unclaimed allocations remain claimable indefinitely</li>
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

                <h3 className="text-xl font-medium text-gray-900">5.3 Platform Moderation Rights</h3>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Tuneable reserves the right to remove, veto, or block any media content from the platform at its sole discretion</li>
                  <li>Media may be removed for reasons including but not limited to: copyright infringement, inappropriate content, technical issues, platform policy violations, or user reports</li>
                  <li>Removed media may result in refunded tips at Tuneable's discretion</li>
                  <li>Tuneable is not obligated to provide notice before removing content, though reasonable efforts will be made to notify affected users when possible</li>
                </ul>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">5.4 Opt-Out & Takedown Procedures</h2>
              <div className="space-y-4 text-gray-700">
                <h3 className="text-xl font-medium text-gray-900">5.4.1 Artist & Rights-Holder Opt-Out</h3>
                <p className="mb-2">
                  Artists, rights-holders, or authorized representatives may request that their content be removed from Tuneable 
                  at any time. Upon receipt of a valid opt-out request, Tuneable will:
                </p>
                <ul className="list-disc pl-6 space-y-2 mb-4">
                  <li>Immediately remove or disable access to the requested content metadata</li>
                  <li>Cease using any related YouTube Data API content for that media</li>
                  <li>Remove the content from all party queues and search results</li>
                  <li>Process the request within 7 business days (or sooner if technically feasible)</li>
                </ul>
                <p className="mb-2">
                  <strong>How to Request Opt-Out:</strong> Send an email to <strong>hi@tuneable.stream</strong> with:
                </p>
                <ul className="list-disc pl-6 space-y-2 mb-4">
                  <li>Your name and contact information</li>
                  <li>Proof of rights ownership (artist name, label, ISRC codes, or other documentation)</li>
                  <li>Specific content identifiers (song titles, YouTube URLs, or Tuneable media IDs)</li>
                  <li>Clear statement of your opt-out request</li>
                </ul>

                <h3 className="text-xl font-medium text-gray-900">5.4.2 YouTube/Google Takedown Requests</h3>
                <p className="mb-2">
                  If YouTube, Google, or any authorized representative requests that Tuneable cease using YouTube Data API content 
                  or remove specific content, Tuneable will:
                </p>
                <ul className="list-disc pl-6 space-y-2 mb-4">
                  <li>Comply immediately with the request</li>
                  <li>Remove all related metadata and API-derived content</li>
                  <li>Disable embedding of affected YouTube videos</li>
                  <li>Continue operating using alternative metadata sources (as outlined in section 2.1.2)</li>
                </ul>

                <h3 className="text-xl font-medium text-gray-900">5.4.3 Copyright Takedown (DMCA-Style)</h3>
                <p className="mb-2">
                  Tuneable respects intellectual property rights and will process valid copyright takedown requests. 
                  To submit a copyright takedown request, send an email to <strong>hi@tuneable.stream</strong> with:
                </p>
                <ul className="list-disc pl-6 space-y-2 mb-4">
                  <li>Your name, address, telephone number, and email address</li>
                  <li>Identification of the copyrighted work claimed to have been infringed</li>
                  <li>Identification of the material that is claimed to be infringing (with specific URLs or identifiers)</li>
                  <li>A statement that you have a good faith belief that use of the material is not authorized</li>
                  <li>A statement that the information in the notification is accurate and that you are authorized to act on behalf 
                  of the copyright owner</li>
                  <li>Your physical or electronic signature</li>
                </ul>
                <p className="mb-2">
                  Tuneable will process valid takedown requests within 7 business days and may terminate repeat infringers' 
                  accounts in appropriate circumstances.
                </p>

                <h3 className="text-xl font-medium text-gray-900">5.4.4 Effect of Opt-Out on Escrowed Funds</h3>
                <p className="mb-2">
                  If an artist opts out after tips have been placed on their content:
                </p>
                <ul className="list-disc pl-6 space-y-2 mb-4">
                  <li>All escrowed funds for that artist will remain available for claim for the standard 3-year escrow period</li>
                  <li>The artist may still claim accumulated revenue even after opting out, provided they meet verification requirements</li>
                  <li>If the artist does not wish to claim funds, they will be handled according to our unclaimed funds policy (section 8.7.6)</li>
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
                  Music and media content streamed through the Service is provided by third-party platforms (YouTube, etc.). 
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
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">8. Revenue Sharing and Payments</h2>
              <div className="space-y-4 text-gray-700">
                <h3 className="text-xl font-medium text-gray-900">8.1 Tip Revenue Distribution</h3>
                <p className="mb-2">
                  Revenue from tips placed on media content is distributed as follows:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li><strong>Artists/Creators:</strong> 70% of tip revenue (split among media owners based on ownership percentages)</li>
                  <li><strong>Tuneable Platform:</strong> 30% of tip revenue (operating costs and platform maintenance)</li>
                </ul>
                <p className="mb-2 mt-4">
                  <strong>Multi-Artist Splits:</strong> When media has multiple owners, the 70% artist share is divided proportionally 
                  based on the ownership percentages declared in the media's ownership information.
                </p>

                <h3 className="text-xl font-medium text-gray-900">8.2 Payment Processing</h3>
                <ul className="list-disc pl-6 space-y-2">
                  <li>All revenue shares are calculated after standard payment processing fees</li>
                  <li>Payments are processed securely through Stripe</li>
                  <li>Revenue share percentages may be adjusted with 30 days notice to accommodate platform scaling and sustainability</li>
                </ul>

                <h3 className="text-xl font-medium text-gray-900">8.3 Revenue Share Commitment</h3>
                <p className="mb-2">
                  Tuneable CIC is committed to maintaining this artist-friendly revenue split, with artists receiving the majority 
                  of tip revenue. We will provide transparent reporting on revenue distribution upon request.
                </p>

                <h3 className="text-xl font-medium text-gray-900">8.4 Future Features</h3>
                <p className="mb-2">
                  When live party hosting features are implemented, party hosts/venues may receive a portion of revenue from parties 
                  they host, with the specific percentage to be determined and disclosed at launch.
                </p>

                <h3 className="text-xl font-medium text-gray-900">8.5 Payment Schedule</h3>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Payouts to artists are processed manually upon request</li>
                  <li>Minimum payout amount: £1.00 GBP per request</li>
                  <li>First payout eligibility: Requires earning at least £33.00 in total tips (see section 8.7.6)</li>
                  <li>Subsequent payout eligibility: Requires earning at least £10.00 more since last payout (see section 8.7.6)</li>
                  <li>You will receive detailed statements showing your revenue breakdown</li>
                  <li>Payment methods will be determined at the time of first payout</li>
                </ul>

                <h3 className="text-xl font-medium text-gray-900">8.6 Disputes and Chargebacks</h3>
                <ul className="list-disc pl-6 space-y-2">
                  <li>If a tip is disputed or charged back, the affected revenue share will be withheld pending resolution</li>
                  <li>Artists will be notified of any payment disputes affecting their content</li>
                  <li>Chargebacks may result in temporary suspension of payout processing</li>
                </ul>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">8.7 Artist Revenue Escrow Terms</h2>
              <div className="space-y-4 text-gray-700">
                <h3 className="text-xl font-medium text-gray-900">8.7.1 Escrow System</h3>
                <p className="mb-2">
                  All tip revenue directed toward artists and rights-holders is allocated to an internal escrow ledger system. 
                  Revenue is accrued and reserved for creators until claimed, but not held in trust. This escrow system ensures 
                  that artists receive their entitled revenue even if they have not yet registered or claimed their account on Tuneable.
                </p>
                <p className="mb-2">
                  <strong>Escrow Allocation:</strong> When a user places a tip on media, 70% of the tip amount is automatically 
                  allocated to the artist's escrow balance (or stored for unknown artists until they register). The allocation 
                  happens immediately upon tip placement.
                </p>
                <p className="mb-2">
                  <strong>Escrow Duration:</strong> Unclaimed escrow allocations remain claimable indefinitely. There is no 
                  expiration period for claiming accumulated revenue.
                </p>

                <h3 className="text-xl font-medium text-gray-900">8.7.2 Artist Claim Process</h3>
                <p className="mb-2">
                  Artists and rights-holders can claim accumulated revenue at any time by:
                </p>
                <ul className="list-disc pl-6 space-y-2 mb-4">
                  <li>Registering for a Tuneable account and verifying their identity</li>
                  <li>Providing proof of rights ownership (through our creator verification process)</li>
                  <li>Matching unknown artist allocations to their account (automatically done on creator verification)</li>
                  <li>Requesting a payout through the artist escrow dashboard</li>
                  <li>Meeting the minimum payout threshold of £1.00 GBP</li>
                </ul>
                <p className="mb-2">
                  Once verified, artists will receive all accumulated escrowed revenue (minus standard platform fees) 
                  according to our payment schedule. Payouts are processed manually by Tuneable staff.
                </p>

                <h3 className="text-xl font-medium text-gray-900">8.7.3 Platform Fees</h3>
                <p className="mb-2">
                  Standard platform fees apply to all escrowed and paid-out revenue:
                </p>
                <ul className="list-disc pl-6 space-y-2 mb-4">
                  <li>Platform operating fee: 30% of tip revenue (as outlined in section 8.1)</li>
                  <li>Payment processing fees: Standard Stripe fees apply to all payouts</li>
                  <li>No additional fees are charged for escrow services</li>
                </ul>

                <h3 className="text-xl font-medium text-gray-900">8.7.4 Verification Requirements</h3>
                <p className="mb-2">
                  To claim escrowed revenue, artists must provide:
                </p>
                <ul className="list-disc pl-6 space-y-2 mb-4">
                  <li>Proof of identity (government-issued ID)</li>
                  <li>Proof of rights ownership (contracts, ISRC codes, distribution agreements, or other documentation)</li>
                  <li>Valid payment information for payouts</li>
                  <li>Completed tax information forms (as required by law)</li>
                </ul>

                <h3 className="text-xl font-medium text-gray-900">8.7.5 No Pre-Contact Obligation</h3>
                <p className="mb-2">
                  Tuneable operates under industry-standard practices similar to SoundExchange, PPL, Patreon, and Twitch. 
                  We are not legally required to pre-contact every artist before displaying their publicly available content 
                  metadata or before accepting tips directed toward their work. Tuneable operates under:
                </p>
                <ul className="list-disc pl-6 space-y-2 mb-4">
                  <li><strong>Implied License:</strong> YouTube content is licensed by uploaders under YouTube's Terms of Service, 
                  which allows public display of metadata and embedding of videos</li>
                  <li><strong>Safe Harbour:</strong> Tuneable complies with all takedown requests and opt-out requests immediately 
                  upon receipt (see section 5.4 for opt-out procedures)</li>
                </ul>
                <p className="mb-2">
                  Artists who do not wish to participate can opt out at any time, and all escrowed funds will be handled 
                  according to our escrow terms.
                </p>

                <h3 className="text-xl font-medium text-gray-900">8.7.6 Payout Eligibility Thresholds</h3>
                <p className="mb-2">
                  To help buffer beta user credits and ensure sustainable payout processing, Tuneable has implemented payout eligibility thresholds:
                </p>
                <ul className="list-disc pl-6 space-y-2 mb-4">
                  <li><strong>First Payout:</strong> Artists must earn at least £33.00 in total tips before requesting their first payout. This threshold helps ensure that payouts reflect genuine engagement and support from the community.</li>
                  <li><strong>Subsequent Payouts:</strong> After the first payout, artists can request additional payouts once they have earned at least £10.00 more in tips since their last payout. This interval helps balance artist cash flow needs with administrative efficiency.</li>
                  <li><strong>Minimum Payout Amount:</strong> Each payout request must be for at least £1.00 GBP (as outlined in section 8.5).</li>
                  <li><strong>Eligibility Tracking:</strong> Your total escrow earnings are tracked cumulatively. You can view your current earnings, eligibility status, and remaining amount needed for payout eligibility in your artist escrow dashboard.</li>
                </ul>
                <p className="mb-2">
                  These thresholds apply to all payout requests and help ensure that the platform can sustainably process payouts while preventing abuse of beta user credits. Thresholds may be adjusted with 30 days notice to accommodate platform scaling.
                </p>

                <h3 className="text-xl font-medium text-gray-900">8.7.7 Unclaimed Funds</h3>
                <p className="mb-2">
                  After the 3-year escrow period, if funds remain unclaimed:
                </p>
                <ul className="list-disc pl-6 space-y-2 mb-4">
                  <li>Tuneable CIC will make reasonable efforts to contact the artist or rights-holder</li>
                  <li>If contact cannot be established, unclaimed funds will be donated to registered music charities or 
                  music education organizations</li>
                  <li>This practice aligns with Tuneable CIC's community interest objectives of supporting the music community</li>
                  <li>All donations will be transparently reported in Tuneable's annual community interest report</li>
                </ul>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">9. Prohibited Activities</h2>
              <p className="text-gray-700 mb-4">You agree not to:</p>
              <ul className="list-disc pl-6 space-y-2 text-gray-700">
                <li>Use the Service for any illegal purpose</li>
                <li>Attempt to gain unauthorized access to the Service or other users' accounts</li>
                <li>Interfere with or disrupt the Service or servers</li>
                <li>Use automated systems (bots, scrapers) without permission</li>
                <li>Manipulate tipping systems or engage in fraudulent activities</li>
                <li>Impersonate others or misrepresent your affiliation</li>
                <li>Upload malicious code or viruses</li>
                <li>Collect user information without consent</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">9.1 User Responsibilities</h2>
              <div className="space-y-4 text-gray-700">
                <h3 className="text-xl font-medium text-gray-900">9.1.1 Compliance with Third-Party Terms</h3>
                <p className="mb-2">
                  When using Tuneable, you are responsible for complying with the terms of service of all third-party platforms 
                  and services that Tuneable integrates with, including but not limited to:
                </p>
                <ul className="list-disc pl-6 space-y-2 mb-4">
                  <li><strong>YouTube Terms of Service:</strong> You must comply with YouTube's Terms of Service when content 
                  from YouTube is displayed or played through Tuneable</li>
                  <li><strong>OAuth Providers:</strong> When using Facebook, Google, SoundCloud, or Instagram login, you must 
                  comply with their respective terms of service</li>
                  <li><strong>Payment Processors:</strong> When making payments through Stripe, you must comply with Stripe's 
                  terms of service</li>
                </ul>

                <h3 className="text-xl font-medium text-gray-900">9.1.2 Content Responsibility</h3>
                <p className="mb-2">
                  You are solely responsible for:
                </p>
                <ul className="list-disc pl-6 space-y-2 mb-4">
                  <li>Ensuring you have the necessary rights to any content you upload or claim</li>
                  <li>Verifying that content you add to parties does not infringe on third-party rights</li>
                  <li>Respecting copyright and intellectual property rights of artists and rights-holders</li>
                  <li>Not using Tuneable to distribute unauthorized or pirated content</li>
                </ul>

                <h3 className="text-xl font-medium text-gray-900">9.1.3 Account Security</h3>
                <p className="mb-2">
                  You are responsible for:
                </p>
                <ul className="list-disc pl-6 space-y-2 mb-4">
                  <li>Maintaining the confidentiality of your account credentials</li>
                  <li>All activities that occur under your account</li>
                  <li>Notifying Tuneable immediately of any unauthorized access or security breaches</li>
                  <li>Using strong passwords and enabling two-factor authentication when available</li>
                </ul>

                <h3 className="text-xl font-medium text-gray-900">9.1.4 Platform Usage</h3>
                <p className="mb-2">
                  You agree to:
                </p>
                <ul className="list-disc pl-6 space-y-2 mb-4">
                  <li>Use Tuneable only for lawful purposes and in accordance with these Terms</li>
                  <li>Not attempt to circumvent platform features, security measures, or API limitations</li>
                  <li>Not use Tuneable in a way that could damage, disable, or impair the Service</li>
                  <li>Respect other users' rights and privacy</li>
                  <li>Report any violations of these Terms or suspicious activity to Tuneable</li>
                </ul>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">10. Creator and Verified Status</h2>
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
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">11. Disclaimers and Limitations of Liability</h2>
              <div className="space-y-4 text-gray-700">
                <h3 className="text-xl font-medium text-gray-900">11.1 Service Disclaimer</h3>
                <p className="mb-2">
                  THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED. 
                  WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, SECURE, OR ERROR-FREE.
                </p>
                <p className="mb-2">
                  Tuneable does not guarantee:
                </p>
                <ul className="list-disc pl-6 space-y-2 mb-4">
                  <li>Continuous, uninterrupted, or error-free access to the Service</li>
                  <li>That all content will be available at all times</li>
                  <li>That third-party services (YouTube, payment processors, etc.) will always be available</li>
                  <li>That the Service will meet your specific requirements or expectations</li>
                  <li>That any errors or defects will be corrected</li>
                </ul>

                <h3 className="text-xl font-medium text-gray-900">11.2 Third-Party Content and Services</h3>
                <p className="mb-2">
                  Tuneable is not responsible for:
                </p>
                <ul className="list-disc pl-6 space-y-2 mb-4">
                  <li>The availability, accuracy, or legality of content from third-party platforms (YouTube, SoundCloud, etc.)</li>
                  <li>Changes to third-party APIs, terms of service, or availability that may affect Tuneable's functionality</li>
                  <li>Actions taken by third-party platforms that may impact content displayed on Tuneable</li>
                  <li>Any loss or damage resulting from the unavailability of third-party content or services</li>
                </ul>
                <p className="mb-2">
                  If YouTube, Google, or any other third-party service restricts or revokes Tuneable's access to their API or 
                  content, Tuneable will comply with such restrictions but is not liable for any resulting impact on Service 
                  functionality. Tuneable will make reasonable efforts to transition to alternative data sources, but cannot 
                  guarantee seamless continuity of all features.
                </p>

                <h3 className="text-xl font-medium text-gray-900">11.3 Limitation of Liability</h3>
                <p className="mb-2">
                  TO THE MAXIMUM EXTENT PERMITTED BY LAW, TUNEABLE SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, 
                  CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES, WHETHER INCURRED DIRECTLY OR INDIRECTLY.
                </p>
                <p className="mb-2">
                  Tuneable's total liability to you for any claims arising from or related to the Service shall not exceed the 
                  amount you paid to Tuneable in the 12 months preceding the claim, or £100 GBP, whichever is greater.
                </p>
                <p className="mb-2">
                  This limitation of liability applies to:
                </p>
                <ul className="list-disc pl-6 space-y-2 mb-4">
                  <li>Loss of data, content, or account information</li>
                  <li>Loss of wallet balance or tip funds (except as required by law)</li>
                  <li>Interruption of Service or inability to access the Service</li>
                  <li>Errors, bugs, or technical malfunctions</li>
                  <li>Third-party actions or service unavailability</li>
                  <li>Any other damages or losses related to your use of the Service</li>
                </ul>

                <h3 className="text-xl font-medium text-gray-900">11.4 Exceptions to Limitation of Liability</h3>
                <p className="mb-2">
                  Nothing in these Terms excludes or limits Tuneable's liability for:
                </p>
                <ul className="list-disc pl-6 space-y-2 mb-4">
                  <li>Death or personal injury caused by Tuneable's negligence</li>
                  <li>Fraud or fraudulent misrepresentation</li>
                  <li>Any other liability that cannot be excluded or limited by applicable law</li>
                </ul>

                <h3 className="text-xl font-medium text-gray-900">11.5 Indemnification</h3>
                <p className="mb-2">
                  You agree to indemnify, defend, and hold harmless Tuneable, its officers, directors, employees, and agents 
                  from and against any claims, damages, obligations, losses, liabilities, costs, or debt, and expenses 
                  (including but not limited to attorney's fees) arising from:
                </p>
                <ul className="list-disc pl-6 space-y-2 mb-4">
                  <li>Your use of the Service</li>
                  <li>Your violation of these Terms</li>
                  <li>Your violation of any third-party rights (including intellectual property rights)</li>
                  <li>Any content you submit, upload, or claim on the Service</li>
                  <li>Your violation of any applicable laws or regulations</li>
                </ul>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">12. Third-Party Services</h2>
              <p className="text-gray-700 mb-4">
                The Service integrates with third-party platforms including:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-gray-700">
                <li><strong>YouTube:</strong> For music streaming (subject to YouTube Terms of Service)</li>
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
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">13. Termination</h2>
              <div className="space-y-4 text-gray-700">
                <h3 className="text-xl font-medium text-gray-900">13.1 Account Suspension and Removal</h3>
                <p className="mb-2">
                  Tuneable reserves the right to remove users from parties, suspend accounts, or permanently ban users from the platform at its sole discretion. Users may be removed for:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Violation of these Terms</li>
                  <li>Fraudulent or illegal activity</li>
                  <li>Abuse of the Service or other users</li>
                  <li>Inappropriate behavior, harassment, or spam</li>
                  <li>Any activity that disrupts the platform or other users' experience</li>
                  <li>Non-payment or chargebacks</li>
                  <li>Extended periods of inactivity</li>
                </ul>
                <p className="mt-4">
                  Tuneable is not obligated to provide notice before removing users, though reasonable efforts will be made to notify affected users when possible. Removed users may forfeit wallet balances and tip history at Tuneable's discretion.
                </p>

                <h3 className="text-xl font-medium text-gray-900">13.2 User-Initiated Termination</h3>
                <p>
                  You may terminate your account at any time by contacting us. Upon termination, your right to use the Service 
                  will immediately cease, and any remaining wallet balance may be forfeited.
                </p>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">14. Privacy</h2>
              <p className="text-gray-700">
                Your use of the Service is also governed by our{' '}
                <Link to="/privacy-policy" className="text-primary-600 hover:text-primary-500 font-medium">
                  Privacy Policy
                </Link>
                , which explains how we collect, use, and protect your personal information.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">15. Changes to Terms</h2>
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
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">16. Governing Law</h2>
              <p className="text-gray-700">
                These Terms shall be governed by and construed in accordance with the laws of England and Wales, 
                without regard to its conflict of law provisions. Any disputes arising from these Terms or the Service 
                shall be resolved in the courts of England and Wales.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">17. Contact Information</h2>
              <p className="text-gray-700 mb-4">
                If you have any questions about these Terms of Service, please contact us:
              </p>
              <div className="mt-4 p-4 bg-gray-100 rounded-lg">
                <p className="text-gray-700">
                  <strong>Email:</strong> hi@tuneable.stream<br />
                  <strong>Response Time:</strong> We will respond to all inquiries within 7 business days
                </p>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">18. Severability</h2>
              <p className="text-gray-700">
                If any provision of these Terms is found to be unenforceable or invalid, that provision will be limited or 
                eliminated to the minimum extent necessary, and the remaining provisions will remain in full force and effect.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">19. Entire Agreement</h2>
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

