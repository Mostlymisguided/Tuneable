# Email Notification Setup with Resend

## 🚀 Quick Setup (5 minutes)

### Step 1: Create Resend Account
1. Go to https://resend.com/signup
2. Sign up (free, no credit card required)
3. Confirm your email

### Step 2: Get API Key
1. In Resend dashboard, go to **API Keys**
2. Click **Create API Key**
3. Name it "Tuneable Backend"
4. Copy the key (starts with `re_...`)

### Step 3: Add to .env File
Create `/tuneable-backend/.env` file (if it doesn't exist) and add:

```bash
RESEND_API_KEY=re_your_actual_api_key_here
EMAIL_FROM=onboarding@resend.dev
ADMIN_EMAIL=mostlymisguided@icloud.com
FRONTEND_URL=http://localhost:5173
```

**Note:** Use `onboarding@resend.dev` for immediate testing. It works right away!

**Important:** In production (Render), make sure `FRONTEND_URL` is set to your production domain (e.g., `https://tuneable.stream`) so password reset and verification links point to the correct frontend.

---

## 📧 Verify tuneable.stream Domain (Optional but Recommended)

### Step 1: Add Domain in Resend
1. In Resend dashboard, go to **Domains**
2. Click **Add Domain**
3. Enter: `tuneable.stream`
4. Resend will show you DNS records to add

### Step 2: Add DNS Records in Cloudflare
1. Log into Cloudflare
2. Select tuneable.stream domain
3. Go to **DNS** → **Records**
4. Add the records Resend provides (usually 2-3 TXT records):

**Example (actual values will be in Resend):**
```
Type: TXT
Name: resend._domainkey.tuneable.stream
Value: [Resend provides this]

Type: TXT
Name: tuneable.stream
Value: v=spf1 include:amazonses.com ~all
```

### Step 3: Verify in Resend
1. Back in Resend, click **Verify**
2. Wait 1-2 minutes for DNS propagation
3. Once verified, update your `.env`:

```bash
EMAIL_FROM=notifications@tuneable.stream
```

---

## 📨 What Gets Emailed

All notifications are sent to `mostlymisguided@icloud.com`:

### 1. **User Registration** 👋
- Triggered when: New user signs up
- Includes: Username, email, name, location, invite code

### 2. **Creator Applications** 🎵
- Triggered when: User submits creator application
- Includes: Artist name, bio, roles, genres, social media, proof documents
- Action Required: Review in Admin Panel

### 3. **Tune Claims** 🎵
- Triggered when: Creator claims ownership of a tune
- Includes: Tune info, claimant details, proof text and documents
- Action Required: Review in Admin Panel

### 4. **Party Creation** 🎉
- Triggered when: User creates a new party
- Includes: Party details, host info, party code

### 5. **Wallet Top-ups** 💰
- Triggered when: User adds funds to wallet
- Includes: Amount, user info, new balance

### 6. **High-Value Bids** 🔥
- Triggered when: Bid ≥ £10.00
- Includes: Bid amount, tune info, user info

---

## 🧪 Testing

### Test Immediately (No Domain Setup Required)
1. Add `RESEND_API_KEY` to `.env`
2. Keep `EMAIL_FROM=onboarding@resend.dev`
3. Restart backend
4. Register a new user → Check email!

### Test After Domain Verification
1. Update `EMAIL_FROM=notifications@tuneable.stream`
2. Restart backend
3. All emails will come from your domain! 🎉

---

## 🔧 Troubleshooting

### "Error sending email"
- Check `RESEND_API_KEY` is correct
- Check API key isn't revoked in Resend dashboard
- Check you're not over free tier limit (3,000/month)

### "Domain not verified"
- Wait a few minutes after adding DNS records
- Check DNS records are correct in Cloudflare
- Click "Verify" again in Resend

### Emails going to spam
- Verify domain (don't use onboarding@resend.dev in production)
- Add SPF, DKIM records properly
- Avoid spam trigger words in subject lines

---

## 📊 Free Tier Limits

- **3,000 emails/month**
- **100 emails/day**
- **No credit card required**

Perfect for your needs! You'd need ~100 daily actions to hit the limit.

---

## 🎯 Next Steps

1. Sign up for Resend (2 min)
2. Get API key (30 sec)
3. Add to `.env` (30 sec)
4. Test with `onboarding@resend.dev` (works immediately)
5. Verify tuneable.stream domain when ready (5 min + DNS wait)
6. Update to `notifications@tuneable.stream` (professional!) ✨

