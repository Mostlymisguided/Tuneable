/**
 * Run: npx jest tests/mediaSlug.test.js
 */

const { buildMediaSlugBase, planSlugUpdate, slugMatchesBase } = require('../utils/mediaSlug');

const radjlion = {
  title: 'Game Over Freestyle Rap',
  artist: [{ name: 'Radjlion' }],
  contentForm: ['tune'],
};

describe('buildMediaSlugBase title edits', () => {
  it('shortens the slug when the title is shortened', () => {
    expect(buildMediaSlugBase(radjlion)).toBe('radjlion-game-over-freestyle-rap');
    expect(buildMediaSlugBase({ ...radjlion, title: 'Game Over' })).toBe('radjlion-game-over');
  });
});

describe('planSlugUpdate', () => {
  it('moves the previous slug to an alias when the title is shortened', () => {
    const plan = planSlugUpdate({
      currentSlug: 'radjlion-game-over-freestyle-rap',
      slugAliases: [],
      availableSlug: 'radjlion-game-over',
      base: 'radjlion-game-over',
    });

    expect(plan).toEqual({
      slug: 'radjlion-game-over',
      slugAliases: ['radjlion-game-over-freestyle-rap'],
      changed: true,
    });
  });

  it('does not treat a longer title slug as a collision suffix', () => {
    expect(slugMatchesBase('radjlion-game-over-freestyle-rap', 'radjlion-game-over')).toBe(false);
    expect(slugMatchesBase('radjlion-game-over-2', 'radjlion-game-over')).toBe(true);
  });

  it('keeps a numbered slug when the canonical url is still taken', () => {
    const plan = planSlugUpdate({
      currentSlug: 'radjlion-game-over-2',
      slugAliases: [],
      availableSlug: 'radjlion-game-over-2',
      base: 'radjlion-game-over',
    });

    expect(plan.changed).toBe(false);
    expect(plan.slug).toBe('radjlion-game-over-2');
  });

  it('claims the canonical slug when a numbered collision suffix is now free to shorten', () => {
    const plan = planSlugUpdate({
      currentSlug: 'radjlion-game-over-2',
      slugAliases: ['radjlion-game-over-freestyle-rap'],
      availableSlug: 'radjlion-game-over',
      base: 'radjlion-game-over',
    });

    expect(plan.slug).toBe('radjlion-game-over');
    expect(plan.slugAliases).toEqual([
      'radjlion-game-over-freestyle-rap',
      'radjlion-game-over-2',
    ]);
    expect(plan.changed).toBe(true);
  });

  it('drops the new slug from aliases when it becomes canonical', () => {
    const plan = planSlugUpdate({
      currentSlug: 'radjlion-game-over-freestyle-rap',
      slugAliases: ['radjlion-game-over'],
      availableSlug: 'radjlion-game-over',
      base: 'radjlion-game-over',
    });

    expect(plan.slug).toBe('radjlion-game-over');
    expect(plan.slugAliases).toEqual(['radjlion-game-over-freestyle-rap']);
  });
});
