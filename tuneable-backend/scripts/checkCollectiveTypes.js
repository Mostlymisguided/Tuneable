#!/usr/bin/env node
/**
 * Quick script to check current state of collective types
 */

require('dotenv').config();
const mongoose = require('mongoose');

async function checkTypes() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const db = mongoose.connection.db;
    const collectivesCollection = db.collection('collectives');

    // Get all collectives and their types
    const all = await collectivesCollection.find({})
      .project({ name: 1, slug: 1, type: 1, isActive: 1 })
      .toArray();

    console.log('📊 Total collectives:', all.length);
    console.log('');

    // Separate by type format
    const stringTypes = all.filter(c => typeof c.type === 'string');
    const arrayTypes = all.filter(c => Array.isArray(c.type));
    const otherTypes = all.filter(c => typeof c.type !== 'string' && !Array.isArray(c.type));

    console.log('✅ Array types:', arrayTypes.length);
    arrayTypes.forEach(c => {
      console.log(`   ${c.name} (${c.slug}): [${c.type.join(', ')}]`);
    });
    console.log('');

    console.log('⚠️  String types:', stringTypes.length);
    stringTypes.forEach(c => {
      console.log(`   ${c.name} (${c.slug}): "${c.type}"`);
    });
    console.log('');

    if (otherTypes.length > 0) {
      console.log('❓ Other types:', otherTypes.length);
      otherTypes.forEach(c => {
        console.log(`   ${c.name}: ${typeof c.type} - ${JSON.stringify(c.type)}`);
      });
      console.log('');
    }

    // Check for venues specifically
    const venues = all.filter(c => {
      if (Array.isArray(c.type)) return c.type.includes('venue');
      if (typeof c.type === 'string') return c.type === 'venue';
      return false;
    });

    console.log('🏢 Total venues (active + inactive):', venues.length);
    const activeVenues = venues.filter(v => v.isActive !== false);
    console.log('🏢 Active venues:', activeVenues.length);
    activeVenues.forEach(v => {
      console.log(`   ${v.name} - type: ${JSON.stringify(v.type)}`);
    });

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkTypes();
