# Global Party System - Debugging Guide

## 🎯 **What We've Implemented:**

### ✅ **Core System:**
1. **Dynamic Global Party Detection** - Found by `type: 'global'` instead of hardcoded ID
2. **Bid Scope Consistency** - All Global Party bids have `bidScope: 'global'`
3. **Comprehensive Display** - Shows ALL media with ANY bids across platform
4. **No Data Redundancy** - Aggregates data dynamically

### ✅ **Migration Completed:**
- Global Party migrated to `type: 'global'`
- 258 existing global bids updated with `bidScope: 'global'`
- All party bidding routes updated for consistency

## 🐛 **Potential Bidding Issues to Debug:**

### **1. Bid Scope Inconsistency**
**Problem**: Some Global Party bids might still have `bidScope: 'party'`
**Check**: Run `testBidScopeConsistency.js` to verify all Global Party bids have `bidScope: 'global'`

### **2. Media Array Population**
**Problem**: `globalBids` array might not be populated correctly
**Check**: Verify that media items have both `bids` and `globalBids` arrays populated

### **3. Global Party Display**
**Problem**: Global Party might not show all media with bids
**Check**: Verify that Global Party fetches ALL media with ANY bids (not just its own)

### **4. Bid Creation Logic**
**Problem**: New bids in Global Party might not get correct `bidScope`
**Check**: Test creating bids via both methods:
- Via globalbid feature (TuneProfile)
- Via regular party bidding (within Global Party)

## 🔧 **Debugging Steps:**

### **Step 1: Verify Migration**
```bash
# Run the consistency test
node scripts/testBidScopeConsistency.js
```

### **Step 2: Test Bid Creation**
1. **Global Bid**: Place bid via TuneProfile globalbid feature
2. **Party Bid**: Place bid within Global Party via regular bidding
3. **Verify**: Both should have `bidScope: 'global'`

### **Step 3: Test Global Party Display**
1. **Access Global Party** via frontend
2. **Verify**: Shows ALL media with ANY bids (not just Global Party bids)
3. **Check**: Media appears even if bid was placed in regular party

### **Step 4: Check Data Consistency**
```javascript
// Check Global Party
const globalParty = await Party.getGlobalParty();
console.log('Global Party:', globalParty.name, globalParty.type);

// Check bid scopes
const globalPartyBids = await Bid.find({ partyId: globalParty._id });
const globalBids = globalPartyBids.filter(b => b.bidScope === 'global');
const partyBids = globalPartyBids.filter(b => b.bidScope === 'party');
console.log(`Global: ${globalBids.length}, Party: ${partyBids.length}`);
```

## 🚨 **Common Issues & Solutions:**

### **Issue 1: Global Party Not Found**
**Cause**: Migration didn't run or Global Party doesn't exist
**Solution**: Run migration scripts or create Global Party manually

### **Issue 2: Bids Have Wrong Scope**
**Cause**: Old bids not migrated or new bidding logic not working
**Solution**: Run bid migration script or check bidding route logic

### **Issue 3: Global Party Shows Empty**
**Cause**: Display logic not aggregating all media correctly
**Solution**: Check party details route logic for Global Party

### **Issue 4: Frontend Errors**
**Cause**: Frontend types not updated or API changes
**Solution**: Check frontend types and API compatibility

## 📋 **Testing Checklist:**

- [ ] Global Party found by `type: 'global'`
- [ ] All Global Party bids have `bidScope: 'global'`
- [ ] Global Party displays ALL media with ANY bids
- [ ] New bids in Global Party get correct scope
- [ ] Media arrays populated correctly
- [ ] Frontend displays Global Party correctly
- [ ] Search works in Global Party
- [ ] No duplicate data or redundancy

## 🔍 **Debug Commands:**

```bash
# Test Global Party system
node scripts/testGlobalPartySystem.js

# Test bid scope consistency
node scripts/testBidScopeConsistency.js

# Check specific Global Party
node -e "
const mongoose = require('mongoose');
const Party = require('./models/Party');
mongoose.connect('mongodb+srv://...').then(async () => {
  const gp = await Party.getGlobalParty();
  console.log('Global Party:', gp ? gp.name : 'Not found');
  process.exit(0);
});
"
```

## 📞 **Next Steps:**
1. **Commit and push** the changes
2. **Test the system** thoroughly
3. **Debug any issues** using this guide
4. **Verify all functionality** works as expected

The Global Party system is now ready for testing and debugging!
