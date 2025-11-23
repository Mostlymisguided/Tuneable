# Copy Production MongoDB Atlas Cluster to Dev

This guide explains how to copy your production MongoDB Atlas cluster to your dev cluster.

## Option 1: MongoDB Atlas Cloud Backup (Recommended - Easiest)

If you have MongoDB Atlas Cloud Backup enabled:

1. Go to your MongoDB Atlas dashboard
2. Navigate to your **production cluster**
3. Go to **Backups** → **Cloud Backup** (or **Continuous Backup**)
4. Find the snapshot you want to restore
5. Click **Restore** → **Restore to a Different Cluster**
6. Select your **dev cluster** as the destination
7. Confirm the restore

This is the safest and easiest method, but requires Cloud Backup to be enabled.

## Option 2: Using mongodump/mongorestore (Recommended for Large Databases)

### Prerequisites

Install MongoDB Database Tools:
```bash
# macOS
brew install mongodb-database-tools

# Or download from:
# https://www.mongodb.com/try/download/database-tools
```

### Steps

1. **Set environment variables** with your connection strings:
   ```bash
   export MONGO_URI_PROD="mongodb+srv://username:password@prod-cluster.mongodb.net/Tuneable?retryWrites=true&w=majority"
   export MONGO_URI_DEV="mongodb+srv://username:password@dev-cluster.mongodb.net/Tuneable?retryWrites=true&w=majority"
   ```

2. **Run the script**:
   ```bash
   cd tuneable-backend
   ./scripts/copy-production-to-dev.sh
   ```

The script will:
- Dump all data from production
- Ask for confirmation
- Restore to dev (dropping existing data)

## Option 3: Using Node.js Script (For Programmatic Control)

### Steps

1. **Set environment variables**:
   ```bash
   export MONGO_URI_PROD="mongodb+srv://username:password@prod-cluster.mongodb.net/Tuneable?retryWrites=true&w=majority"
   export MONGO_URI_DEV="mongodb+srv://username:password@dev-cluster.mongodb.net/Tuneable?retryWrites=true&w=majority"
   ```

   Or add them to your `.env` file:
   ```
   MONGO_URI_PROD=mongodb+srv://...
   MONGO_URI_DEV=mongodb+srv://...
   ```

2. **Run the script**:
   ```bash
   cd tuneable-backend
   node scripts/copy-production-to-dev.js
   ```

The script will:
- Connect to both clusters
- Copy all collections one by one
- Show progress for each collection
- Ask for confirmation before proceeding

## Getting Your Connection Strings

1. Go to MongoDB Atlas dashboard
2. Click **Connect** on your cluster
3. Choose **Connect your application**
4. Copy the connection string
5. Replace `<password>` with your actual password
6. Replace `<dbname>` with `Tuneable` (or your database name)

## Important Notes

⚠️ **WARNING**: Both scripts will **OVERWRITE** all existing data in your dev cluster!

- Make sure you have backups of your dev cluster if needed
- The scripts include safety confirmations
- Large databases may take a while to copy
- Network connectivity to both clusters is required

## Troubleshooting

### Connection Issues

- Ensure your IP address is whitelisted in Atlas Network Access
- Check that your connection strings are correct
- Verify database user has read/write permissions

### Authentication Errors

- Make sure passwords don't contain special characters that need URL encoding
- Use the correct database user credentials
- Check that the user has appropriate roles

### Timeout Issues

- For very large databases, consider using Atlas Cloud Backup instead
- You can modify the batch size in the Node.js script if needed

## Collections Copied

The scripts copy these collections:
- users
- media
- bids
- parties
- comments
- notifications
- claims
- labels
- collectives
- reports
- inviterequests
- quotas
- tunebytestransactions
- adminsettings
- podcastepisodes (if exists)

Adjust the `COLLECTIONS` array in the Node.js script if you need to modify this list.

