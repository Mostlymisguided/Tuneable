# Google Play Publishing & Testing Guide

This guide covers how to publish the Tuneable mobile app to Google Play Store and set up testing tracks.

## Prerequisites

### 1. Google Play Console Account
- Create a Google Play Console account at https://play.google.com/console
- Pay the one-time $25 registration fee
- Complete the account setup (developer information, merchant details)

### 2. App Information Ready
Your app is already configured with:
- **Package Name**: `stream.tuneable.app`
- **Version Code**: 1 (auto-incremented with EAS)
- **App Name**: Tuneable

### 3. Required Assets

Before publishing, prepare these assets:

#### App Icon
- Already configured in `/tuneable-mobile/assets/images/`
- 512x512 PNG (high-res icon for Play Store)

#### Screenshots (Required)
- **Phone**: At least 2 screenshots
  - Minimum: 320px on short side
  - Maximum: 3840px on long side
  - Recommended: 1080x1920 or 1440x2560

- **7-inch Tablet** (Optional but recommended)
- **10-inch Tablet** (Optional but recommended)

#### Feature Graphic (Required)
- 1024 x 500 PNG or JPG
- No alpha channel
- This appears at the top of your store listing

#### Privacy Policy URL (Required)
- You need a publicly accessible privacy policy URL
- Can use your website: https://tuneable.stream/privacy

## Building for Google Play

### Step 1: Install EAS CLI

```bash
npm install -g eas-cli
eas login
```

### Step 2: Configure for Android Production Build

Your `eas.json` is already configured. The production profile will:
- Auto-increment version codes
- Use production API URL (https://tuneable.stream)

### Step 3: Build the Android App Bundle (AAB)

```bash
cd tuneable-mobile

# Build for production
eas build --platform android --profile production
```

This will:
1. Build an optimized Android App Bundle (.aab)
2. Automatically increment the version code
3. Sign the app with your credentials (EAS manages signing)
4. Provide a download link when complete (usually 10-15 minutes)

### Step 4: Download the AAB

After the build completes, download the `.aab` file from the EAS dashboard or the provided link.

## Publishing to Google Play

### 1. Create Your App in Play Console

1. Go to https://play.google.com/console
2. Click **Create app**
3. Fill in:
   - **App name**: Tuneable
   - **Default language**: English (UK) or English (US)
   - **App or game**: App
   - **Free or paid**: Free (or Paid if charging)
4. Accept the declarations and create app

### 2. Complete Store Listing

Navigate to **Store presence > Main store listing**:

**App details:**
- **Short description** (80 chars max): Brief tagline
- **Full description** (4000 chars max): Detailed app description
- **App icon**: Upload 512x512 PNG
- **Feature graphic**: Upload 1024x500 image
- **Phone screenshots**: Upload at least 2 screenshots

**Categorization:**
- **App category**: Music & Audio
- **Tags**: Select relevant tags
- **Content rating**: Complete the questionnaire

**Contact details:**
- **Email**: Your support email
- **Phone**: (optional)
- **Website**: https://tuneable.stream

### 3. Set Up App Access

Navigate to **Policy > App access**:
- If your app requires login, provide test credentials
- If everything is accessible, declare that it's unrestricted

### 4. Complete Privacy Policy

Navigate to **Policy > Privacy policy**:
- Add your privacy policy URL (e.g., https://tuneable.stream/privacy)

### 5. Select Target Audience & Content

Navigate to **Policy > Target audience and content**:
- Select age groups
- Complete the content declarations

### 6. Complete Content Rating

Navigate to **Policy > Content rating**:
- Fill out the IARC questionnaire
- This determines your app's rating (e.g., PEGI 3, ESRB E)

### 7. Set Up Data Safety

Navigate to **Policy > Data safety**:
- Declare what data you collect
- Explain how it's used
- Declare security practices

## Testing Tracks

Google Play offers multiple testing tracks before full release:

### 1. Internal Testing (Recommended First)

**Best for**: Quick iteration with your team (up to 100 testers)

1. Go to **Release > Testing > Internal testing**
2. Click **Create new release**
3. Upload your AAB file
4. Add release notes
5. Review and rollout

**Add Testers:**
- Go to **Testers** tab
- Create an email list of testers
- Share the opt-in URL with your team

**Advantages:**
- Changes available within minutes
- No review required
- Can push updates quickly
- Great for QA and team testing

### 2. Closed Testing (Alpha/Beta)

**Best for**: Larger testing group before public launch

1. Go to **Release > Testing > Closed testing**
2. Create a track (you can have multiple: alpha, beta, etc.)
3. Create new release and upload AAB
4. Add release notes

**Add Testers:**
- Create email lists (can have thousands)
- Share opt-in URL
- Can also use Google Groups

**Review time:**
- First release: May take a few hours to a day
- Subsequent updates: Usually faster

### 3. Open Testing (Public Beta)

**Best for**: Large-scale public testing before production

1. Go to **Release > Testing > Open testing**
2. Create new release and upload AAB
3. Set countries where available
4. Anyone can opt-in to test

**Advantages:**
- Anyone can join
- Get real-world feedback
- Test at scale
- Can set maximum number of testers

### 4. Production Release

**When ready for public launch:**

1. Go to **Release > Production**
2. Create new release
3. Upload AAB
4. Add release notes
5. Choose rollout:
   - **Staged rollout**: Start with 5%, 10%, 20%, 50%, 100%
   - **Full rollout**: Immediate 100% availability

**Review time:**
- First production release: Can take 1-7 days
- Subsequent updates: Usually 1-3 days

## Testing Workflow (Recommended)

```
Internal Testing (your team)
    ↓
Closed Testing / Beta (wider group)
    ↓
Open Testing (optional public beta)
    ↓
Production (staged rollout → 100%)
```

## Building & Submitting with EAS

### Option 1: Manual Upload

```bash
# Build
eas build --platform android --profile production

# Download AAB and manually upload to Play Console
```

### Option 2: Automated Submission (Recommended)

```bash
# Build and auto-submit to internal testing
eas build --platform android --profile production --auto-submit

# Or build first, then submit
eas build --platform android --profile production
eas submit --platform android --profile production
```

**For auto-submit to work**, you need to:
1. Create a Google Cloud service account
2. Grant access to Play Console API
3. Download JSON key file
4. Add to your `eas.json`:

```json
{
  "submit": {
    "production": {
      "android": {
        "serviceAccountKeyPath": "./path-to-key.json",
        "track": "internal"
      }
    }
  }
}
```

## In-App Purchases (IAP)

Since your app has IAP for wallet top-ups, set these up in Play Console:

### Create In-App Products

1. Go to **Monetize > In-app products**
2. Create **managed products** (consumables) for each tier:

| Product ID | Title | Description | Price |
|------------|-------|-------------|-------|
| `stream.tuneable.app.wallet.5` | £5 Wallet Top-Up | Add £5 to your Tuneable wallet | £5.00 |
| `stream.tuneable.app.wallet.10` | £10 Wallet Top-Up | Add £10 to your Tuneable wallet | £10.00 |
| `stream.tuneable.app.wallet.20` | £20 Wallet Top-Up | Add £20 to your Tuneable wallet | £20.00 |
| `stream.tuneable.app.wallet.50` | £50 Wallet Top-Up | Add £50 to your Tuneable wallet | £50.00 |

3. Activate each product
4. Test in internal testing with test accounts

### Backend Setup for Google Play

You need to set up Google Play verification in your backend:

1. Create a service account in Google Cloud Console
2. Enable Google Play Developer API
3. Grant service account access in Play Console
4. Download JSON key
5. Add credentials to `tuneable-backend/.env`:

```
GOOGLE_PLAY_SERVICE_ACCOUNT_KEY=<json-key-content>
```

The backend endpoint `/api/payments/iap/verify` should validate Google Play receipts.

## Testing IAP

**License Testing:**
1. Go to **Setup > License Testing**
2. Add your Gmail accounts as license testers
3. These accounts can make test purchases without being charged
4. Purchases are automatically consumed/refunded

## Version Management

### Version Codes (Automated)
- `versionCode` in `app.json` is set to `1`
- EAS auto-increments with `"autoIncrement": true` in `eas.json`
- Each build gets a unique version code

### Version Names (Semantic)
- Current: `1.0.0` (in `app.json`)
- Update manually for major releases
- Format: `MAJOR.MINOR.PATCH`

Example:
- `1.0.0` → Initial release
- `1.0.1` → Bug fixes
- `1.1.0` → New features
- `2.0.0` → Major changes

## Release Notes Template

```
What's New in Version X.X.X

🎵 Music features
• [Feature description]

🎙️ Podcast features  
• [Feature description]

💳 Wallet improvements
• [Feature description]

🐛 Bug fixes and improvements
• [Bug fix description]
```

## Troubleshooting

### "App not signed" error
- EAS handles signing automatically
- Ensure you're using `eas build` not `expo build`

### "Package name already exists"
- Each package name is unique across all of Google Play
- If `stream.tuneable.app` is taken, update in `app.json` android.package

### Build fails
```bash
# Check build logs
eas build:list
eas build:view <build-id>
```

### IAP not working
- Ensure products are created and activated in Play Console
- Test with license testing accounts
- Check backend verification is set up
- Verify service account has correct permissions

## Quick Start Checklist

- [ ] Google Play Console account created ($25 paid)
- [ ] App information completed (name, description, category)
- [ ] Screenshots and graphics created and uploaded
- [ ] Privacy policy URL added
- [ ] Content rating questionnaire completed
- [ ] Data safety form completed
- [ ] IAP products created (if applicable)
- [ ] Build generated with `eas build --platform android --profile production`
- [ ] AAB uploaded to internal testing track
- [ ] Internal testers added and testing verified
- [ ] Promoted to closed/open testing (optional)
- [ ] Production release submitted for review

## Resources

- [Google Play Console](https://play.google.com/console)
- [Expo EAS Build Documentation](https://docs.expo.dev/build/introduction/)
- [Expo Submit Documentation](https://docs.expo.dev/submit/introduction/)
- [Google Play Developer Policy](https://play.google.com/about/developer-content-policy/)
- [Android App Bundle Format](https://developer.android.com/guide/app-bundle)

## Next Steps

1. **Immediate**: Set up internal testing to test with your team
2. **After internal QA**: Move to closed testing with beta testers  
3. **After beta feedback**: Submit for production review
4. **Post-launch**: Monitor reviews, crashes, and user feedback in Play Console
