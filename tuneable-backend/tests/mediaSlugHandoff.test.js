/**
 * Run: npx jest tests/mediaSlugHandoff.test.js
 */

const {
  isNumberedSlugOf,
  isSameRecording,
  pickSlugSuccessor,
  handoffDeletedSlug,
  resolveDeletedSuccessor,
} = require('../services/mediaSlugHandoff');

const deleted = {
  _id: 'deleted-1',
  title: 'Ausgehen',
  artist: [{ name: 'AnnenMayKantereit' }],
  slug: 'annenmaykantereit-ausgehen',
  status: 'deleted',
};

const live = {
  _id: 'live-1',
  title: 'Ausgehen',
  artist: [{ name: 'AnnenMayKantereit' }],
  slug: 'annenmaykantereit-ausgehen-2',
  slugAliases: [],
  status: 'active',
};

describe('slug successor matching', () => {
  it('recognises numbered variants of a base slug', () => {
    expect(isNumberedSlugOf('annenmaykantereit-ausgehen-2', 'annenmaykantereit-ausgehen')).toBe(true);
    expect(isNumberedSlugOf('annenmaykantereit-ausgehen', 'annenmaykantereit-ausgehen')).toBe(false);
    expect(isNumberedSlugOf('annenmaykantereit-ausgehen-2-3', 'annenmaykantereit-ausgehen')).toBe(false);
  });

  it('picks the single live duplicate that holds the numbered slug', () => {
    expect(pickSlugSuccessor(deleted, [live])).toEqual(live);
  });

  it('does not pick a numbered slug that belongs to a different recording', () => {
    const other = { ...live, _id: 'other', title: 'Something Else' };
    expect(pickSlugSuccessor(deleted, [other])).toBeNull();
  });

  it('refuses to guess when two live tunes could own the slug', () => {
    const second = { ...live, _id: 'live-2', slug: 'annenmaykantereit-ausgehen-3' };
    expect(pickSlugSuccessor(deleted, [live, second])).toBeNull();
  });

  it('accepts a live tune that already lists the slug as an alias', () => {
    const aliased = {
      ...live,
      slug: 'other-slug',
      slugAliases: ['annenmaykantereit-ausgehen'],
    };
    expect(isSameRecording(deleted, aliased)).toBe(true);
    expect(pickSlugSuccessor(deleted, [aliased])).toEqual(aliased);
  });
});

describe('handoffDeletedSlug', () => {
  it('frees the deleted slug and moves it onto the live tune', async () => {
    const updates = [];
    const Media = {
      find: () => ({
        select: () => Promise.resolve([live]),
      }),
      updateOne: async (filter, update) => {
        updates.push({ filter, update });
        return { acknowledged: true };
      },
    };

    const successor = await handoffDeletedSlug(Media, { ...deleted });

    expect(successor.slug).toBe('annenmaykantereit-ausgehen');
    expect(successor.slugAliases).toEqual(['annenmaykantereit-ausgehen-2']);
    expect(updates[0]).toEqual({
      filter: { _id: 'deleted-1' },
      update: { $unset: { slug: 1 }, $set: { supersededBy: 'live-1' } },
    });
    expect(updates[1].filter).toEqual({ _id: 'live-1' });
    expect(updates[1].update.$set.slug).toBe('annenmaykantereit-ausgehen');
    expect(updates[1].update.$set.slugAliases).toEqual(['annenmaykantereit-ausgehen-2']);
  });
});

describe('resolveDeletedSuccessor', () => {
  it('opens the live tune from a deleted uuid after the slug has already moved', async () => {
    const retired = {
      _id: 'deleted-1',
      title: 'Ausgehen',
      artist: [{ name: 'AnnenMayKantereit' }],
      status: 'deleted',
      uuid: '068e6712-bb37-748d-80cf-a99194831f03',
    };
    const surviving = {
      _id: 'live-1',
      title: 'Ausgehen',
      artist: [{ name: 'AnnenMayKantereit' }],
      slug: 'annenmaykantereit-ausgehen',
      slugAliases: ['annenmaykantereit-ausgehen-2'],
      status: 'active',
    };
    const updates = [];
    const Media = {
      find: () => ({
        select: () => Promise.resolve([surviving]),
      }),
      updateOne: async (filter, update) => {
        updates.push({ filter, update });
      },
    };

    const successor = await resolveDeletedSuccessor(Media, retired);

    expect(successor._id).toBe('live-1');
    expect(updates).toEqual([{
      filter: { _id: 'deleted-1' },
      update: { $set: { supersededBy: 'live-1' } },
    }]);
  });

  it('does not guess when the live slug belongs to a different recording', async () => {
    const retired = {
      _id: 'deleted-1',
      title: 'Time',
      artist: [{ name: 'Tale of Us' }],
      status: 'deleted',
    };
    const other = {
      _id: 'live-1',
      title: 'Time',
      artist: [{ name: 'Tale of Us' }],
      slug: 'some-other-time',
      slugAliases: [],
      status: 'active',
    };
    const Media = {
      find: () => ({
        select: () => Promise.resolve([other]),
      }),
      updateOne: async () => {
        throw new Error('should not write');
      },
    };

    expect(await resolveDeletedSuccessor(Media, retired)).toBeNull();
  });
});
