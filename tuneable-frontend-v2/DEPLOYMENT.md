# Tuneable Frontend Production Deployment

## Build Information
- **Build Date**: September 16, 2025
- **Backend URL**: https://tuneable.onrender.com
- **WebSocket URL**: wss://tuneable.onrender.com
- **Build Size**: ~124KB (compressed)

## Files to Upload
Upload all contents of the `dist/` folder to your web server:

```
dist/
├── index.html
├── vite.svg
└── assets/
    ├── index-5O-Q1iGV.js
    └── index-DGc1f5Am.css
```

## FTP Upload Instructions
1. Extract `tuneable-frontend-production.zip` on your server
2. Upload all files to your web root directory
3. Ensure `index.html` is in the root directory
4. Make sure the `assets/` folder is uploaded with all its contents

## Configuration
The frontend is pre-configured to connect to:
- **API**: https://tuneable.onrender.com/api
- **WebSocket**: wss://tuneable.onrender.com

## Features Included
- ✅ Two-level bidding system (party-specific + global)
- ✅ Wallet functionality with Stripe integration
- ✅ Persistent web player
- ✅ Player warning system
- ✅ Dark purple theme
- ✅ Real-time WebSocket updates
- ✅ Detailed bid display

## Testing
After upload, test the following:
1. User registration/login
2. Party creation and joining
3. Song bidding (should be party-specific)
4. Wallet top-up functionality
5. Web player functionality
6. Cross-party bid isolation

## Troubleshooting
- If WebSocket connections fail, check that your server supports WSS
- If API calls fail, verify the backend URL is accessible
- Check browser console for any CORS or connection errors
