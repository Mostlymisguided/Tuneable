/**
 * Books chart vs Global Party / music chart filters (no DB).
 * Run: npx jest tests/bookChartIsolation.test.js
 */

const { BOOK_CATALOG_QUERY, isWrittenMedia } = require('../utils/mediaKinds');
const { GLOBAL_PARTY_TUNES_FILTER, chartTunesFilter } = require('../utils/globalPartyChart');
const { isMediaPlayable } = require('../utils/mediaPlayability');

describe('books vs music chart isolation', () => {
  it('keeps Global Party charts on music + tune', () => {
    expect(GLOBAL_PARTY_TUNES_FILTER.contentType).toEqual({ $in: ['music'] });
    expect(GLOBAL_PARTY_TUNES_FILTER.contentForm).toEqual({ $in: ['tune'] });
  });

  it('keeps the books chart on written + book', () => {
    expect(BOOK_CATALOG_QUERY.contentType).toEqual({ $in: ['written'] });
    expect(BOOK_CATALOG_QUERY.contentForm).toEqual({ $in: ['book'] });
  });

  it('does not overlap book catalog rows with the music chart filter', () => {
    const musicTypes = GLOBAL_PARTY_TUNES_FILTER.contentType.$in;
    const musicForms = GLOBAL_PARTY_TUNES_FILTER.contentForm.$in;
    expect(musicTypes).not.toEqual(expect.arrayContaining(BOOK_CATALOG_QUERY.contentType.$in));
    expect(musicForms).not.toEqual(expect.arrayContaining(BOOK_CATALOG_QUERY.contentForm.$in));
  });

  it('treats catalog books as non-playable', () => {
    const book = {
      contentType: ['written'],
      contentForm: ['book'],
      sources: { openLibrary: 'https://openlibrary.org/works/OL45883W' },
      rightsStatus: 'cleared',
      rightsCleared: true,
    };
    expect(isWrittenMedia(book)).toBe(true);
    expect(isMediaPlayable(book)).toBe(false);
  });

  it('nests the playable $or under $and so a location $or is preserved', () => {
    const filter = chartTunesFilter({
      playableOnly: true,
      extra: { $or: [{ 'primaryLocation.placeId': 'x' }] },
    });
    expect(filter.$and).toEqual(expect.arrayContaining([
      GLOBAL_PARTY_TUNES_FILTER,
      { $or: [{ 'primaryLocation.placeId': 'x' }] },
    ]));
    const playableClause = filter.$and.find((clause) => clause['sources.upload']);
    expect(playableClause.$or).toEqual(expect.arrayContaining([
      { rightsStatus: 'permitted' },
    ]));
  });

  it('omits the playable clause when All is requested', () => {
    expect(chartTunesFilter({ playableOnly: false })).toEqual(GLOBAL_PARTY_TUNES_FILTER);
  });

  it('counts excluded catalog only while Playable is on', () => {
    const { hiddenCatalogCount } = require('../utils/globalPartyChart');
    expect(hiddenCatalogCount(true, 250, 22)).toBe(228);
    expect(hiddenCatalogCount(true, 22, 22)).toBe(0);
    expect(hiddenCatalogCount(false, 250, 22)).toBe(0);
  });

  it('casts hex strings back to ObjectIds for Bid.aggregate $in', () => {
    const mongoose = require('mongoose');
    const { toObjectIds } = require('../utils/globalPartyChart');
    const id = new mongoose.Types.ObjectId();
    const [cast] = toObjectIds([id.toString(), id.toString(), 'not-an-id']);
    expect(cast).toBeInstanceOf(mongoose.Types.ObjectId);
    expect(cast.toString()).toBe(id.toString());
    expect(toObjectIds([id, id.toString()])).toHaveLength(1);
    expect(toObjectIds([])).toEqual([]);
  });
});
