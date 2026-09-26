import { isPreviewBot, renderPreview, resolvePreview } from './seo.js';

function isHtmlNavigation(request, url) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false;
  const path = url.pathname;
  if (
    path.startsWith('/api') ||
    path.startsWith('/assets') ||
    path === '/sitemap.xml' ||
    path === '/robots.txt' ||
    /\.[a-z0-9]+$/i.test(path)
  ) {
    return false;
  }
  const accept = request.headers.get('accept') || '';
  return accept.includes('text/html') || accept.includes('*/*') || accept === '';
}

export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);

  if (!isHtmlNavigation(request, url) || !isPreviewBot(request.headers.get('user-agent'))) {
    return next();
  }

  try {
    const meta = await resolvePreview(url.pathname, env);
    if (!meta) return next();
    return new Response(request.method === 'HEAD' ? null : renderPreview(meta), {
      status: meta.status || 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'public, max-age=600',
        'x-robots-tag': meta.robots || 'index, follow',
      },
    });
  } catch (error) {
    console.error('[seo] preview failed', error);
    return next();
  }
}
