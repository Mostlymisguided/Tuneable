# File Upload Production Considerations

## ⚠️ Important: Ephemeral Filesystem on Render

### Current Implementation
- Creator application proof files → `uploads/creator-applications/`
- Tune claim proof files → `uploads/claims/`
- User profile pictures → `uploads/`

### The Problem
Render's filesystem is **ephemeral**, meaning:
- Uploaded files are stored temporarily
- Files are **deleted** when the service restarts/redeploys
- Not suitable for production file storage

### ✅ Recommended Solution: Cloudflare R2

**Why Cloudflare R2:**
- **Free tier:** 10GB storage, 10 million reads/month
- **Fast:** Global CDN
- **S3-compatible API:** Easy to integrate
- **No egress fees:** Unlike AWS S3

### Implementation Steps

1. **Set up Cloudflare R2:**
   - Go to Cloudflare dashboard
   - Navigate to R2 → Create bucket (e.g., `tuneable-uploads`)
   - Get API keys from R2 settings

2. **Install AWS SDK (R2 is S3-compatible):**
   ```bash
   npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner multer-s3
   ```

3. **Update upload configuration:**
   ```javascript
   const { S3Client } = require('@aws-sdk/client-s3');
   const multerS3 = require('multer-s3');

   const s3Client = new S3Client({
     region: 'auto',
     endpoint: process.env.R2_ENDPOINT, // e.g., https://abc123.r2.cloudflarestorage.com
     credentials: {
       accessKeyId: process.env.R2_ACCESS_KEY_ID,
       secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
     },
   });

   const upload = multer({
     storage: multerS3({
       s3: s3Client,
       bucket: 'tuneable-uploads',
       acl: 'public-read',
       key: function (req, file, cb) {
         const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
         cb(null, `creator-applications/creator-proof-${uniqueSuffix}${path.extname(file.originalname)}`);
       }
     })
   });
   ```

4. **Add to .env:**
   ```bash
   R2_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
   R2_ACCESS_KEY_ID=your-access-key
   R2_SECRET_ACCESS_KEY=your-secret-key
   R2_BUCKET_NAME=tuneable-uploads
   R2_PUBLIC_URL=https://uploads.tuneable.stream
   ```

5. **Set up custom domain for R2:**
   - In Cloudflare R2 dashboard
   - Connect `uploads.tuneable.stream` to your bucket
   - Files will be accessible at: `https://uploads.tuneable.stream/path/to/file`

---

## 🔄 Alternative Solutions

### Option 2: AWS S3
- Most popular
- Pay-as-you-go pricing
- More expensive than R2 (egress fees)

### Option 3: Google Cloud Storage
- Good integration with Google services
- Similar pricing to S3

---

## 📋 Current Status

**Development:** ✅ Works fine (local filesystem)  
**Production (Render):** ⚠️ Works but files lost on restart  
**Recommended:** 🚀 Migrate to Cloudflare R2

---

## 🎯 Migration Priority

**Low priority** if:
- Few creator applications
- Can manually re-upload proof if needed
- Just testing/MVP phase

**High priority** if:
- Going live to public
- Need to preserve verification documents
- Processing many applications

---

**Want me to implement Cloudflare R2 integration now, or is the current solution OK for testing?**

