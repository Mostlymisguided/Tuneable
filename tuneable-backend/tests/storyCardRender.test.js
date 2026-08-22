/**
 * Smoke test: story card PNG compositing (no DB).
 * Run: npx jest tests/storyCardRender.test.js
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { renderStoryCardPng } = require('../services/storyCardService');
const { buildStoryCardCopy } = require('../services/storyCardCopy');

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const COVER_PATH = path.join(__dirname, 'tmp-story-cover.png');

describe('story card render', () => {
  beforeAll(async () => {
    await sharp({
      create: {
        width: 400,
        height: 400,
        channels: 3,
        background: { r: 120, g: 40, b: 200 },
      },
    })
      .png()
      .toFile(COVER_PATH);
  });

  afterAll(() => {
    try {
      fs.unlinkSync(COVER_PATH);
    } catch {
      // ignore
    }
  });

  it('rasterizes the Tuneable logo', async () => {
    const logo = await sharp(path.join(__dirname, '../assets/tuneable-logo.svg'))
      .resize(72, 72)
      .png()
      .toBuffer();
    expect(logo.subarray(0, 8).equals(PNG_MAGIC)).toBe(true);
  });

  it('renders a 9:16 story PNG from local cover art', async () => {
    const copy = buildStoryCardCopy({
      kind: 'tune',
      title: 'Glue',
      artist: 'Bicep',
      championPence: 240,
      tagRankings: [{ tag: 'House', rank: 3, total: 40 }],
    });

    const png = await renderStoryCardPng(copy, `file://${COVER_PATH}`, 'story');
    expect(png.subarray(0, 8).equals(PNG_MAGIC)).toBe(true);
    const meta = await sharp(png).metadata();
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1920);
  }, 15000);

  it('renders a 1200×630 OG PNG', async () => {
    const copy = buildStoryCardCopy({
      kind: 'episode',
      title: 'Interview special',
      artist: 'The Show',
    });
    const png = await renderStoryCardPng(copy, `file://${COVER_PATH}`, 'og');
    const meta = await sharp(png).metadata();
    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(630);
  }, 15000);
});
