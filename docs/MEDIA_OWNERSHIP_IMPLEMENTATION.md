# Media Ownership Implementation

## 🎯 Overview

Implemented a comprehensive media ownership system for Tuneable that replaces the single `rightsHolder` field with a flexible `mediaOwners` array supporting multiple owners with percentage-based revenue distribution.

## 🔧 Key Changes

### 1. **Media Schema Updates** (`models/Media.js`)

#### New `mediaOwners` Field
```javascript
mediaOwners: [{
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  percentage: { type: Number, min: 0, max: 100, required: true },
  role: { 
    type: String, 
    enum: ['creator', 'aux'],
    default: 'creator'
  },
  verified: { type: Boolean, default: false },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  addedAt: { type: Date, default: Date.now },
  _id: false
}]
```

#### Edit History Tracking
```javascript
editHistory: [{
  editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  editedAt: { type: Date, default: Date.now },
  changes: [{
    field: { type: String, required: true },
    oldValue: { type: mongoose.Schema.Types.Mixed },
    newValue: { type: mongoose.Schema.Types.Mixed }
  }],
  _id: false
}]
```

#### Virtual Fields for Readability
- `mediaOwnersWithUsernames` - Populated usernames for media owners
- `editHistoryWithUsernames` - Populated usernames for edit history

### 2. **Permission System Updates** (`routes/mediaRoutes.js`)

#### Enhanced Permission Logic
```javascript
// Check permissions: must be admin OR media owner OR verified creator
const isAdmin = req.user.role && req.user.role.includes('admin');
const isMediaOwner = media.mediaOwners && media.mediaOwners.some(
  owner => owner.userId.toString() === userId.toString()
);
const isVerifiedCreator = media.verifiedCreators && media.verifiedCreators.some(
  creatorId => creatorId.toString() === userId.toString()
);
```

#### Change Tracking
- Tracks all field changes before updating
- Logs changes to `editHistory` with user attribution
- Maintains audit trail for disputes

### 3. **Helper Methods**

#### Media Owner Management
- `addMediaOwner(userId, percentage, role, addedBy)` - Add new owner
- `removeMediaOwner(userId)` - Remove owner
- `updateOwnerPercentage(userId, newPercentage)` - Update ownership %
- `getTotalOwnershipPercentage()` - Get total ownership

#### Validation
- Prevents total ownership > 100%
- Prevents duplicate owners
- Validates percentage ranges

### 4. **Migration Script** (`scripts/migrateRightsHolderToMediaOwners.js`)

#### Migration Process
1. Finds all media with existing `rightsHolder`
2. Creates `mediaOwners` array with 100% ownership
3. Adds edit history entry for the migration
4. Removes old `rightsHolder` field
5. Provides detailed migration report

#### Usage
```bash
cd tuneable-backend
node scripts/migrateRightsHolderToMediaOwners.js
```

### 5. **Test Script** (`scripts/testMediaOwners.js`)

#### Test Coverage
- Adding/removing media owners
- Updating ownership percentages
- Error handling (exceeding 100%)
- Virtual fields with populated usernames
- Edit history tracking

#### Usage
```bash
cd tuneable-backend
node scripts/testMediaOwners.js
```

## 🚀 Benefits

### **Revenue Distribution**
- **Percentage-based ownership** for fair revenue splitting
- **Multiple owners** supported per media item
- **Role-based ownership** (creator, aux)

### **Permission Management**
- **Media owners** can edit any media information
- **Admins** have override permissions
- **Verified creators** retain edit access
- **Clear audit trail** for all changes

### **Dispute Resolution**
- **Complete edit history** with user attribution
- **Change tracking** for all field modifications
- **Timestamped edits** for chronological tracking

### **Data Integrity**
- **Validation** prevents invalid ownership percentages
- **Migration safety** preserves existing data
- **Index optimization** for performance

## 📊 Database Indexes

Added indexes for performance:
- `mediaOwners.userId` - Find media by owner
- `mediaOwners.verified` - Find verified owners
- `editHistory.editedBy` - Find edits by user
- `editHistory.editedAt` - Recent edits sorting

## 🔄 Migration Strategy

1. **Deploy schema changes** (new fields are optional)
2. **Run migration script** to move existing data
3. **Update frontend** to use new `mediaOwners` field
4. **Remove old `rightsHolder` references** after migration

## 🎯 Usage Examples

### Adding Media Owners
```javascript
// Add primary owner (60%)
media.addMediaOwner(userId, 60, 'primary', addedByUserId);

// Add secondary owner (40%)
media.addMediaOwner(userId2, 40, 'secondary', addedByUserId);

// Update ownership percentage
media.updateOwnerPercentage(userId, 70);
```

### Checking Permissions
```javascript
// Check if user can edit media
const canEdit = isAdmin || isMediaOwner || isVerifiedCreator;
```

### Accessing Edit History
```javascript
// Get edit history with usernames
const history = media.editHistoryWithUsernames;
```

## 🔧 Next Steps

1. **Run migration script** to move existing data
2. **Update frontend** to display `mediaOwners` instead of `rightsHolder`
3. **Add API endpoints** for managing media ownership
4. **Implement revenue distribution** logic using ownership percentages
5. **Add ownership verification** workflow

## 📝 Notes

- **Backward compatibility** maintained during transition
- **Virtual fields** provide populated usernames for readability
- **Edit history** tracks all changes for audit purposes
- **Validation** ensures data integrity
- **Migration script** safely moves existing data
