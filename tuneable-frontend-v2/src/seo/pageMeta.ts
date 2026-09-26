export const SITE_ORIGIN = 'https://tuneable.stream';
export const SITE_NAME = 'Tuneable';
export const DEFAULT_TITLE = 'Tuneable — Tip what you love';
export const DEFAULT_DESCRIPTION =
  'Tip the music, podcasts, and books you love. Your tips support creators and move them up public charts on Tuneable.';
export const DEFAULT_IMAGE = `${SITE_ORIGIN}/android-chrome-512x512.png`;

export type JsonLd = Record<string, unknown>;

export type PageMeta = {
  title: string;
  description: string;
  path: string;
  image?: string;
  imageAlt?: string;
  imageWidth?: number;
  imageHeight?: number;
  type?: string;
  robots?: string;
  twitterCard?: 'summary' | 'summary_large_image';
  jsonLd?: JsonLd | null;
};

export const SITE_JSONLD: JsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      name: SITE_NAME,
      url: `${SITE_ORIGIN}/`,
      logo: DEFAULT_IMAGE,
      email: 'hi@tuneable.stream',
    },
    {
      '@type': 'WebSite',
      name: SITE_NAME,
      url: `${SITE_ORIGIN}/`,
      description: DEFAULT_DESCRIPTION,
    },
  ],
};

export function clipText(text: string | null | undefined, max = 160): string {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

function absoluteUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${SITE_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
}

function absoluteImage(image: string | undefined): string {
  if (!image) return DEFAULT_IMAGE;
  if (image.startsWith('http://') || image.startsWith('https://')) return image;
  if (image.startsWith('/')) return `${SITE_ORIGIN}${image}`;
  return DEFAULT_IMAGE;
}

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function removeMeta(attr: 'name' | 'property', key: string) {
  document.head.querySelector(`meta[${attr}="${key}"]`)?.remove();
}

const CANONICAL_ID = 'tuneable-canonical';
const JSONLD_ID = 'tuneable-jsonld';

export function applyDocumentMeta(meta: PageMeta) {
  const title = meta.title.includes(SITE_NAME) ? meta.title : `${meta.title} | ${SITE_NAME}`;
  const description = clipText(meta.description, 200) || DEFAULT_DESCRIPTION;
  const url = absoluteUrl(meta.path || '/');
  const image = absoluteImage(meta.image);
  const robots = meta.robots || 'index, follow';
  const type = meta.type || 'website';
  const large = meta.twitterCard === 'summary_large_image' || Boolean(meta.imageWidth && meta.imageWidth >= 600);
  const card = large ? 'summary_large_image' : meta.twitterCard || 'summary';

  document.title = title;
  upsertMeta('name', 'description', description);
  upsertMeta('name', 'robots', robots);
  upsertMeta('property', 'og:site_name', SITE_NAME);
  upsertMeta('property', 'og:type', type);
  upsertMeta('property', 'og:title', title);
  upsertMeta('property', 'og:description', description);
  upsertMeta('property', 'og:url', url);
  upsertMeta('property', 'og:image', image);
  upsertMeta('property', 'og:locale', 'en_GB');
  if (meta.imageAlt) upsertMeta('property', 'og:image:alt', meta.imageAlt);
  else removeMeta('property', 'og:image:alt');
  if (meta.imageWidth && meta.imageHeight) {
    upsertMeta('property', 'og:image:width', String(meta.imageWidth));
    upsertMeta('property', 'og:image:height', String(meta.imageHeight));
  } else {
    removeMeta('property', 'og:image:width');
    removeMeta('property', 'og:image:height');
  }

  upsertMeta('name', 'twitter:card', card);
  upsertMeta('name', 'twitter:title', title);
  upsertMeta('name', 'twitter:description', description);
  upsertMeta('name', 'twitter:image', image);
  upsertMeta('name', 'twitter:url', url);

  let canonical = document.getElementById(CANONICAL_ID) as HTMLLinkElement | null;
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.id = CANONICAL_ID;
    canonical.rel = 'canonical';
    document.head.appendChild(canonical);
  }
  canonical.href = url;

  let script = document.getElementById(JSONLD_ID) as HTMLScriptElement | null;
  if (!script) {
    script = document.createElement('script');
    script.id = JSONLD_ID;
    script.type = 'application/ld+json';
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(meta.jsonLd || SITE_JSONLD);
}

type StackEntry = { id: number; meta: PageMeta };
let routeMeta: PageMeta | null = null;
const stack: StackEntry[] = [];
let seq = 1;
const listeners = new Set<() => void>();

export function getActiveMeta(): PageMeta | null {
  if (stack.length) return stack[stack.length - 1].meta;
  return routeMeta;
}

function emit() {
  listeners.forEach((listener) => listener());
}

export function setRouteMeta(meta: PageMeta) {
  routeMeta = meta;
  emit();
}

export function pushPageMeta(meta: PageMeta): () => void {
  const id = seq++;
  stack.push({ id, meta });
  emit();
  return () => {
    const index = stack.findIndex((entry) => entry.id === id);
    if (index >= 0) stack.splice(index, 1);
    emit();
  };
}

export function subscribePageMeta(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
