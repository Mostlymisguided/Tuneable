import {
  DEFAULT_DESCRIPTION,
  DEFAULT_TITLE,
  SITE_ORIGIN,
  clipText,
  type PageMeta,
} from './pageMeta';

const GLOBAL_CHART: PageMeta = {
  title: 'Global music chart',
  description:
    'The Tuneable global chart is ranked by listener tips. Tip a tune, support the artists, and move it up.',
  path: '/party/global',
  jsonLd: {
    '@context': 'https://schema.org',
    '@type': 'MusicPlaylist',
    name: 'Tuneable Global Chart',
    description:
      'A public music chart ranked by listener tips on Tuneable.',
    url: `${SITE_ORIGIN}/party/global`,
  },
};

const ABOUT: PageMeta = {
  title: 'About Tuneable',
  description:
    'Tuneable is a social chart for music, podcasts, and books. Tip what you love, pay creators fairly, and help decide what rises.',
  path: '/about',
};

const EXACT: Record<string, PageMeta> = {
  '/': GLOBAL_CHART,
  '/explore': GLOBAL_CHART,
  '/charts': GLOBAL_CHART,
  '/party/global': GLOBAL_CHART,
  '/home': ABOUT,
  '/about': ABOUT,
  '/help': {
    title: 'Help',
    description:
      'How Tuneable works: tipping, charts, TuneBytes, parties, and where your money goes.',
    path: '/help',
  },
  '/join-us': {
    title: 'Join Tuneable',
    description: 'Buy shares in Tuneable and help steer a chart that pays artists.',
    path: '/join-us',
  },
  '/privacy-policy': {
    title: 'Privacy policy',
    description: 'How Tuneable collects, uses, and protects your account and listening data.',
    path: '/privacy-policy',
  },
  '/terms-of-service': {
    title: 'Terms of service',
    description: 'The terms for using Tuneable, tipping, and creator payouts.',
    path: '/terms-of-service',
  },
  '/data-deletion': {
    title: 'Delete your Tuneable data',
    description: 'How to delete your Tuneable account and personal data.',
    path: '/data-deletion',
  },
  '/podcasts': {
    title: 'Podcast chart',
    description:
      'Tip podcast episodes and series. The Tuneable podcast chart is ranked by listener support.',
    path: '/podcasts',
  },
  '/books': {
    title: 'Book chart',
    description: 'Tip books you love and move them up the Tuneable book chart.',
    path: '/books',
  },
  '/places': {
    title: 'Places',
    description: 'See which cities and countries are tipping on Tuneable, and open a local chart.',
    path: '/places',
  },
  '/parties': {
    title: 'Listening parties',
    description:
      'Join public listening parties on Tuneable. Tip tunes into the queue and shape the room.',
    path: '/parties',
  },
  '/creator/register': {
    title: 'Register as a creator',
    description: 'Claim your artist profile on Tuneable so tips on your music can reach you.',
    path: '/creator/register',
  },
  '/request-invite': {
    title: 'Request an invite',
    description: 'Request access to Tuneable and start tipping on the music you want to chart.',
    path: '/request-invite',
  },
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

function noindex(path: string): PageMeta {
  return {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    path,
    robots: 'noindex, nofollow',
  };
}

function decodePart(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function metaForPath(pathname: string): PageMeta {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const exact = EXACT[path];
  if (exact) return exact;

  if (NOINDEX_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return noindex(path);
  }

  const tune = path.match(/^\/tune\/([^/]+)$/);
  if (tune) {
    return {
      title: 'Tune',
      description: 'A tune on Tuneable. Tip it to support the artists and move it up the chart.',
      path,
      type: 'music.song',
    };
  }

  const episode = path.match(/^\/podcasts\/([^/]+)$/);
  if (episode) {
    return {
      title: 'Podcast episode',
      description: 'A podcast episode on Tuneable. Tip it and move it up the podcast chart.',
      path,
    };
  }

  const series = path.match(/^\/podcast\/([^/]+)$/);
  if (series) {
    return {
      title: 'Podcast',
      description: 'A podcast series on Tuneable. Tip episodes and support the show.',
      path,
    };
  }

  const book = path.match(/^\/book\/([^/]+)$/);
  if (book) {
    return {
      title: 'Book',
      description: 'A book on Tuneable. Tip it and move it up the book chart.',
      path,
    };
  }

  const user = path.match(/^\/user\/([^/]+)$/);
  if (user) {
    const name = decodePart(user[1]);
    return {
      title: name,
      description: clipText(`${name} on Tuneable. See the tunes they support.`),
      path,
      type: 'profile',
    };
  }

  const party = path.match(/^\/party\/([^/]+)$/);
  if (party) {
    if (party[1] === 'global') return GLOBAL_CHART;
    return {
      title: 'Listening party',
      description: 'A Tuneable listening party. Tip tunes into the queue and shape the chart.',
      path,
    };
  }

  const label = path.match(/^\/label\/([^/]+)$/);
  if (label) {
    return {
      title: 'Record label',
      description: 'A record label on Tuneable. See their releases and how listeners are tipping them.',
      path,
    };
  }

  const collective = path.match(/^\/collective\/([^/]+)$/);
  if (collective) {
    return {
      title: 'Collective',
      description: 'An artist collective on Tuneable. See their music and listener support.',
      path,
    };
  }

  const tag = path.match(/^\/tag\/([^/]+)$/);
  if (tag) {
    const name = decodePart(tag[1]).replace(/-/g, ' ');
    return {
      title: name,
      description: clipText(`Tunes tagged ${name} on Tuneable. Tip one and move it up the chart.`),
      path,
    };
  }

  const place = path.match(/^\/place\/([^/]+)$/);
  if (place) {
    return {
      title: 'Place',
      description: 'Music tipped from this place on Tuneable.',
      path,
    };
  }

  const gear = path.match(/^\/gear\/([^/]+)$/);
  if (gear) {
    const name = decodePart(gear[1]).replace(/-/g, ' ');
    return {
      title: name,
      description: clipText(`${name} on Tuneable. See tunes made with this gear.`),
      path,
    };
  }

  return {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    path: path || '/',
  };
}
