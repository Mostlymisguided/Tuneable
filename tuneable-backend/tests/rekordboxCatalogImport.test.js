/**
 * Rekordbox catalog-only import: XML playlist parse + track conversion (no DB).
 * Run: npx jest tests/rekordboxCatalogImport.test.js
 */

const {
  listPlaylistsFromContent,
  getTracksFromPlaylistsFromContent,
} = require('../scripts/lib/rekordboxXml');
const { convertRekordboxTrack } = require('../services/libraryImportService');

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <PRODUCT Name="rekordbox" Version="6.0.0" Company="Pioneer DJ"/>
  <COLLECTION Entries="2">
    <TRACK TrackID="101" Name="Track One" Artist="Artist A" Album="LP" Genre="House"
           TotalTime="180" AverageBpm="122.00" Tonality="8A" Year="2020"
           Location="file://localhost/tmp/missing-track-one.mp3"/>
    <TRACK TrackID="102" Name="Track Two" Artist="Artist B" Album="LP" Genre="Techno"
           TotalTime="240" AverageBpm="130.00" Tonality="5A"
           Location="file://localhost/tmp/missing-track-two.mp3"/>
  </COLLECTION>
  <PLAYLISTS>
    <NODE Type="0" Name="ROOT" Count="1">
      <NODE Name="House Favorites" Type="1" KeyType="0" Entries="2">
        <TRACK Key="101"/>
        <TRACK Key="102"/>
      </NODE>
    </NODE>
  </PLAYLISTS>
</DJ_PLAYLISTS>`;

describe('Rekordbox XML playlist parse', () => {
  it('lists leaf playlists with track counts', async () => {
    const playlists = await listPlaylistsFromContent(SAMPLE_XML);
    expect(playlists).toHaveLength(1);
    expect(playlists[0].name).toBe('House Favorites');
    expect(playlists[0].trackCount).toBe(2);
  });

  it('resolves tracks for a named playlist including BPM and key', async () => {
    const { tracks, unmatchedPlaylists } = await getTracksFromPlaylistsFromContent(
      SAMPLE_XML,
      ['House Favorites']
    );
    expect(unmatchedPlaylists).toEqual([]);
    expect(tracks).toHaveLength(2);
    expect(tracks[0].title).toBe('Track One');
    expect(tracks[0].artist).toBe('Artist A');
    expect(tracks[0].bpm).toBe(122);
    expect(tracks[0].key).toBe('8A');
    expect(tracks[0].duration).toBe(180);
    expect(tracks[0].playlistName).toBe('House Favorites');
  });

  it('uses the full collection when no playlists are named', async () => {
    const { tracks, usedFullCollection } = await getTracksFromPlaylistsFromContent(SAMPLE_XML, []);
    expect(usedFullCollection).toBe(true);
    expect(tracks).toHaveLength(2);
  });

  it('rejects non-Rekordbox XML', async () => {
    await expect(listPlaylistsFromContent('<?xml version="1.0"?><plist></plist>'))
      .rejects.toThrow(/Rekordbox/i);
  });
});

describe('convertRekordboxTrack', () => {
  it('maps XML fields into catalog import shape with a rekordbox id', () => {
    const converted = convertRekordboxTrack({
      trackId: '101',
      title: 'Track One',
      artist: 'Artist A',
      album: 'LP',
      genre: 'House',
      bpm: 122,
      key: '8A',
      duration: 180,
      year: 2020,
      filePath: '/tmp/missing-track-one.mp3',
      fileExists: false,
      playlistName: 'House Favorites',
    });

    expect(converted.title).toBe('Track One');
    expect(converted.artist).toBe('Artist A');
    expect(converted.bpm).toBe(122);
    expect(converted.key).toBe('8A');
    expect(converted.externalIds.rekordbox).toBe('101');
    expect(converted.sources).toEqual({});
    expect(converted.importSource).toBe('rekordbox');
    expect(converted.coverArt).toBeNull();
  });

  it('always supplies a catalog identifier even without TrackID', () => {
    const converted = convertRekordboxTrack({
      title: 'Untitled',
      artist: 'Someone',
    });
    expect(converted.externalIds.rekordbox).toBe('name:Untitled::Someone');
  });
});
