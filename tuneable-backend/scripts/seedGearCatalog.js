#!/usr/bin/env node
/**
 * Seed the Gear catalog from tuneable-backend/data/gearCatalog.js
 *
 * Usage: node scripts/seedGearCatalog.js
 * Requires MONGODB_URI (or MONGO_URI) in env — loads .env from backend root.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Gear = require('../models/Gear');
const catalog = require('../data/gearCatalog');
const { refreshGearStats } = require('../services/gearService');

async function upsertGear({ name, type, manufacturer = null, category = null }) {
  const existing = await Gear.findByNameAndType(name, type);
  if (existing) {
    existing.name = name;
    existing.manufacturer = manufacturer || existing.manufacturer;
    existing.category = category || existing.category;
    existing.isCatalog = true;
    existing.isActive = true;
    if (!existing.slug) {
      existing.slug = await Gear.generateUniqueSlug(name, type, existing._id);
    }
    await existing.save();
    return { action: 'updated', gear: existing };
  }

  const slug = await Gear.generateUniqueSlug(name, type);
  const gear = await Gear.create({
    name,
    slug,
    type,
    manufacturer,
    category,
    isCatalog: true,
    isActive: true,
  });
  return { action: 'created', gear };
}

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error('Missing MONGODB_URI');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  let created = 0;
  let updated = 0;

  for (const name of catalog.daws) {
    const { action } = await upsertGear({ name, type: 'daw' });
    if (action === 'created') created += 1;
    else updated += 1;
  }

  for (const plugin of catalog.plugins) {
    const { action } = await upsertGear({
      name: plugin.name,
      type: 'plugin',
      manufacturer: plugin.manufacturer,
      category: plugin.category,
    });
    if (action === 'created') created += 1;
    else updated += 1;
  }

  for (const hw of catalog.hardware) {
    const { action } = await upsertGear({
      name: hw.name,
      type: 'hardware',
      manufacturer: hw.manufacturer,
      category: hw.category,
    });
    if (action === 'created') created += 1;
    else updated += 1;
  }

  console.log(`Gear catalog seed complete: ${created} created, ${updated} updated`);

  // Refresh stats for all catalog gear (may be 0 until media is linked)
  const allGear = await Gear.find({ isCatalog: true }).select('_id name');
  for (const g of allGear) {
    await refreshGearStats(g._id);
  }
  console.log(`Refreshed stats for ${allGear.length} gear entries`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
