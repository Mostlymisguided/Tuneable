const { markViewerTipped } = require('../utils/viewerTipped');

describe('markViewerTipped', () => {
  it('flags only the media the viewer has tipped', () => {
    const rows = markViewerTipped(
      [
        { _id: 'aaa', title: 'Tipped' },
        { _id: 'bbb', title: 'Not tipped' },
        { id: 'ccc', title: 'By id' },
      ],
      ['aaa', 'ccc']
    );
    expect(rows.map((row) => row.viewerTipped)).toEqual([true, false, true]);
  });

  it('leaves an empty list alone and marks nothing when there are no tips', () => {
    expect(markViewerTipped([], ['aaa'])).toEqual([]);
    expect(markViewerTipped([{ _id: 'aaa' }], []).map((row) => row.viewerTipped)).toEqual([false]);
  });
});
