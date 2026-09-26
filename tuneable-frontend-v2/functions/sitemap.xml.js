import { buildSitemapXml } from './seo.js';

export async function onRequest(context) {
  let cache;
  try {
    cache = caches.default;
    const cached = await cache.match(context.request);
    if (cached) return cached;
  } catch {
    cache = null;
  }

  let xml;
  try {
    xml = await buildSitemapXml(context.env);
  } catch (error) {
    console.error('[seo] sitemap failed', error);
    xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://tuneable.stream/party/global</loc></url>
  <url><loc>https://tuneable.stream/about</loc></url>
  <url><loc>https://tuneable.stream/podcasts</loc></url>
  <url><loc>https://tuneable.stream/books</loc></url>
  <url><loc>https://tuneable.stream/help</loc></url>
</urlset>
`;
  }

  const response = new Response(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=43200',
    },
  });
  if (cache) context.waitUntil(cache.put(context.request, response.clone()));
  return response;
}
