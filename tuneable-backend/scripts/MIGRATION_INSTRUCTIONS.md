# MongoDB Atlas Migration Guide

## Migrating from Free Cluster to Flex Cluster

This guide walks you through migrating your MongoDB data from a free Atlas cluster to a new flex cluster using `mongodump` and `mongorestore`.

## Prerequisites

1. **MongoDB Database Tools installed**
   ```bash
   brew install mongodb-database-tools
   ```

2. **Connection strings for both clusters**
   - Source cluster (free): Get from Atlas → Connect → Connect your application
   - Destination cluster (flex): Get from Atlas → Connect → Connect your application

## Step-by-Step Migration

### Option 1: Using the Migration Script (Recommended)

1. **Set your connection strings:**
   ```bash
   export SOURCE_URI="mongodb+srv://username:password@source-cluster.mongodb.net/tuneable?retryWrites=true&w=majority"
   export DEST_URI="mongodb+srv://username:password@dest-cluster.mongodb.net/tuneable?retryWrites=true&w=majority"
   ```

2. **Run the migration script:**
   ```bash
   cd tuneable-backend/scripts
   ./migrate-to-flex-cluster.sh
   ```

3. **Follow the prompts** - the script will:
   - Export all data from source cluster
   - Create a backup in `./mongodb-backup-YYYYMMDD-HHMMSS/`
   - Import data to destination cluster
   - Provide verification steps

### Option 2: Manual Migration

1. **Export from source cluster:**
   ```bash
   mongodump --uri="mongodb+srv://username:password@source-cluster.mongodb.net/tuneable" --out=./backup
   ```

2. **Verify the backup:**
   ```bash
   ls -la ./backup/tuneable/
   # Should see .bson files for each collection
   ```

3. **Import to destination cluster:**
   ```bash
   mongorestore --uri="mongodb+srv://username:password@dest-cluster.mongodb.net/tuneable" --drop ./backup/tuneable
   ```
   
   **Note:** The `--drop` flag will delete existing collections before importing. Remove it if you want to merge data.

## After Migration

### 1. Verify Data in Atlas UI

- Go to your destination cluster in Atlas
- Browse Collections to verify all data is present
- Check collection counts match source cluster

### 2. Update Connection String

Update your `.env` file (or `.env.production` for production):

```bash
# Old (free cluster)
MONGO_URI=mongodb+srv://username:password@old-cluster.mongodb.net/tuneable

# New (flex cluster)
MONGO_URI=mongodb+srv://username:password@new-cluster.mongodb.net/tuneable
```

### 3. Test Your Application

1. **Restart your backend:**
   ```bash
   # Stop current server
   # Start with new connection string
   npm start
   ```

2. **Test critical functionality:**
   - User login/registration
   - Media uploads
   - Party creation
   - Bidding functionality
   - Data retrieval

### 4. Monitor for Issues

- Check application logs for connection errors
- Monitor Atlas metrics for the new cluster
- Verify all features work as expected

### 5. Clean Up

Once you've verified everything works:

1. **Keep the backup** for at least 7 days
2. **Delete the old cluster** in Atlas (if no longer needed)
3. **Update any other services** that use the MongoDB connection string

## Troubleshooting

### Connection Issues

- **"Authentication failed"**: Check username/password in connection string
- **"Connection timeout"**: Verify IP whitelist in Atlas (Network Access)
- **"SSL/TLS error"**: Ensure connection string uses `mongodb+srv://`

### Import Issues

- **"Collection already exists"**: Use `--drop` flag or manually drop collections first
- **"Index creation failed"**: Some indexes may need to be recreated manually
- **"Out of memory"**: For large databases, consider migrating in batches

### Verification

To compare collection counts between clusters:

```bash
# Source cluster
mongo "$SOURCE_URI" --eval "db.getCollectionNames().forEach(c => print(c + ': ' + db[c].count()))"

# Destination cluster  
mongo "$DEST_URI" --eval "db.getCollectionNames().forEach(c => print(c + ': ' + db[c].count()))"
```

## Important Notes

- **Downtime**: This method requires application downtime during migration
- **Backup**: Always keep a backup until migration is verified
- **Indexes**: Indexes are included in the dump, but verify they're created correctly
- **Validation**: Always verify data integrity after migration
- **Rollback**: Keep old cluster running until migration is fully verified

## Need Help?

If you encounter issues:
1. Check the backup logs in `mongodb-backup-*/export.log` and `import.log`
2. Verify connection strings are correct
3. Check Atlas network access settings
4. Review MongoDB Atlas documentation

