/**
 * Names of unique single-field indexes that should no longer be unique.
 * MongoDB keeps the old unique index after the schema drops `unique: true`.
 */
function uniqueSingleFieldIndexNames(indexes, field) {
  if (!Array.isArray(indexes) || !field) return [];
  return indexes
    .filter((idx) => {
      if (!idx || !idx.name || idx.unique !== true || !idx.key) return false;
      const keys = Object.keys(idx.key);
      return keys.length === 1 && idx.key[field] === 1;
    })
    .map((idx) => idx.name);
}

async function repairNonUniqueFieldIndex(collection, field) {
  if (!collection || typeof collection.indexes !== 'function') {
    return { dropped: [] };
  }

  const dropped = [];
  for (const name of uniqueSingleFieldIndexNames(await collection.indexes(), field)) {
    await collection.dropIndex(name);
    dropped.push(name);
  }

  if (typeof collection.createIndex === 'function') {
    await collection.createIndex({ [field]: 1 }, { unique: false });
  }

  return { dropped };
}

module.exports = {
  uniqueSingleFieldIndexNames,
  repairNonUniqueFieldIndex,
};
