#!/usr/bin/env node

/**
 * Transaction Verification Job
 * 
 * Background job to verify all financial transactions for tamper detection.
 * Run this periodically (e.g., daily via cron) to check for hash mismatches.
 * 
 * Usage:
 *   node scripts/verifyTransactions.js [--type=WalletTransaction] [--limit=1000]
 */

require('dotenv').config();
const db = require('../db');
const verificationService = require('../services/transactionVerificationService');

async function main() {
  try {
    console.log('🔍 Starting transaction verification...\n');
    
    // Connect to database
    await db.connectDB();
    console.log('✅ Connected to database\n');

    // Parse command line arguments
    const args = process.argv.slice(2);
    const typeArg = args.find(arg => arg.startsWith('--type='));
    const limitArg = args.find(arg => arg.startsWith('--limit='));
    
    const transactionType = typeArg ? typeArg.split('=')[1] : null;
    const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 1000;

    let results;

    if (transactionType) {
      // Verify specific transaction type
      console.log(`Verifying ${transactionType} transactions (limit: ${limit})...\n`);
      results = await verificationService.verifyAllTransactions(transactionType, { limit });
      
      console.log(`\n📊 Results for ${transactionType}:`);
      console.log(`   Total checked: ${results.total}`);
      console.log(`   ✅ Verified: ${results.verified}`);
      console.log(`   ❌ Mismatches: ${results.mismatches}`);
      console.log(`   ⚠️  Missing hashes: ${results.missing}`);
      console.log(`   🔴 Errors: ${results.errors}`);
      
      if (results.mismatches > 0) {
        console.log(`\n⚠️  SECURITY ALERT: ${results.mismatches} hash mismatch(es) detected!`);
        console.log('   Anomalies:');
        results.anomalies.forEach((anomaly, index) => {
          console.log(`   ${index + 1}. Transaction ${anomaly.transactionUuid || anomaly.transactionId}`);
          console.log(`      Original hash: ${anomaly.originalHash.substring(0, 16)}...`);
          console.log(`      Current hash:  ${anomaly.currentHash.substring(0, 16)}...`);
        });
      }
    } else {
      // Verify all transaction types
      console.log(`Verifying all financial transactions (limit: ${limit} per type)...\n`);
      results = await verificationService.verifyAllFinancialTransactions({ limit });
      
      console.log(`\n📊 Overall Results:`);
      console.log(`   Total checked: ${results.summary.total}`);
      console.log(`   ✅ Verified: ${results.summary.verified}`);
      console.log(`   ❌ Mismatches: ${results.summary.mismatches}`);
      console.log(`   ⚠️  Missing hashes: ${results.summary.missing}`);
      console.log(`   🔴 Errors: ${results.summary.errors}`);
      
      console.log(`\n📊 By Type:`);
      Object.entries(results.byType).forEach(([type, typeResults]) => {
        console.log(`   ${type}:`);
        console.log(`      Total: ${typeResults.total}, Verified: ${typeResults.verified}, Mismatches: ${typeResults.mismatches}`);
      });
      
      if (results.summary.mismatches > 0) {
        console.log(`\n⚠️  SECURITY ALERT: ${results.summary.mismatches} hash mismatch(es) detected across all types!`);
        console.log(`   Total anomalies: ${results.anomalies.length}`);
        
        // Show first 10 anomalies
        const showAnomalies = results.anomalies.slice(0, 10);
        console.log(`\n   First ${showAnomalies.length} anomalies:`);
        showAnomalies.forEach((anomaly, index) => {
          console.log(`   ${index + 1}. [${anomaly.transactionType}] ${anomaly.transactionUuid || anomaly.transactionId}`);
        });
        
        if (results.anomalies.length > 10) {
          console.log(`   ... and ${results.anomalies.length - 10} more`);
        }
      }
    }

    // Get verification statistics
    console.log(`\n📈 Verification Statistics:`);
    const stats = await verificationService.getVerificationStats();
    console.log(`   Total verification records: ${stats.total}`);
    stats.byStatus.forEach(status => {
      console.log(`   ${status._id}: ${status.count}`);
    });

    console.log(`\n✅ Verification complete!`);
    
    // Exit with error code if mismatches found (for cron alerts)
    if (results.summary?.mismatches > 0 || results.mismatches > 0) {
      process.exit(1);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { main };

