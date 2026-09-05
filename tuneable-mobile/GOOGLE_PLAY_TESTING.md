# Quick Guide: Google Play Testing

Fast-track guide to get your app into testing on Google Play.

## 🚀 Quick Start (15 minutes to first test build)

### 1. One-Time Setup (5 min)

```bash
# Install EAS CLI globally
npm install -g eas-cli

# Login to Expo
eas login

# Navigate to mobile app
cd tuneable-mobile
```

### 2. Create Google Play App (3 min)

1. Go to https://play.google.com/console
2. Click **Create app**
3. Fill in basic info:
   - Name: **Tuneable**
   - Language: **English (UK)**
   - App/Game: **App**
   - Free/Paid: **Free**

### 3. Build for Android (5-15 min)

```bash
# Build production Android app bundle
eas build --platform android --profile production
```

Wait for build to complete. Download the `.aab` file when ready.

### 4. Upload to Internal Testing (2 min)

1. In Play Console, go to **Release > Testing > Internal testing**
2. Click **Create new release**
3. Upload your `.aab` file
4. Add release notes: "Initial test build"
5. Click **Review release** → **Start rollout to Internal testing**

### 5. Add Testers & Test (2 min)

1. Go to **Testers** tab in Internal testing
2. Create an email list with your Gmail addresses
3. Copy the opt-in URL
4. Open URL on your Android device
5. Accept and download from Play Store

**Done!** You can now test your app.

---

## 📱 Testing Options

### Internal Testing
- **Best for**: Your team (up to 100 people)
- **Review time**: None (instant)
- **How to add testers**: Email list
- **Use case**: Quick iteration, bug fixes, QA

```bash
eas build --platform android --profile production
# Upload to Internal testing track
```

### Closed Testing (Beta)
- **Best for**: Larger group of beta testers
- **Review time**: First time ~1-2 hours, updates faster
- **How to add testers**: Email lists or Google Groups
- **Use case**: Pre-launch testing with trusted users

### Open Testing
- **Best for**: Public beta, anyone can join
- **Review time**: Similar to Closed testing
- **How to add testers**: Public opt-in link
- **Use case**: Large-scale testing before production

---

## 🔄 Update Workflow

Every time you make changes and want to test:

```bash
cd tuneable-mobile

# Make your code changes
# ...

# Build new version (version code auto-increments)
eas build --platform android --profile production

# Wait for build to complete

# Upload new AAB to same track in Play Console
# Internal testing: Available in minutes
# Closed/Open testing: Available in ~1 hour
```

---

## 🛠️ Build Profiles

Your `eas.json` has three profiles:

### Development
```bash
eas build --platform android --profile development
```
- Creates development build (not for Play Store)
- Good for local testing with Expo dev tools

### Preview
```bash
eas build --platform android --profile preview
```
- Internal distribution build
- Uses production API (https://tuneable.stream)
- Good for sharing with testers outside Play Store

### Production
```bash
eas build --platform android --profile production
```
- Production-ready build
- Uses production API
- For Google Play upload

---

## 🧪 Testing In-App Purchases (IAP)

### Setup IAP Products in Play Console

1. Go to **Monetize > In-app products**
2. Create products:

```
stream.tuneable.app.wallet.5   → £5.00
stream.tuneable.app.wallet.10  → £10.00
stream.tuneable.app.wallet.20  → £20.00
stream.tuneable.app.wallet.50  → £50.00
```

3. Each product:
   - **Type**: Managed product (consumable)
   - **Status**: Active

### Add License Testers

1. Go to **Setup > License Testing**
2. Add Gmail addresses of testers
3. They can make purchases without being charged
4. Purchases auto-complete for testing

### Test IAP Flow

1. Build app with IAP enabled (already configured in your app)
2. Install from Internal testing
3. Sign in with license tester account
4. Go to Wallet/Top-up
5. Select amount
6. Complete "purchase" (won't be charged)
7. Verify balance updated

---

## 📊 Monitoring & Feedback

### While Testing

Check these in Play Console:

1. **Pre-launch report**
   - Automatic testing on various devices
   - Shows crashes, accessibility issues
   - Available after first upload

2. **Android vitals**
   - Crash rate
   - ANR (App Not Responding) rate
   - Performance metrics

3. **User feedback**
   - Internal testers can leave feedback
   - Check regularly and iterate

---

## 🐛 Troubleshooting

### Build fails
```bash
# View recent builds
eas build:list

# View specific build logs
eas build:view <build-id>
```

### Can't install from Play Store
- Ensure you accepted the testing invite
- Check if you're signed in with the correct Google account
- Try uninstalling any existing version first

### IAP not working
- Ensure you're signed in with a license tester account
- Products must be **Active** in Play Console
- App must be from Play Store, not sideloaded
- Check backend IAP verification is set up

### Version conflicts
- EAS auto-increments version codes
- If manual upload fails, check version code is higher than previous

---

## 📋 Pre-Launch Checklist

Before uploading to Internal testing:

- [ ] App builds successfully with `eas build`
- [ ] `.env` configured with correct API URL
- [ ] Tested login/signup flow locally
- [ ] Verified core features work (music, podcasts, tips, wallet)
- [ ] IAP products created in Play Console (if testing payments)

Before moving to Closed/Open testing:

- [ ] Internal testing completed with no major bugs
- [ ] All testers can install and run the app
- [ ] IAP flow tested (if applicable)
- [ ] Performance is acceptable
- [ ] No critical crashes

Before Production:

- [ ] Beta testing completed
- [ ] All store listing assets ready (screenshots, graphics)
- [ ] Privacy policy URL added
- [ ] Content rating completed
- [ ] Data safety form completed
- [ ] Release notes prepared

---

## 🎯 Recommended Testing Flow

```
1. Internal Testing (Your team)
   ↓ (Fix bugs, iterate quickly)
   
2. Internal Testing (Expanded team + friends)
   ↓ (No major issues)
   
3. Closed Testing / Beta (Wider audience)
   ↓ (Positive feedback)
   
4. Open Testing (Optional public beta)
   ↓ (Scale testing)
   
5. Production (Staged rollout: 5% → 10% → 25% → 50% → 100%)
```

---

## 💡 Pro Tips

1. **Start with internal testing** - It's instant and you can push updates quickly
2. **Use staged rollouts** - When going to production, start with 5-10% to catch issues
3. **Version codes auto-increment** - Don't worry about them, EAS handles it
4. **Keep release notes** - Users appreciate knowing what changed
5. **Monitor crash reports** - Check Play Console regularly after releases
6. **Test on multiple devices** - Use Pre-launch report to see device coverage
7. **License testers for IAP** - Always test purchases with license test accounts
8. **Bundle size matters** - Keep APK/AAB size reasonable (your app is currently ~50MB)

---

## 📞 Need Help?

- [EAS Build Docs](https://docs.expo.dev/build/introduction/)
- [Google Play Testing Docs](https://support.google.com/googleplay/android-developer/answer/9845334)
- [Expo Forums](https://forums.expo.dev/)
- Check `tuneable-mobile/README.md` for app-specific setup

---

## Quick Commands Reference

```bash
# Build for testing
eas build --platform android --profile production

# View builds
eas build:list

# View build details/logs
eas build:view <build-id>

# Check EAS project status  
eas project:info

# Submit to Play Store (requires service account setup)
eas submit --platform android --profile production
```
