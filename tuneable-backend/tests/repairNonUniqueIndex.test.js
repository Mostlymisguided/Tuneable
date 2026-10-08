const { uniqueSingleFieldIndexNames } = require('../utils/repairNonUniqueIndex');

describe('repairNonUniqueIndex', () => {
  it('selects only unique indexes on the named field', () => {
    expect(uniqueSingleFieldIndexNames([
      { name: 'email_1', key: { email: 1 }, unique: true },
      { name: 'email_1_name_1', key: { email: 1, name: 1 }, unique: true },
      { name: 'slug_1', key: { slug: 1 }, unique: true },
      { name: 'email_lookup', key: { email: 1 }, unique: false },
    ], 'email')).toEqual(['email_1']);
  });
});
