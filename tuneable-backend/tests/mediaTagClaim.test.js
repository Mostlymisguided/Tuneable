/**
 * Claim chip partitioning: musical elements must survive an elements-only claim.
 * Run: npx jest tests/mediaTagClaim.test.js
 */

const { partitionClaimChips, normalizeClaimTags } = require('../services/mediaTagClaimService');

describe('partitionClaimChips', () => {
  it('keeps musical elements when the claim has no discovery tags', () => {
    expect(normalizeClaimTags(['Keys', 'Guitar'])).toEqual([]);
    expect(partitionClaimChips(['Keys', 'Guitar'])).toEqual({
      claimTags: [],
      elements: ['Keys', 'Guitar'],
    });
  });

  it('keeps elements alongside discovery tags', () => {
    expect(partitionClaimChips(['chill', 'keys'])).toEqual({
      claimTags: ['Chill'],
      elements: ['Keys'],
    });
  });

  it('returns nothing for blank input', () => {
    expect(partitionClaimChips(['  ', ''])).toEqual({
      claimTags: [],
      elements: [],
    });
  });

  it('does not let elements consume discovery-tag room', () => {
    const chips = [
      'Keys',
      'Guitar',
      'Piano',
      'Bass',
      'Drums',
      'Synth',
      'chill',
      'workout',
    ];
    const result = partitionClaimChips(chips);
    expect(result.elements).toEqual(['Keys', 'Guitar', 'Piano', 'Bass', 'Drums', 'Synth']);
    expect(result.claimTags).toEqual(['Chill', 'Workout']);
  });
});
