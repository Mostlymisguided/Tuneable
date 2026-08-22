/**
 * Render branded 9:16 story cards and 1200×630 OG images for a media item.
 */

const path = require('path');
const fs = require('fs');
const axios = require('axios');
const NodeCache = require('node-cache');
const sharp = require('sharp');
const Media = require('../models/Media');
const { isValidObjectId } = require('../utils/validators');
const { getMediaCoverArt, DEFAULT_COVER_ART } = require('../utils/coverArtUtils');
const { getMediaTagRankings } = require('./mediaTagRankingsService');
const { getMediaLocationRankings } = require('./locationProfileService');
const {
  MIN_CHART_POOL,
  detectMediaKind,
  creatorLabel,
  canonicalMediaPath,
  buildStoryCardCopy,
  buildShareCaption,
} = require('./storyCardCopy');

const LOGO_PATH = path.join(__dirname, '../assets/tuneable-logo.svg');
const FONT_STACK = "DejaVu Sans, Liberation Sans, Arial, Helvetica, sans-serif";

const STORY_SIZE = { width: 1080, height: 1920 };
const OG_SIZE = { width: 1200, height: 630 };

const cardCache = new NodeCache({
  stdTTL: 300,
  checkperiod: 60,
  maxKeys: 80,
  useClones: false,
});

function escapeXml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function wrapText(text, maxChars, maxLines) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (!raw) return [];
  const words = raw.split(' ');
  const lines = [];
  let current = '';

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    if (lines.length === maxLines - 1) break;
  }

  if (current && lines.length < maxLines) {
    const remainingIndex = raw.indexOf(current) + current.length;
    const leftover = remainingIndex < raw.length;
    if (leftover && lines.length === maxLines - 1) {
      lines.push(truncateLine(current, maxChars));
    } else {
      lines.push(current);
    }
  } else if (lines.length === maxLines && current && !raw.endsWith(lines[lines.length - 1])) {
    lines[maxLines - 1] = truncateLine(lines[maxLines - 1], maxChars);
  }

  return lines.slice(0, maxLines);
}

function truncateLine(line, maxChars) {
  if (line.length <= maxChars) return line;
  if (maxChars <= 1) return '…';
  return `${line.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
}

function slugifyFilename(title) {
  const slug = String(title || 'tuneable')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || 'tuneable';
}

function absoluteCoverUrl(imageUrl) {
  if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.trim()) {
    return DEFAULT_COVER_ART;
  }
  const trimmed = imageUrl.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  const base = (process.env.FRONTEND_URL || process.env.BACKEND_URL || 'https://tuneable.stream').replace(/\/$/, '');
  return trimmed.startsWith('/') ? `${base}${trimmed}` : `${base}/${trimmed}`;
}

async function fetchImageBuffer(url) {
  if (url.startsWith('file://')) {
    const filePath = decodeURIComponent(url.replace(/^file:\/\//, ''));
    return fs.promises.readFile(filePath);
  }
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 8000,
    maxContentLength: 8 * 1024 * 1024,
    headers: { 'User-Agent': 'TuneableStoryCard/1.0' },
    validateStatus: (status) => status >= 200 && status < 400,
  });
  return Buffer.from(response.data);
}

async function roundedCover(buffer, size, radius) {
  const resized = await sharp(buffer)
    .rotate()
    .resize(size, size, { fit: 'cover', position: 'attention' })
    .png()
    .toBuffer();

  const mask = Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="#fff"/>
    </svg>`
  );

  return sharp(resized)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

function tspans(lines, x, startY, lineHeight, fill, size, weight) {
  return lines
    .map((line, index) => {
      const y = startY + index * lineHeight;
      return `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" font-weight="${weight}" font-family="${FONT_STACK}">${escapeXml(line)}</text>`;
    })
    .join('\n');
}

function pillSvg(text, x, y, maxWidth) {
  const label = String(text || '');
  if (!label) return { svg: '', height: 0 };
  const charW = 22;
  const padX = 36;
  const height = 72;
  const width = Math.min(maxWidth, Math.max(220, label.length * charW + padX * 2));
  return {
    height,
    svg: `
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="36" fill="rgba(168,85,247,0.28)" stroke="#C084FC" stroke-width="2"/>
      <text x="${x + padX}" y="${y + 48}" fill="#F5E9FF" font-size="32" font-weight="700" font-family="${FONT_STACK}">${escapeXml(label)}</text>
    `,
  };
}

function backgroundSvg(width, height) {
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#12081F"/>
        <stop offset="42%" stop-color="#2E1065"/>
        <stop offset="100%" stop-color="#0B1220"/>
      </linearGradient>
      <radialGradient id="glow" cx="50%" cy="28%" r="55%">
        <stop offset="0%" stop-color="#A855F7" stop-opacity="0.28"/>
        <stop offset="100%" stop-color="#A855F7" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#bg)"/>
    <rect width="100%" height="100%" fill="url(#glow)"/>
  </svg>`);
}

function storyOverlaySvg(copy) {
  const { width, height } = STORY_SIZE;
  const titleLines = wrapText(copy.title, 22, 2);
  const artistLines = wrapText(copy.artist, 28, 1);
  const titleY = 1168;
  const artistY = titleY + titleLines.length * 72 + 8;
  const pill = pillSvg(copy.stat, 80, artistY + 36, width - 160);
  const ctaY = artistY + 36 + (pill.height ? pill.height + 56 : 48);

  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <text x="168" y="148" fill="#FFFFFF" font-size="44" font-weight="700" font-family="${FONT_STACK}">tuneable</text>
    <text x="80" y="196" fill="#C4B5FD" font-size="22" font-weight="600" letter-spacing="4" font-family="${FONT_STACK}">${escapeXml(copy.kicker)}</text>
    ${tspans(titleLines, 80, titleY, 72, '#FFFFFF', 58, 700)}
    ${tspans(artistLines, 80, artistY, 44, '#DDD6FE', 34, 500)}
    ${pill.svg}
    <text x="80" y="${ctaY}" fill="#F5E9FF" font-size="34" font-weight="600" font-family="${FONT_STACK}">${escapeXml(copy.cta)}</text>
    <text x="80" y="1854" fill="#A78BFA" font-size="26" font-weight="500" font-family="${FONT_STACK}">tuneable.stream</text>
  </svg>`);
}

function ogOverlaySvg(copy) {
  const { width, height } = OG_SIZE;
  const titleLines = wrapText(copy.title, 18, 2);
  const artistLines = wrapText(copy.artist, 24, 1);
  const titleY = 210;
  const artistY = titleY + titleLines.length * 52 + 4;
  const pill = pillSvg(copy.stat, 600, artistY + 24, 540);
  const ctaY = artistY + 24 + (pill.height ? pill.height + 48 : 40);

  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <text x="684" y="118" fill="#FFFFFF" font-size="36" font-weight="700" font-family="${FONT_STACK}">tuneable</text>
    <text x="600" y="162" fill="#C4B5FD" font-size="18" font-weight="600" letter-spacing="3" font-family="${FONT_STACK}">${escapeXml(copy.kicker)}</text>
    ${tspans(titleLines, 600, titleY, 52, '#FFFFFF', 42, 700)}
    ${tspans(artistLines, 600, artistY, 34, '#DDD6FE', 26, 500)}
    ${pill.svg}
    <text x="600" y="${Math.min(ctaY, 560)}" fill="#F5E9FF" font-size="24" font-weight="600" font-family="${FONT_STACK}">${escapeXml(copy.cta)}</text>
    <text x="600" y="598" fill="#A78BFA" font-size="18" font-weight="500" font-family="${FONT_STACK}">tuneable.stream</text>
  </svg>`);
}

async function resolveMedia(id) {
  const cleanId = id ? String(id).trim() : '';
  if (!cleanId) return null;
  if (cleanId.includes('-') && cleanId.length > 20) {
    return Media.findOne({ uuid: cleanId })
      .populate('podcastSeries', 'title coverArt genres tags')
      .lean();
  }
  if (isValidObjectId(cleanId)) {
    return Media.findById(cleanId)
      .populate('podcastSeries', 'title coverArt genres tags')
      .lean();
  }
  return null;
}

async function loadCardContext(media) {
  const [tagRankings, locationRankings] = await Promise.all([
    getMediaTagRankings(media, { limit: 3 }).catch((err) => {
      console.warn('story-card tag rankings failed:', err.message);
      return [];
    }),
    getMediaLocationRankings(media, { limit: 2, minTotal: MIN_CHART_POOL }).catch((err) => {
      console.warn('story-card location rankings failed:', err.message);
      return [];
    }),
  ]);

  const kind = detectMediaKind(media);
  const copy = buildStoryCardCopy({
    kind,
    title: media.title,
    artist: creatorLabel(media),
    championPence: media.globalMediaAggregateTop,
    tagRankings,
    locationRankings,
  });

  return { kind, copy };
}

async function renderPng(copy, coverUrl, format) {
  const size = format === 'og' ? OG_SIZE : STORY_SIZE;
  const coverSize = format === 'og' ? 500 : 840;
  const coverRadius = format === 'og' ? 36 : 48;
  const logoSize = format === 'og' ? 64 : 72;

  let coverBuffer;
  try {
    coverBuffer = await fetchImageBuffer(coverUrl);
  } catch (err) {
    console.warn('story-card cover fetch failed, using default:', err.message);
    coverBuffer = await fetchImageBuffer(DEFAULT_COVER_ART).catch(() => null);
  }

  const [rounded, logo] = await Promise.all([
    coverBuffer
      ? roundedCover(coverBuffer, coverSize, coverRadius)
      : sharp({
          create: {
            width: coverSize,
            height: coverSize,
            channels: 4,
            background: { r: 88, g: 28, b: 135, alpha: 1 },
          },
        })
          .png()
          .toBuffer()
          .then((buf) => roundedCover(buf, coverSize, coverRadius)),
    sharp(LOGO_PATH).resize(logoSize, logoSize).png().toBuffer(),
  ]);

  const overlay = format === 'og' ? ogOverlaySvg(copy) : storyOverlaySvg(copy);
  const coverLeft = format === 'og' ? 64 : Math.round((size.width - coverSize) / 2);
  const coverTop = format === 'og' ? 65 : 230;
  const logoLeft = format === 'og' ? 600 : 80;
  const logoTop = format === 'og' ? 70 : 96;

  return sharp(backgroundSvg(size.width, size.height))
    .composite([
      { input: rounded, left: coverLeft, top: coverTop },
      { input: logo, left: logoLeft, top: logoTop },
      { input: overlay, left: 0, top: 0 },
    ])
    .png({ compressionLevel: 8 })
    .toBuffer();
}

async function buildMediaStoryCard(id, { format = 'story' } = {}) {
  const cardFormat = format === 'og' ? 'og' : 'story';
  const media = await resolveMedia(id);
  if (!media) return null;

  const kind = detectMediaKind(media);
  const cacheKey = [
    String(media._id),
    cardFormat,
    media.globalMediaAggregate || 0,
    media.globalMediaAggregateTop || 0,
    (media.updatedAt && new Date(media.updatedAt).getTime()) || 0,
  ].join(':');

  const cached = cardCache.get(cacheKey);
  if (cached) return cached;

  const { copy } = await loadCardContext(media);
  const coverUrl = absoluteCoverUrl(getMediaCoverArt(media));
  const buffer = await renderPng(copy, coverUrl, cardFormat);
  const frontendUrl = (process.env.FRONTEND_URL || 'https://tuneable.stream').replace(/\/$/, '');
  const sharePath = canonicalMediaPath(kind, media._id);
  const shareUrl = `${frontendUrl}${sharePath}`;

  const result = {
    buffer,
    copy,
    kind,
    contentType: 'image/png',
    filename: `${slugifyFilename(copy.title)}-tuneable-${cardFormat}.png`,
    shareUrl,
    shareCaption: buildShareCaption(copy, shareUrl),
    cacheKey,
  };

  try {
    cardCache.set(cacheKey, result);
  } catch {
    // maxKeys eviction can throw if set races; ignore
  }
  return result;
}

function publicStoryCardUrl(req, mediaId, format = 'og') {
  const proto = req.protocol || 'https';
  const host = req.get('host');
  if (host) {
    return `${proto}://${host}/api/media/story-card/${mediaId}?format=${format}`;
  }
  const backend = (process.env.BACKEND_URL || process.env.FRONTEND_URL || 'https://tuneable.stream').replace(/\/$/, '');
  return `${backend}/api/media/story-card/${mediaId}?format=${format}`;
}

module.exports = {
  buildMediaStoryCard,
  publicStoryCardUrl,
  detectMediaKind,
  canonicalMediaPath,
  renderStoryCardPng: renderPng,
};
