/**
 * Run: npx jest tests/profileImage.test.js
 */

const crypto = require('crypto');
const sharp = require('sharp');
const {
  normalizeProfileImage,
  PROFILE_IMAGE_MAX_BYTES,
  PROFILE_IMAGE_MAX_EDGE,
} = require('../utils/r2Upload');

describe('normalizeProfileImage', () => {
  it('leaves a small image unchanged', async () => {
    const buffer = await sharp({
      create: { width: 200, height: 200, channels: 3, background: { r: 20, g: 40, b: 80 } },
    }).jpeg().toBuffer();

    expect(buffer.length).toBeLessThan(PROFILE_IMAGE_MAX_BYTES);
    await expect(normalizeProfileImage(buffer, 'avatar.jpg')).resolves.toBeNull();
  });

  it('shrinks a full-resolution phone JPEG under 5MB', async () => {
    const width = 3200;
    const height = 2400;
    const raw = crypto.randomBytes(width * height * 3);
    const buffer = await sharp(raw, { raw: { width, height, channels: 3 } })
      .jpeg({ quality: 95 })
      .toBuffer();

    expect(buffer.length).toBeGreaterThan(PROFILE_IMAGE_MAX_BYTES);

    const normalized = await normalizeProfileImage(buffer, 'IMG_0001.JPG');
    expect(normalized).not.toBeNull();
    expect(normalized.mimetype).toBe('image/jpeg');
    expect(normalized.originalname).toBe('IMG_0001.jpg');
    expect(normalized.buffer.length).toBeLessThanOrEqual(PROFILE_IMAGE_MAX_BYTES);
    expect(normalized.buffer.length).toBeLessThan(buffer.length);

    const meta = await sharp(normalized.buffer).metadata();
    expect(meta.width).toBeLessThanOrEqual(PROFILE_IMAGE_MAX_EDGE);
    expect(meta.height).toBeLessThanOrEqual(PROFILE_IMAGE_MAX_EDGE);
    expect(Math.max(meta.width, meta.height)).toBe(PROFILE_IMAGE_MAX_EDGE);
  });
});
