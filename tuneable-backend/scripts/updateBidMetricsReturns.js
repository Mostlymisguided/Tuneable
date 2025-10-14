/**
 * Script to update all bid metrics with proper returns structure
 * 
 * This script systematically adds the missing returns and associatedEntities
 * fields to all metrics in the bid metrics schema.
 */

const fs = require('fs');
const path = require('path');

// Template functions for generating returns structures
function getAggregateReturns(entities) {
  const base = {
    amount: 'Number',
    currency: 'String'
  };
  
  if (entities.includes('user')) {
    Object.assign(base, {
      userId: 'ObjectId',
      userUuid: 'String',
      username: 'String'
    });
  }
  
  if (entities.includes('media')) {
    Object.assign(base, {
      mediaId: 'ObjectId',
      mediaUuid: 'String',
      title: 'String',
      artist: 'String'
    });
  }
  
  if (entities.includes('party')) {
    Object.assign(base, {
      partyId: 'ObjectId',
      partyUuid: 'String',
      partyName: 'String'
    });
  }
  
  return base;
}

function getTopReturns(entities, scope) {
  const base = {
    amount: 'Number',
    currency: 'String'
  };
  
  // Top metrics always return the entity that has the top value
  if (entities.includes('user') || entities.length === 0) {
    Object.assign(base, {
      userId: 'ObjectId',
      userUuid: 'String',
      username: 'String'
    });
  }
  
  if (entities.includes('media') || entities.length === 0) {
    Object.assign(base, {
      mediaId: 'ObjectId',
      mediaUuid: 'String',
      title: 'String',
      artist: 'String'
    });
  }
  
  if (entities.includes('party') || (scope === 'party' && entities.length === 0)) {
    Object.assign(base, {
      partyId: 'ObjectId',
      partyUuid: 'String',
      partyName: 'String'
    });
  }
  
  return base;
}

function getAverageReturns(entities) {
  const base = {
    average: 'Number',
    currency: 'String',
    count: 'Number' // Number of bids used to calculate average
  };
  
  if (entities.includes('user')) {
    Object.assign(base, {
      userId: 'ObjectId',
      userUuid: 'String',
      username: 'String'
    });
  }
  
  if (entities.includes('media')) {
    Object.assign(base, {
      mediaId: 'ObjectId',
      mediaUuid: 'String',
      title: 'String',
      artist: 'String'
    });
  }
  
  if (entities.includes('party')) {
    Object.assign(base, {
      partyId: 'ObjectId',
      partyUuid: 'String',
      partyName: 'String'
    });
  }
  
  return base;
}

function getRankReturns(entities, scope) {
  const base = {
    rank: 'Number',
    totalCount: 'Number',
    percentile: 'Number' // 0-100
  };
  
  if (entities.includes('user')) {
    Object.assign(base, {
      userId: 'ObjectId',
      userUuid: 'String',
      username: 'String'
    });
  }
  
  if (entities.includes('media')) {
    Object.assign(base, {
      mediaId: 'ObjectId',
      mediaUuid: 'String',
      title: 'String',
      artist: 'String'
    });
  }
  
  if (entities.includes('party') || (scope === 'party' && entities.length === 0)) {
    Object.assign(base, {
      partyId: 'ObjectId',
      partyUuid: 'String',
      partyName: 'String'
    });
  }
  
  return base;
}

function getAssociatedEntities(entities, scope) {
  const associated = [...entities];
  
  // For global scope with no entities, include all relevant entities
  if (scope === 'global' && entities.length === 0) {
    associated.push('user', 'media', 'party');
  }
  
  // For party scope with no entities, include party context
  if (scope === 'party' && entities.length === 0) {
    associated.push('user', 'party');
  }
  
  return associated;
}

async function updateBidMetricsSchema() {
  try {
    const schemaPath = path.join(__dirname, '../utils/bidMetricsSchema.js');
    let content = fs.readFileSync(schemaPath, 'utf8');
    
    console.log('🔄 Updating bid metrics schema with returns structures...');
    
    // Read the current schema to get all metrics
    const { BID_METRICS_SCHEMA } = require('../utils/bidMetricsSchema');
    
    let updatedCount = 0;
    
    for (const [metricName, config] of Object.entries(BID_METRICS_SCHEMA)) {
      // Skip if already has returns structure
      if (config.returns) continue;
      
      const scope = config.scope;
      const type = config.type;
      const entities = config.entities || [];
      
      let returns;
      let associatedEntities;
      
      switch (type) {
        case 'aggregate':
          returns = getAggregateReturns(entities);
          associatedEntities = getAssociatedEntities(entities, scope);
          break;
          
        case 'top':
          returns = getTopReturns(entities, scope);
          associatedEntities = getAssociatedEntities(entities, scope);
          break;
          
        case 'average':
          returns = getAverageReturns(entities);
          associatedEntities = getAssociatedEntities(entities, scope);
          break;
          
        case 'rank':
          returns = getRankReturns(entities, scope);
          associatedEntities = getAssociatedEntities(entities, scope);
          break;
          
        default:
          console.warn(`Unknown metric type: ${type} for ${metricName}`);
          continue;
      }
      
      // Create the replacement string
      const returnsStr = JSON.stringify(returns, null, 6).replace(/"/g, "'");
      const associatedStr = JSON.stringify(associatedEntities, null, 2).replace(/"/g, "'");
      
      // Find and replace the metric definition
      const metricPattern = new RegExp(
        `(${metricName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*{[^}]*?)(outputType:\\s*'[^']*',)\\s*(description:[^,]*),`,
        's'
      );
      
      const replacement = `$1outputType: '${config.outputType}',\n    returns: ${returnsStr},\n    associatedEntities: ${associatedStr},\n    $3,`;
      
      const newContent = content.replace(metricPattern, replacement);
      
      if (newContent !== content) {
        content = newContent;
        updatedCount++;
        console.log(`✅ Updated ${metricName}`);
      } else {
        console.log(`⚠️  Could not update ${metricName} (pattern not found)`);
      }
    }
    
    // Write the updated content back to the file
    fs.writeFileSync(schemaPath, content);
    
    console.log(`\n🎉 Updated ${updatedCount} metrics with returns structures!`);
    console.log('📋 Summary:');
    console.log('- Added returns field with detailed output structure');
    console.log('- Added associatedEntities field with relevant entity types');
    console.log('- All metrics now specify what they return and what entities are included');
    
  } catch (error) {
    console.error('❌ Error updating bid metrics schema:', error);
  }
}

// Run if called directly
if (require.main === module) {
  updateBidMetricsSchema();
}

module.exports = updateBidMetricsSchema;
