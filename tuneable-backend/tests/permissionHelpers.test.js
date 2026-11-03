/**
 * Run: npx jest tests/permissionHelpers.test.js
 */

const mongoose = require('mongoose');
const {
  canEditMedia,
  isMediaOwner,
  isVerifiedCreatorOnMedia,
} = require('../utils/permissionHelpers');

const ownerId = new mongoose.Types.ObjectId();
const creatorId = new mongoose.Types.ObjectId();
const strangerId = new mongoose.Types.ObjectId();

function user(id, role) {
  return { _id: id, role };
}

describe('canEditMedia licence editors', () => {
  const catalogTune = {
    artist: 'DJ Nay',
    artists: [{ name: 'DJ Nay', userId: null, verified: false }],
    addedBy: strangerId,
    mediaOwners: [{
      userId: ownerId,
      percentage: 0,
      role: 'aux',
      verified: false,
      verificationMethod: 'library_import_curator',
    }],
  };

  it('denies a logged-in user who is not an owner, admin, or verified credit', () => {
    expect(canEditMedia(user(strangerId, ['user']), catalogTune)).toBe(false);
  });

  it('denies a platform creator who is not credited on the tune', () => {
    expect(canEditMedia(user(strangerId, ['user', 'creator']), catalogTune)).toBe(false);
  });

  it('denies the uploader and a 0% library-import curator', () => {
    expect(canEditMedia(user(strangerId, ['user']), catalogTune)).toBe(false);
    expect(isMediaOwner(user(ownerId, ['user']), catalogTune)).toBe(false);
    expect(canEditMedia(user(ownerId, ['creator']), catalogTune)).toBe(false);
  });

  it('allows an admin, a stake-holding owner, and a verified credited creator', () => {
    const owned = {
      artists: [{ name: 'Bate', userId: creatorId, verified: true }],
      mediaOwners: [{ userId: ownerId, percentage: 100, role: 'creator', verified: true }],
    };

    expect(canEditMedia(user(strangerId, ['admin']), owned)).toBe(true);
    expect(canEditMedia(user(ownerId, ['user']), owned)).toBe(true);
    expect(canEditMedia(user(creatorId, ['creator']), owned)).toBe(true);
    expect(isVerifiedCreatorOnMedia(user(creatorId, ['creator']), owned)).toBe(true);
  });

  it('denies an unverified credit and a credit with no user id', () => {
    const tune = {
      artists: [
        { name: 'Named', userId: creatorId, verified: false },
        { name: 'Unknown', userId: null, verified: true },
      ],
      mediaOwners: [],
    };
    expect(canEditMedia(user(creatorId, ['creator']), tune)).toBe(false);
    expect(canEditMedia(user(strangerId, ['user']), tune)).toBe(false);
  });

  it('does not treat two missing ids as the same person', () => {
    const tune = {
      mediaOwners: [{ userId: {}, percentage: 100 }],
    };
    expect(canEditMedia({ _id: {}, role: ['user'] }, tune)).toBe(false);
  });

  it('matches an ObjectId owner and a verified creator returned by the media method', () => {
    const media = {
      mediaOwners: [{ userId: ownerId, percentage: 100 }],
      getVerifiedCreators() {
        return [{ role: 'artist', name: 'Bate', userId: creatorId }];
      },
    };
    expect(canEditMedia(user(ownerId, ['user']), media)).toBe(true);
    expect(canEditMedia(user(creatorId, ['user']), media)).toBe(true);
    expect(canEditMedia(user(strangerId, ['user', 'creator']), media)).toBe(false);
  });
});
