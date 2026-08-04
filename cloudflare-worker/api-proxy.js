/**
 * Cloudflare Worker to proxy /api/* requests to backend
 *
 * IMPORTANT: Use redirect: 'manual' so OAuth 302s (one-time auth codes) are
 * returned to the browser instead of being followed inside the Worker.
 */

function buildProxiedHeaders(response) {
  const headers = new Headers();
  const setCookies =
    typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [];

  for (const [key, value] of response.headers) {
    if (key.toLowerCase() === 'set-cookie') continue;
    headers.set(key, value);
  }
  for (const cookie of setCookies) {
    headers.append('Set-Cookie', cookie);
  }

  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, stripe-signature');

  return headers;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith('/api/')) {
      return fetch(request);
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, stripe-signature',
        },
      });
    }

    const backendUrl = env.BACKEND_URL || 'https://tuneable.onrender.com';
    const backendRequestUrl = new URL(url.pathname + url.search, backendUrl);

    console.log(`[Worker] Proxying ${request.method} ${url.pathname} to ${backendRequestUrl.toString()}`);

    const backendRequest = new Request(backendRequestUrl.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: 'manual',
    });

    try {
      const response = await fetch(backendRequest);
      console.log(`[Worker] Backend responded with ${response.status} for ${url.pathname}`);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: buildProxiedHeaders(response),
      });
    } catch (error) {
      console.error(`[Worker] Error proxying to backend:`, error);
      return new Response(
        JSON.stringify({
          error: 'Backend proxy error',
          message: error.message,
        }),
        {
          status: 502,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }
  },
};
