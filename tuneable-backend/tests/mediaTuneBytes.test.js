const mongoose = require('mongoose');
const { mediaIdKey, tuneBytesFor } = require('../utils/mediaTuneBytes');

describe('mediaTuneBytes', () => {
  it('reads a media total from object ids and nested ids', () => {
    const totals = new Map([['abc', 12.5]]);
    expect(tuneBytesFor(totals, 'abc')).toBe(12.5);
    expect(tuneBytesFor(totals, { _id: 'abc' })).toBe(12.5);
    expect(tuneBytesFor(totals, 'missing')).toBe(0);
    expect(tuneBytesFor(totals, null)).toBe(0);
  });

  it('stringifies object ids and ignores empty values', () => {
    expect(mediaIdKey('507f1f77bcf86cd799439011')).toBe('507f1f77bcf86cd799439011');
    expect(mediaIdKey({ _id: '507f1f77bcf86cd799439011' })).toBe('507f1f77bcf86cd799439011');
    const objectId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439011');
    expect(mediaIdKey(objectId)).toBe('507f1f77bcf86cd799439011');
    expect(mediaIdKey({ _id: objectId })).toBe('507f1f77bcf86cd799439011');
    expect(mediaIdKey(null)).toBeNull();
    expect(mediaIdKey('')).toBeNull();
  });
});
