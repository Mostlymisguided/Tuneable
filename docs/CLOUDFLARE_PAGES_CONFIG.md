# Cloudflare Pages Deployment Configuration

This document explains how to properly configure Cloudflare Pages deployment for the Tuneable frontend.

## TL;DR - Quick Fix

**Current configuration is missing dependency installation.** 

**Change this:**
```
Build command: npm run build
```

**To this:**
```
Build command: npm install && npm run build
```

**And add these environment variables in Cloudflare Dashboard:**
- `VITE_API_URL` = `https://tuneable.stream/api`
- `VITE_BACKEND_URL` = `https://tuneable.stream`
- `NODE_VERSION` = `20`

Then retry the deployment. ✅

---

## Current Issue

Cloudflare Pages deployments are currently failing. The current configuration is:

```
Build command:     npm run build
Build output:      dist
Root directory:    tuneable-frontend-v2
```

**Problem**: The build command doesn't install dependencies first, so `tsc` and `vite` commands fail with "command not found" errors.

## Solution

### Option 1: Fix Build Command (Recommended - Quick Fix)

The root directory is already correctly set to `tuneable-frontend-v2`, so we just need to update the build command to install dependencies first.

1. **Go to Cloudflare Dashboard**
   - Navigate to: https://dash.cloudflare.com
   - Select your account
   - Go to **Pages** → Select your **tuneable** project
   - Click **Settings** → **Builds & deployments**

2. **Update Build Configuration**

   **Framework preset**: None (or Vite)
   
   **Build command** (change from `npm run build` to):
   ```bash
   npm install && npm run build
   ```
   
   **Build output directory** (keep as is):
   ```
   dist
   ```
   
   **Root directory** (keep as is):
   ```
   tuneable-frontend-v2
   ```

3. **Set Environment Variables**

   Go to **Settings** → **Environment variables** and add these variables:

   | Variable Name | Value | Environment |
   |---------------|-------|-------------|
   | `VITE_API_URL` | `https://tuneable.stream/api` | Production, Preview |
   | `VITE_BACKEND_URL` | `https://tuneable.stream` | Production, Preview |
   | `NODE_VERSION` | `20` | Production, Preview |

   **Important**: These environment variables are required because:
   - Vite needs `VITE_` prefixed variables to be available at build time
   - The `build:prod` script in package.json has inline env vars that don't work in Cloudflare's Linux environment
   - Setting them in Cloudflare dashboard makes them available to the build process

4. **Save and Redeploy**

   - Click **Save** after updating build command
   - Click **Save** after adding environment variables
   - Go to **Deployments** tab
   - Click **Retry deployment** on the latest failed deployment
   - Or push a new commit to trigger a new deployment

   The build should now succeed!

### Option 2: Alternative Build Commands

Since Root Directory is already set to `tuneable-frontend-v2`, you don't need `cd` commands. Try these alternatives if Option 1 doesn't work:

**Option A - Use npm ci (faster, more reliable):**
```bash
npm ci && npm run build
```

**Option B - Clean install:**
```bash
rm -rf node_modules && npm install && npm run build
```

**Option C - Use the prod build script (requires env vars set in dashboard):**
```bash
npm install && npm run build:prod
```
Note: Option C won't work unless you set the environment variables in Cloudflare dashboard first, because the inline env vars in the script (`VITE_API_URL=...`) don't work in Cloudflare's build environment.

**Recommended**: Use Option 1 (npm install && npm run build) with environment variables set in the dashboard.

### Option 3: Add Build Config File (Currently Not Supported)

Cloudflare Pages does not currently support repository-based configuration files like `.cloudflare-pages.json` or similar. All configuration must be done through the dashboard.

However, if they add support in the future, the configuration would look like:

```json
{
  "build": {
    "command": "cd tuneable-frontend-v2 && npm install && npm run build:prod",
    "outputDirectory": "tuneable-frontend-v2/dist",
    "rootDirectory": "/"
  },
  "env": {
    "production": {
      "VITE_API_URL": "https://tuneable.stream/api",
      "VITE_BACKEND_URL": "https://tuneable.stream",
      "NODE_VERSION": "20"
    }
  }
}
```

## Verify Build Locally

Before deploying, verify the build works locally:

```bash
cd tuneable-frontend-v2
npm install
npm run build:prod
```

Expected output:
- Build should complete without errors
- `dist/` directory should be created
- `dist/index.html` and assets should exist

Check the build:
```bash
ls -la tuneable-frontend-v2/dist/
```

## Troubleshooting

### Build fails: "tsc: not found"

**Cause**: TypeScript compiler is not installed.

**Fix**: Ensure `npm install` runs in the `tuneable-frontend-v2` directory before the build command.

### Build fails: "vite: not found"

**Cause**: Vite is not installed.

**Fix**: Run `npm install` in `tuneable-frontend-v2` before building.

### Build fails: Module not found errors

**Cause**: Dependencies are missing or outdated.

**Fix**: 
```bash
cd tuneable-frontend-v2
rm -rf node_modules package-lock.json
npm install
npm run build:prod
```

### Environment variables not working

**Cause**: Vite requires `VITE_` prefix for environment variables to be accessible in the app.

**Fix**: Ensure all environment variables start with `VITE_` and are set in Cloudflare Pages settings.

### Wrong directory being built

**Cause**: Cloudflare is trying to build from the root directory instead of `tuneable-frontend-v2`.

**Fix**: Build command must include `cd tuneable-frontend-v2` at the start.

## Alternative: GitHub Actions Deployment

If Cloudflare Pages dashboard configuration continues to fail, you can deploy via GitHub Actions:

Create `.github/workflows/cloudflare-pages.yml`:

```yaml
name: Deploy to Cloudflare Pages

on:
  push:
    branches:
      - main
  pull_request:

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      deployments: write
    
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: 'tuneable-frontend-v2/package-lock.json'
      
      - name: Install dependencies
        run: |
          cd tuneable-frontend-v2
          npm ci
      
      - name: Build
        env:
          VITE_API_URL: https://tuneable.stream/api
          VITE_BACKEND_URL: https://tuneable.stream
        run: |
          cd tuneable-frontend-v2
          npm run build:prod
      
      - name: Publish to Cloudflare Pages
        uses: cloudflare/pages-action@v1
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          projectName: tuneable
          directory: tuneable-frontend-v2/dist
          gitHubToken: ${{ secrets.GITHUB_TOKEN }}
```

**Required Secrets** (add in GitHub Settings → Secrets):
- `CLOUDFLARE_API_TOKEN`: Create in Cloudflare Dashboard → Profile → API Tokens
- `CLOUDFLARE_ACCOUNT_ID`: Find in Cloudflare Dashboard → Account → Account ID

## Testing the Deployment

After fixing the configuration and deploying:

1. **Check Deployment Status**
   - Go to Cloudflare Dashboard → Pages → tuneable → Deployments
   - Verify the latest deployment shows "Success"

2. **Test the Live Site**
   - Visit your Cloudflare Pages URL (e.g., `tuneable.pages.dev`)
   - Verify the app loads correctly
   - Test key features: login, music search, parties

3. **Check Console for Errors**
   - Open browser DevTools (F12)
   - Look for any API errors or missing resources
   - Verify API calls are going to the correct backend URL

## Production Checklist

Before considering the deployment fixed:

- [ ] Build completes successfully in Cloudflare
- [ ] Deployment shows "Success" status
- [ ] Site is accessible at the Pages URL
- [ ] No console errors on page load
- [ ] API calls work correctly
- [ ] Authentication (login/signup) works
- [ ] Music playback works
- [ ] All main features functional
- [ ] Custom domain points to deployment (if applicable)

## Additional Resources

- [Cloudflare Pages Documentation](https://developers.cloudflare.com/pages/)
- [Vite Build Documentation](https://vitejs.dev/guide/build.html)
- [Cloudflare Pages Build Configuration](https://developers.cloudflare.com/pages/platform/build-configuration/)
- [Troubleshooting Cloudflare Pages](https://developers.cloudflare.com/pages/platform/known-issues/)

## Summary

The Cloudflare Pages deployment failure is due to build configuration, not code issues. The frontend builds successfully when the build command properly navigates to the `tuneable-frontend-v2` directory and runs the build there.

**Quick Fix**: Update Cloudflare Pages build settings with the configuration above, then retry the deployment.
