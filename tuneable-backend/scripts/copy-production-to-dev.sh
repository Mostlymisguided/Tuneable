#!/bin/bash

# Script to copy production MongoDB Atlas cluster to dev cluster
# Usage: ./copy-production-to-dev.sh
# 
# Requires:
# - MONGO_URI_PROD environment variable (production connection string)
# - MONGO_URI_DEV environment variable (dev connection string)
# - mongodump and mongorestore installed (or use MongoDB Atlas Cloud Backup)

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Starting Production to Dev Cluster Copy${NC}\n"

# Check if mongodump and mongorestore are available
if ! command -v mongodump &> /dev/null; then
    echo -e "${RED}❌ mongodump not found. Please install MongoDB Database Tools:${NC}"
    echo "   macOS: brew install mongodb-database-tools"
    echo "   Or download from: https://www.mongodb.com/try/download/database-tools"
    exit 1
fi

if ! command -v mongorestore &> /dev/null; then
    echo -e "${RED}❌ mongorestore not found. Please install MongoDB Database Tools${NC}"
    exit 1
fi

# Check for environment variables
if [ -z "$MONGO_URI_PROD" ]; then
    echo -e "${RED}❌ MONGO_URI_PROD environment variable not set${NC}"
    echo "   Please set it to your production MongoDB Atlas connection string"
    exit 1
fi

if [ -z "$MONGO_URI_DEV" ]; then
    echo -e "${RED}❌ MONGO_URI_DEV environment variable not set${NC}"
    echo "   Please set it to your dev MongoDB Atlas connection string"
    exit 1
fi

# Extract database name from URI (assuming it's in the path)
DB_NAME="Tuneable"  # Default database name, adjust if different

# Create backup directory with timestamp
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="mongodb-backup-prod-to-dev-${TIMESTAMP}"
mkdir -p "$BACKUP_DIR"

echo -e "${YELLOW}📦 Step 1: Dumping production database...${NC}"
echo "   Source: Production Cluster"
echo "   Destination: $BACKUP_DIR"
echo ""

# Dump production database
mongodump --uri="$MONGO_URI_PROD" --out="$BACKUP_DIR" 2>&1 | tee "$BACKUP_DIR/export.log"

if [ ${PIPESTATUS[0]} -ne 0 ]; then
    echo -e "${RED}❌ Failed to dump production database${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Production database dumped successfully${NC}\n"

echo -e "${YELLOW}📥 Step 2: Restoring to dev database...${NC}"
echo "   Source: $BACKUP_DIR"
echo "   Destination: Dev Cluster"
echo ""
echo -e "${RED}⚠️  WARNING: This will OVERWRITE all data in the dev cluster!${NC}"
read -p "   Are you sure you want to continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo -e "${YELLOW}❌ Operation cancelled${NC}"
    exit 0
fi

# Restore to dev database
mongorestore --uri="$MONGO_URI_DEV" --drop "$BACKUP_DIR/$DB_NAME" 2>&1 | tee "$BACKUP_DIR/import.log"

if [ ${PIPESTATUS[0]} -ne 0 ]; then
    echo -e "${RED}❌ Failed to restore to dev database${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Successfully copied production database to dev cluster!${NC}\n"
echo -e "${YELLOW}📁 Backup files saved in: $BACKUP_DIR${NC}"
echo "   You can delete this directory after verifying the copy was successful."

