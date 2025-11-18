#!/bin/bash

# MongoDB Atlas Migration Script
# Migrates data from free cluster to flex cluster using mongodump/mongorestore
#
# Usage:
#   ./migrate-to-flex-cluster.sh
#
# Make sure to set SOURCE_URI and DEST_URI environment variables or edit them below

set -e  # Exit on error

# ============================================
# CONFIGURATION
# ============================================
# Replace these with your actual connection strings
# Format: mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority

# Source cluster (free cluster)
# Set via environment variable: export SOURCE_URI="mongodb+srv://username:password@source-cluster.mongodb.net/database"
SOURCE_URI="${SOURCE_URI:-}"

# Destination cluster (flex cluster)
# Set via environment variable: export DEST_URI="mongodb+srv://username:password@dest-cluster.mongodb.net/database"
DEST_URI="${DEST_URI:-}"

# Backup directory
BACKUP_DIR="./mongodb-backup-$(date +%Y%m%d-%H%M%S)"
DATABASE_NAME="tuneable"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ============================================
# FUNCTIONS
# ============================================

print_step() {
    echo -e "\n${GREEN}▶ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

# ============================================
# PRE-FLIGHT CHECKS
# ============================================

print_step "Checking prerequisites..."

# Check if mongodump is available
if ! command -v mongodump &> /dev/null; then
    print_error "mongodump not found. Please install MongoDB Database Tools."
    echo "Install via Homebrew: brew install mongodb-database-tools"
    exit 1
fi

# Check if mongorestore is available
if ! command -v mongorestore &> /dev/null; then
    print_error "mongorestore not found. Please install MongoDB Database Tools."
    echo "Install via Homebrew: brew install mongodb-database-tools"
    exit 1
fi

print_success "MongoDB tools are available"

# Check if connection strings are set
if [[ -z "$SOURCE_URI" ]] || [[ -z "$DEST_URI" ]]; then
    print_warning "Please set SOURCE_URI and DEST_URI environment variables"
    echo ""
    echo "Example:"
    echo "  export SOURCE_URI='mongodb+srv://username:password@source-cluster.mongodb.net/database'"
    echo "  export DEST_URI='mongodb+srv://username:password@dest-cluster.mongodb.net/database'"
    echo "  ./migrate-to-flex-cluster.sh"
    echo ""
    read -p "Do you want to continue with manual input? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
    read -sp "Enter SOURCE_URI (hidden): " SOURCE_URI
    echo
    read -sp "Enter DEST_URI (hidden): " DEST_URI
    echo
fi

# ============================================
# BACKUP FROM SOURCE
# ============================================

print_step "Step 1: Exporting data from source cluster..."

# Create backup directory
mkdir -p "$BACKUP_DIR"
print_success "Created backup directory: $BACKUP_DIR"

# Export data
print_warning "This may take a while depending on database size..."
mongodump --uri="$SOURCE_URI" --out="$BACKUP_DIR" 2>&1 | tee "$BACKUP_DIR/export.log"

if [ ${PIPESTATUS[0]} -eq 0 ]; then
    print_success "Data exported successfully"
else
    print_error "Export failed. Check $BACKUP_DIR/export.log for details"
    exit 1
fi

# ============================================
# VERIFY BACKUP
# ============================================

print_step "Step 2: Verifying backup..."

if [ -d "$BACKUP_DIR/$DATABASE_NAME" ]; then
    COLLECTION_COUNT=$(find "$BACKUP_DIR/$DATABASE_NAME" -name "*.bson" | wc -l | tr -d ' ')
    print_success "Found $COLLECTION_COUNT collections in backup"
    
    # List collections
    echo ""
    echo "Collections found:"
    find "$BACKUP_DIR/$DATABASE_NAME" -name "*.bson" -exec basename {} .bson \; | sort
else
    print_error "Backup directory structure is incorrect"
    exit 1
fi

# ============================================
# IMPORT TO DESTINATION
# ============================================

print_step "Step 3: Importing data to destination cluster..."

print_warning "This will import data to: $DEST_URI"
print_warning "Make sure this is correct before proceeding!"
echo ""
read -p "Continue with import? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_warning "Import cancelled. Backup is saved in: $BACKUP_DIR"
    exit 0
fi

# Import data
print_warning "Importing data... This may take a while..."
mongorestore --uri="$DEST_URI" --drop "$BACKUP_DIR/$DATABASE_NAME" 2>&1 | tee "$BACKUP_DIR/import.log"

if [ ${PIPESTATUS[0]} -eq 0 ]; then
    print_success "Data imported successfully"
else
    print_error "Import failed. Check $BACKUP_DIR/import.log for details"
    exit 1
fi

# ============================================
# VERIFICATION
# ============================================

print_step "Step 4: Verifying migration..."

# Count collections in source
print_warning "Verifying collection counts..."
echo "This step requires MongoDB connection. You can verify manually in Atlas UI."

# ============================================
# SUMMARY
# ============================================

print_step "Migration Summary"
echo ""
echo "✓ Backup location: $BACKUP_DIR"
echo "✓ Source cluster: $SOURCE_URI"
echo "✓ Destination cluster: $DEST_URI"
echo ""
print_success "Migration completed!"
echo ""
print_warning "Next steps:"
echo "1. Verify data in Atlas UI for destination cluster"
echo "2. Update MONGO_URI in your .env file to point to new cluster"
echo "3. Test your application with the new cluster"
echo "4. Once verified, you can delete the old cluster"
echo ""
echo "Backup is saved in: $BACKUP_DIR"
echo "Keep this backup until you've verified the migration is successful!"

