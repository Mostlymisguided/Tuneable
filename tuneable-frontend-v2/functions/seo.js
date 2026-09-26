/**
 * Search and link-preview HTML for crawlers that do not run the React app.
 * Googlebot is left on the SPA so it can index the rendered pages.
 */

export const SITE_ORIGIN = 'https://tuneable.stream';

const DEFAULT_DESCRIPTION =
  'Tip the music, podcasts, and books you love. Your tips support creators and move them up public charts on Tuneable.';
const DEFAULT_IMAGE = `${SITE_ORIGIN}/android-chrome-512x512.png`;

const PREVIEW_BOT =
  /facebookexternalhit|Facebot|Twitterbot|LinkedInBot|Slackbot|WhatsApp|Discordbot|TelegramBot|Pinterest|redditbot|Embedly|Applebot|bingbot|BingPreview|DuckDuckBot|Baiduspider|YandexBot|ia_archiver|PetalBot/i;

const STATIC_PAGES = {
  '/': chartPage(),
  '/explore': chartPage(),
  '/charts': chartPage(),
  '/party/global': chartPage(),
  '/home': page('About Tuneable', 'Tuneable is a social chart for music, podcasts, and books. Tip what you love, pay creators fairly, and help decide what rises.', '/about'),
  '/about': page(
    'About Tuneable',
    'Tuneable is a social chart for music, podcasts, and books. Tip what you love, pay creators fairly, and help decide what rises.',
    '/about',
    '<p>Listeners tip the music, podcasts, and books they love. Those tips support creators and decide what rises on public charts.</p>'
  ),
  '/help': page(
    'Help',
    'How Tuneable works: tipping, charts, TuneBytes, parties, and where your money goes.',
    '/help'
  ),
  '/join-us': page(
    'Join Tuneable',
    'Buy shares in Tuneable and help steer a chart that pays artists.',
    '/join-us'
  ),
  '/privacy-policy': page(
    'Privacy policy',
    'How Tuneable collects, uses, and protects your account and listening data.',
    '/privacy-policy'
  ),
  '/terms-of-service': page(
    'Terms of service',
    'The terms for using Tuneable, tipping, and creator payouts.',
    '/terms-of-service'
  ),
  '/data-deletion': page(
    'Delete your Tuneable data',
    'How to delete your Tuneable account and personal data.',
    '/data-deletion'
  ),
  '/podcasts': page(
    'Podcast chart',
    'Tip podcast episodes and series. The Tuneable podcast chart is ranked by listener support.',
    '/podcasts'
  ),
  '/books': page(
    'Book chart',
    'Tip books you love and move them up the Tuneable book chart.',
    '/books'
  ),
  '/places': page(
    'Places',
    'See which cities and countries are tipping on Tuneable, and open a local chart.',
    '/places'
  ),
  '/parties': page(
    'Listening parties',
    'Join public listening parties on Tuneable. Tip tunes into the queue and shape the room.',
    '/parties'
  ),
  '/creator/register': page(
    'Register as a creator',
    'Claim your artist profile on Tuneable so tips on your music can reach you.',
    '/creator/register'
  ),
  '/request-invite': page(
    'Request an invite',
    'Request access to Tuneable and start tipping on the music you want to chart.',
    '/request-invite'
  ),
};

const NOINDEX_PREFIXES = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/auth',
  '/onboarding',
  '/dashboard',
  '/wallet',
  '/payment',
  '/import',
  '/admin',
  '/notifications',
  '/search',
  '/creator/upload',
  '/creator/library-enrich',
  '/artist-escrow',
  '/conversations',
  '/books/search',
  '/podcasts/search',
  '/party-v2',
];

export const SITEMAP_PATHS = [
  '/party/global',
  '/about',
  '/podcasts',
  '/books',
  '/places',
  '/parties',
  '/help',
  '/join-us',
  '/creator/register',
  '/privacy-policy',
  '/terms-of-service',
  '/data-deletion',
];

function chartPage() {
  return page(
    'Global music chart',
    'The Tuneable global chart is ranked by listener tips. Tip a tune, support the artists, and move it up.',
    '/party/global',
    '<p>The global chart is ranked by listener tips, not by a label or an editor.</p>',
    {
      '@context': 'https://schema.org',
      '@type': 'MusicPlaylist',
      name: 'Tuneable Global Chart',
      url: `${SITE_ORIGIN}/party/global`,
    }
  );
}

function page(title, description, path, body = '', jsonLd = null, extra = {}) {
  return {
    title,
    description,
    path,
    body,
    jsonLd,
    image: extra.image || DEFAULT_IMAGE,
    imageAlt: extra.imageAlt || title,
    imageWidth: extra.imageWidth,
    imageHeight: extra.imageHeight,
    type: extra.type || 'website',
    robots: extra.robots || 'index, follow',
    status: extra.status || 200,
    twitterCard: extra.twitterCard || 'summary',
  };
}

export function isPreviewBot(userAgent) {
  return PREVIEW_BOT.test(userAgent || '');
}

export function backendOrigin(env) {
  const raw = env?.VITE_BACKEND_URL || env?.BACKEND_URL || 'https://tuneable.onrender.com';
  return String(raw).replace(/\/$/, '');
}

function clip(text, max = 160) {
  const clean = String(text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function tagSlug(tag) {
  return String(tag || '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function creatorName(media) {
  if (!media) return '';
  if (typeof media.creatorDisplay === 'string' && media.creatorDisplay.trim()) return media.creatorDisplay.trim();
  if (typeof media.artist === 'string' && media.artist.trim() && media.artist !== 'Unknown Artist') {
    return media.artist.trim();
  }
  if (Array.isArray(media.artist) && media.artist[0]?.name) return media.artist[0].name;
  if (Array.isArray(media.authors) && media.authors.length) return media.authors.filter(Boolean).join(', ');
  if (Array.isArray(media.author) && media.author[0]?.name) {
    return media.author.map((entry) => entry?.name).filter(Boolean).join(', ');
  }
  if (Array.isArray(media.host) && media.host[0]?.name) {
    return media.host.map((entry) => entry?.name).filter(Boolean).join(', ');
  }
  return '';
}

function mediaPath(media, fallback) {
  const id = media?.slug || media?.uuid || media?._id || media?.id;
  if (!id) return fallback || '/';
  const forms = [].concat(media.contentForm || []);
  const types = [].concat(media.contentType || []);
  if (forms.includes('podcastepisode')) return `/podcasts/${encodeURIComponent(id)}`;
  if (forms.includes('podcastseries')) return `/podcast/${encodeURIComponent(id)}`;
  if (types.includes('written') || forms.includes('book') || forms.includes('article')) {
    return `/book/${encodeURIComponent(id)}`;
  }
  return `/tune/${encodeURIComponent(id)}`;
}

async function fetchJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { accept: 'application/json' },
    });
    if (res.status === 404) return { notFound: true };
    if (!res.ok) return { error: true };
    return { data: await res.json() };
  } catch {
    return { error: true };
  } finally {
    clearTimeout(timer);
  }
}

function storyCard(id) {
  return `${SITE_ORIGIN}/api/media/story-card/${encodeURIComponent(id)}?format=og`;
}

function tuneLike(media, kind) {
  const name = media?.title || (kind === 'book' ? 'Book' : kind === 'episode' ? 'Podcast episode' : 'Tune');
  const by = creatorName(media);
  const path = mediaPath(media, kind === 'episode' ? '/podcasts' : kind === 'book' ? '/books' : '/party/global');
  const blurb = clip(media?.description || media?.summary);
  const description = blurb || clip(
    kind === 'book'
      ? `Tip “${name}”${by ? ` by ${by}` : ''} on Tuneable and move it up the book chart.`
      : kind === 'episode'
        ? `Tip “${name}”${by ? ` by ${by}` : ''} on Tuneable and move it up the podcast chart.`
        : `Tip “${name}”${by ? ` by ${by}` : ''} on Tuneable. Listener tips support the artists and decide its place on the global chart.`
  );
  const tags = Array.isArray(media?.tags) ? media.tags.slice(0, 8) : [];
  const tagLinks = tags
    .map((tag) => {
      const slug = tagSlug(tag);
      return slug ? `<a href="/tag/${esc(slug)}">${esc(tag)}</a>` : '';
    })
    .filter(Boolean)
    .join(', ');
  const imageId = media?._id || media?.id;
  const jsonType = kind === 'book' ? 'Book' : kind === 'episode' ? 'PodcastEpisode' : 'MusicRecording';
  return page(by ? `${name} by ${by}` : name, description, path, `
    <article>
      <h1>${esc(name)}</h1>
      ${by ? `<p>${esc(by)}</p>` : ''}
      <p>${esc(description)}</p>
      ${media?.coverArt ? `<img src="${esc(media.coverArt)}" alt="${esc(`Cover art for ${name}`)}" />` : ''}
      ${tagLinks ? `<p>Tags: ${tagLinks}</p>` : ''}
    </article>
  `, {
    '@context': 'https://schema.org',
    '@type': jsonType,
    name,
    ...(by ? { byArtist: { '@type': kind === 'book' ? 'Person' : 'MusicGroup', name: by } } : {}),
    ...(description ? { description } : {}),
    url: `${SITE_ORIGIN}${path}`,
    ...(media?.coverArt ? { image: media.coverArt } : {}),
  }, {
    image: imageId ? storyCard(imageId) : media?.coverArt || DEFAULT_IMAGE,
    imageAlt: by ? `${name} by ${by}` : name,
    imageWidth: imageId ? 1200 : undefined,
    imageHeight: imageId ? 630 : undefined,
    twitterCard: imageId ? 'summary_large_image' : 'summary',
    type: kind === 'tune' ? 'music.song' : 'article',
  });
}

function notFound(label, path) {
  return page(
    `${label} not found`,
    `This ${label.toLowerCase()} is not on Tuneable.`,
    path,
    `<p>This ${esc(label.toLowerCase())} is not on Tuneable.</p>`,
    null,
    { robots: 'noindex, follow', status: 404 }
  );
}

export async function resolvePreview(pathname, env) {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (STATIC_PAGES[path]) return STATIC_PAGES[path];

  if (NOINDEX_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return page('Tuneable', DEFAULT_DESCRIPTION, path, '', null, { robots: 'noindex, nofollow' });
  }

  const api = backendOrigin(env);

  const tune = path.match(/^\/tune\/([^/]+)$/);
  const episode = path.match(/^\/podcasts\/([^/]+)$/);
  const book = path.match(/^\/book\/([^/]+)$/);
  const mediaId = tune?.[1] || episode?.[1] || book?.[1];
  if (mediaId) {
    const result = await fetchJson(`${api}/api/media/${encodeURIComponent(mediaId)}/profile`);
    if (result.notFound) return notFound(book ? 'Book' : episode ? 'Episode' : 'Tune', path);
    if (result.error || !result.data?.media) return null;
    const kind = book ? 'book' : episode ? 'episode' : 'tune';
    return tuneLike(result.data.media, kind);
  }

  const series = path.match(/^\/podcast\/([^/]+)$/);
  if (series) {
    const result = await fetchJson(`${api}/api/podcasts/series/${encodeURIComponent(series[1])}/info`);
    if (result.notFound) return notFound('Podcast', path);
    if (result.error || !result.data?.series) return null;
    const show = result.data.series;
    const by = creatorName(show);
    const description = clip(show.description) || `Tip episodes of ${show.title || 'this podcast'} on Tuneable.`;
    const showPath = `/podcast/${encodeURIComponent(series[1])}`;
    return page(show.title || 'Podcast', description, showPath, `
      <article>
        <h1>${esc(show.title || 'Podcast')}</h1>
        ${by ? `<p>${esc(by)}</p>` : ''}
        <p>${esc(description)}</p>
      </article>
    `, {
      '@context': 'https://schema.org',
      '@type': 'PodcastSeries',
      name: show.title,
      description,
      url: `${SITE_ORIGIN}${showPath}`,
    }, {
      image: show.coverArt || DEFAULT_IMAGE,
      imageAlt: show.title || 'Podcast',
    });
  }

  const user = path.match(/^\/user\/([^/]+)$/);
  if (user) {
    const result = await fetchJson(`${api}/api/users/${encodeURIComponent(user[1])}/profile`);
    if (result.notFound) return notFound('Profile', path);
    if (result.error || !result.data?.user?.username) return null;
    const profile = result.data.user;
    const name = profile.creatorProfile?.artistName || profile.username;
    const description = clip(profile.creatorProfile?.bio) || `${name} on Tuneable. See the tunes they support.`;
    const userPath = `/user/${encodeURIComponent(profile.username)}`;
    return page(name, description, userPath, `
      <article>
        <h1>${esc(name)}</h1>
        <p>${esc(description)}</p>
      </article>
    `, {
      '@context': 'https://schema.org',
      '@type': 'ProfilePage',
      mainEntity: { '@type': 'Person', name, url: `${SITE_ORIGIN}${userPath}` },
    }, {
      image: profile.profilePic || DEFAULT_IMAGE,
      imageAlt: name,
      type: 'profile',
    });
  }

  const party = path.match(/^\/party\/([^/]+)$/);
  if (party && party[1] !== 'global') {
    const result = await fetchJson(`${api}/api/parties/${encodeURIComponent(party[1])}/details`);
    if (result.notFound) return notFound('Party', path);
    if (result.error) return null;
    const details = result.data?.party || result.data;
    if (!details?.name) return null;
    if (details.privacy === 'private') {
      return page('Private party', 'This Tuneable listening party is private.', path, '<p>This listening party is private.</p>', null, {
        robots: 'noindex, nofollow',
      });
    }
    const description = clip(details.description) || `Join ${details.name} on Tuneable and tip tunes into the queue.`;
    const partyPath = `/party/${encodeURIComponent(details.uuid || party[1])}`;
    return page(details.name, description, partyPath, `
      <article>
        <h1>${esc(details.name)}</h1>
        <p>${esc(description)}</p>
      </article>
    `);
  }

  const label = path.match(/^\/label\/([^/]+)$/);
  if (label) {
    const result = await fetchJson(`${api}/api/labels/${encodeURIComponent(label[1])}`);
    if (result.notFound) return notFound('Label', path);
    if (result.error || !result.data?.label?.name) return null;
    const item = result.data.label;
    const description = clip(item.description) || `${item.name} on Tuneable. See their releases and how listeners are tipping them.`;
    const labelPath = `/label/${encodeURIComponent(item.slug || label[1])}`;
    return page(item.name, description, labelPath, `<article><h1>${esc(item.name)}</h1><p>${esc(description)}</p></article>`, {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: item.name,
      description,
      url: `${SITE_ORIGIN}${labelPath}`,
    }, { image: item.profilePicture || item.coverImage || DEFAULT_IMAGE, imageAlt: item.name });
  }

  const collective = path.match(/^\/collective\/([^/]+)$/);
  if (collective) {
    const result = await fetchJson(`${api}/api/collectives/${encodeURIComponent(collective[1])}`);
    if (result.notFound) return notFound('Collective', path);
    if (result.error || !result.data?.collective?.name) return null;
    const item = result.data.collective;
    const description = clip(item.description) || `${item.name} on Tuneable. See their music and listener support.`;
    const collectivePath = `/collective/${encodeURIComponent(item.slug || collective[1])}`;
    return page(item.name, description, collectivePath, `<article><h1>${esc(item.name)}</h1><p>${esc(description)}</p></article>`, null, {
      image: item.profilePicture || item.coverImage || DEFAULT_IMAGE,
      imageAlt: item.name,
    });
  }

  const tag = path.match(/^\/tag\/([^/]+)$/);
  if (tag) {
    const result = await fetchJson(`${api}/api/tags/${encodeURIComponent(tag[1])}/profile?limit=5`);
    if (result.notFound) return notFound('Tag', path);
    if (result.error || !result.data?.tag?.name) return null;
    const name = result.data.tag.name;
    const description = `Tunes tagged ${name} on Tuneable. Tip one and move it up the chart.`;
    const tagPath = `/tag/${encodeURIComponent(result.data.tag.slug || tag[1])}`;
    const tracks = Array.isArray(result.data.media) ? result.data.media.slice(0, 8) : [];
    const list = tracks
      .map((item) => {
        const href = mediaPath(item);
        const by = creatorName(item);
        return `<li><a href="${esc(href)}">${esc(item.title || 'Tune')}${by ? ` — ${esc(by)}` : ''}</a></li>`;
      })
      .join('');
    return page(name, description, tagPath, `<article><h1>${esc(name)}</h1><p>${esc(description)}</p>${list ? `<ul>${list}</ul>` : ''}</article>`);
  }

  const place = path.match(/^\/place\/([^/]+)$/);
  if (place) {
    const result = await fetchJson(`${api}/api/locations/${encodeURIComponent(place[1])}/profile?limit=5`);
    if (result.notFound) return notFound('Place', path);
    if (result.error || !result.data?.place?.name) return null;
    const item = result.data.place;
    const where = [item.name, item.country].filter(Boolean).join(', ');
    const description = `Music tipped from ${where} on Tuneable.`;
    return page(item.name, description, path, `<article><h1>${esc(item.name)}</h1><p>${esc(description)}</p></article>`);
  }

  const gear = path.match(/^\/gear\/([^/]+)$/);
  if (gear) {
    const result = await fetchJson(`${api}/api/gear/${encodeURIComponent(gear[1])}`);
    if (result.notFound) return notFound('Gear', path);
    if (result.error || !result.data?.gear?.name) return null;
    const item = result.data.gear;
    const made = item.manufacturer ? `${item.name} by ${item.manufacturer}` : item.name;
    const description = `${made} on Tuneable. See tunes made with this gear.`;
    const gearPath = `/gear/${encodeURIComponent(item.slug || gear[1])}`;
    return page(item.name, description, gearPath, `<article><h1>${esc(item.name)}</h1><p>${esc(description)}</p></article>`);
  }

  return null;
}

const SITE_NAV = `
  <nav>
    <a href="/party/global">Global chart</a>
    <a href="/about">About</a>
    <a href="/podcasts">Podcasts</a>
    <a href="/books">Books</a>
    <a href="/places">Places</a>
    <a href="/parties">Parties</a>
    <a href="/help">Help</a>
  </nav>
`;

export function renderPreview(meta) {
  const title = meta.title.includes('Tuneable') ? meta.title : `${meta.title} | Tuneable`;
  const url = meta.path.startsWith('http') ? meta.path : `${SITE_ORIGIN}${meta.path.startsWith('/') ? meta.path : `/${meta.path}`}`;
  const image = meta.image || DEFAULT_IMAGE;
  const card = meta.twitterCard || 'summary';
  const jsonLd = meta.jsonLd || {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Tuneable',
    url: `${SITE_ORIGIN}/`,
    description: DEFAULT_DESCRIPTION,
  };
  const size = meta.imageWidth && meta.imageHeight
    ? `<meta property="og:image:width" content="${meta.imageWidth}" />\n    <meta property="og:image:height" content="${meta.imageHeight}" />`
    : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(meta.description)}" />
    <meta name="robots" content="${esc(meta.robots || 'index, follow')}" />
    <link rel="canonical" href="${esc(url)}" />
    <meta property="og:site_name" content="Tuneable" />
    <meta property="og:locale" content="en_GB" />
    <meta property="og:type" content="${esc(meta.type || 'website')}" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(meta.description)}" />
    <meta property="og:url" content="${esc(url)}" />
    <meta property="og:image" content="${esc(image)}" />
    <meta property="og:image:alt" content="${esc(meta.imageAlt || meta.title)}" />
    ${size}
    <meta name="twitter:card" content="${esc(card)}" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(meta.description)}" />
    <meta name="twitter:image" content="${esc(image)}" />
    <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
  </head>
  <body>
    ${meta.body || `<h1>${esc(meta.title)}</h1><p>${esc(meta.description)}</p>`}
    ${SITE_NAV}
  </body>
</html>`;
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pushLoc(urls, path) {
  if (!path || !path.startsWith('/')) return;
  const loc = `${SITE_ORIGIN}${path}`;
  if (!urls.has(loc)) urls.add(loc);
}

export async function buildSitemapXml(env) {
  const api = backendOrigin(env);
  const urls = new Set(SITEMAP_PATHS.map((path) => `${SITE_ORIGIN}${path}`));

  const [tunes, series, labels, collectives, tags, gear] = await Promise.all([
    fetchJson(`${api}/api/media/public?limit=100&page=1&sortBy=globalMediaAggregate&sortOrder=desc`),
    fetchJson(`${api}/api/podcasts/top-series?limit=50`),
    fetchJson(`${api}/api/labels?limit=50`),
    fetchJson(`${api}/api/collectives?limit=50`),
    fetchJson(`${api}/api/tags/popular?limit=40`),
    fetchJson(`${api}/api/gear?limit=40`),
  ]);

  const tuneItems = Array.isArray(tunes.data?.media) ? tunes.data.media : [];
  for (const item of tuneItems) {
    if (item?.title) pushLoc(urls, mediaPath(item));
  }

  const seriesItems = Array.isArray(series.data?.series) ? series.data.series : [];
  for (const item of seriesItems) {
    const id = item?.slug || item?.uuid || item?._id;
    if (id && item?.title) pushLoc(urls, `/podcast/${encodeURIComponent(id)}`);
  }

  const labelItems = Array.isArray(labels.data?.labels) ? labels.data.labels : [];
  for (const item of labelItems) {
    if (item?.slug) pushLoc(urls, `/label/${encodeURIComponent(item.slug)}`);
  }

  const collectiveItems = Array.isArray(collectives.data?.collectives) ? collectives.data.collectives : [];
  for (const item of collectiveItems) {
    if (item?.slug) pushLoc(urls, `/collective/${encodeURIComponent(item.slug)}`);
  }

  const tagItems = Array.isArray(tags.data?.tags) ? tags.data.tags : [];
  for (const item of tagItems) {
    const slug = tagSlug(item?.tag || item?.name || '');
    if (slug) pushLoc(urls, `/tag/${encodeURIComponent(slug)}`);
  }

  const gearItems = Array.isArray(gear.data?.gear) ? gear.data.gear : [];
  for (const item of gearItems) {
    if (item?.slug && item?.name) pushLoc(urls, `/gear/${encodeURIComponent(item.slug)}`);
  }

  const body = [...urls]
    .map((loc) => `  <url><loc>${xmlEscape(loc)}</loc></url>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}
