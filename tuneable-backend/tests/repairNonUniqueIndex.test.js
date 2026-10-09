const {
  uniqueSingleFieldIndexNames,
  indexesToReplaceWithPartialUnique,
} = require('../utils/repairNonUniqueIndex');

describe('repairNonUniqueIndex', () => {
  it('selects only unique indexes on the named field', () => {
    expect(uniqueSingleFieldIndexNames([
      { name: 'email_1', key: { email: 1 }, unique: true },
      { name: 'email_1_name_1', key: { email: 1, name: 1 }, unique: true },
      { name: 'slug_1', key: { slug: 1 }, unique: true },
      { name: 'email_lookup', key: { email: 1 }, unique: false },
    ], 'email')).toEqual(['email_1']);
  });

  it('replaces a full unique name index and keeps the active-only one', () => {
    expect(indexesToReplaceWithPartialUnique([
      { name: 'name_1', key: { name: 1 }, unique: true },
      {
        name: 'name_active_unique',
        key: { name: 1 },
        unique: true,
        partialFilterExpression: { isActive: true },
      },
      { name: 'email_1', key: { email: 1 }, unique: false },
    ], 'name', 'name_active_unique')).toEqual(['name_1']);
  });
});
