/**
 * Unit tests for story card copy (no DB, no sharp).
 * Run: npx jest tests/storyCardCopy.test.js
 */

const {
  formatPounds,
  amountToTakeChampion,
  detectMediaKind,
  canonicalMediaPath,
  creatorLabel,
  pickBestChartRanking,
  buildStoryCardCopy,
  buildShareCaption,
} = require('../services/storyCardCopy');

describe('amountToTakeChampion / formatPounds', () => {
  it('adds a penny above the current champion', () => {
    expect(amountToTakeChampion(2.4, 0)).toBe(2.41);
    expect(amountToTakeChampion(1, 0.5)).toBe(0.51);
    expect(formatPounds(2.41)).toBe('£2.41');
  });
});

describe('detectMediaKind / canonicalMediaPath', () => {
  it('routes tunes, episodes, and series to the right paths', () => {
    expect(detectMediaKind({ contentForm: ['tune'], contentType: ['music'] })).toBe('tune');
    expect(detectMediaKind({ contentForm: ['podcastepisode'], contentType: ['spoken'] })).toBe(
      'episode'
    );
    expect(detectMediaKind({ contentForm: ['podcastseries'] })).toBe('series');
    expect(canonicalMediaPath('tune', 'abc')).toBe('/tune/abc');
    expect(canonicalMediaPath('episode', 'abc')).toBe('/podcasts/abc');
    expect(canonicalMediaPath('series', 'abc')).toBe('/podcast/abc');
    expect(detectMediaKind({ contentForm: ['book'], contentType: ['written'] })).toBe('book');
    expect(canonicalMediaPath('book', 'abc')).toBe('/book/abc');
  });
});

describe('creatorLabel', () => {
  it('prefers creatorDisplay, then hosts, then artists', () => {
    expect(creatorLabel({ creatorDisplay: 'A & B' })).toBe('A & B');
    expect(creatorLabel({ host: [{ name: 'Sam' }] })).toBe('Sam');
    expect(creatorLabel({ artist: [{ name: 'Four Tet' }] })).toBe('Four Tet');
    expect(creatorLabel({ author: [{ name: 'Ursula K. Le Guin' }] })).toBe('Ursula K. Le Guin');
  });
});

describe('pickBestChartRanking', () => {
  it('ignores deep ranks and tiny pools', () => {
    expect(
      pickBestChartRanking(
        [{ tag: 'House', rank: 47, total: 200 }],
        [{ name: 'London', rank: 2, total: 2 }]
      )
    ).toBeNull();
  });

  it('prefers a city rank over a tied tag rank', () => {
    const picked = pickBestChartRanking(
      [
        { tag: 'House', rank: 3, total: 40 },
        { tag: 'Techno', rank: 8, total: 20 },
      ],
      [{ name: 'Bristol', rank: 3, total: 15, featureType: 'place' }]
    );
    expect(picked.label).toBe('Bristol');
    expect(picked.kind).toBe('location');
  });

  it('prefers the tag when a country rank is tied', () => {
    const picked = pickBestChartRanking(
      [{ tag: 'House', rank: 3, total: 40 }],
      [{ name: 'United Kingdom', rank: 3, total: 80, featureType: 'country' }]
    );
    expect(picked.label).toBe('House');
    expect(picked.kind).toBe('tag');
  });
});

describe('buildStoryCardCopy', () => {
  it('uses chart rank as the headline and champion amount as the CTA', () => {
    const copy = buildStoryCardCopy({
      kind: 'tune',
      title: 'Glue',
      artist: 'Bicep',
      championPence: 240,
      tagRankings: [{ tag: 'House', rank: 3, total: 50 }],
    });
    expect(copy.mode).toBe('chart');
    expect(copy.kicker).toBe('CHART');
    expect(copy.stat).toBe('#3 in House');
    expect(copy.cta).toBe('Tip £2.41 to take #1');
  });

  it('falls back to champion copy when there is no scene rank', () => {
    const copy = buildStoryCardCopy({
      kind: 'tune',
      title: 'Glue',
      artist: 'Bicep',
      championPence: 100,
      tagRankings: [{ tag: 'House', rank: 88, total: 90 }],
    });
    expect(copy.mode).toBe('champion');
    expect(copy.stat).toBe('Tip £1.01 to take #1');
    expect(copy.cta).toBe('Influence the charts on Tuneable');
  });

  it('uses location copy when that is the best rank and there is no champion', () => {
    const copy = buildStoryCardCopy({
      kind: 'tune',
      title: 'Glue',
      artist: 'Bicep',
      championPence: 0,
      locationRankings: [{ name: 'Bristol', rank: 3, total: 12, featureType: 'place' }],
    });
    expect(copy.mode).toBe('chart');
    expect(copy.kicker).toBe('NEAR YOU');
    expect(copy.stat).toBe('#3 in Bristol');
    expect(copy.cta).toBe('Tip to influence the charts near you');
  });

  it('uses now-playing when there is no rank or champion', () => {
    const copy = buildStoryCardCopy({
      kind: 'episode',
      title: 'Ep 12',
      artist: 'The Show',
    });
    expect(copy.mode).toBe('nowplaying');
    expect(copy.kicker).toBe('EPISODE');
    expect(copy.stat).toBe('');
    expect(copy.cta).toBe('Listen & tip on Tuneable');
  });
});

describe('buildShareCaption', () => {
  it('includes title, hook, and url', () => {
    const caption = buildShareCaption(
      { title: 'Glue', artist: 'Bicep', stat: '#3 in House', cta: 'Tip £2.41 to take #1' },
      'https://tuneable.stream/tune/1'
    );
    expect(caption).toBe('Glue — Bicep\n#3 in House\nhttps://tuneable.stream/tune/1');
  });
});
