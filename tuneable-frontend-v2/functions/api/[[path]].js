/**
 * Cloudflare Pages Function to proxy /api/* requests to backend
 *
 * Place at: functions/api/[[path]].js
 *
 * IMPORTANT: OAuth callbacks return 302 redirects with one-time authorization
 * codes. fetch() follows redirects by default, which can exchange the code
 * inside the Worker and leave the browser on the callback URL — a refresh or
 * duplicate hit then fails with "This authorization code has been used."
 * Always use redirect: 'manual' so the browser receives the 302.
 */

function buildProxiedHeaders(response) {
  const headers = new Headers();

  // Preserve multiple Set-Cookie values (Object.fromEntries collapses them)
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

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

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

  const backendUrl = env.VITE_BACKEND_URL || env.BACKEND_URL || 'https://tuneable.onrender.com';
  const backendPath = url.pathname + url.search;
  const backendRequestUrl = new URL(backendPath, backendUrl);

  console.log(`[Pages Function] Proxying ${request.method} ${url.pathname} to ${backendRequestUrl.toString()}`);

  const backendRequest = new Request(backendRequestUrl.toString(), {
    method: request.method,
    headers: request.headers,
    body: request.body,
    redirect: 'manual',
  });

  try {
    const response = await fetch(backendRequest);
    const headers = buildProxiedHeaders(response);

    console.log(`[Pages Function] Backend responded with ${response.status} for ${url.pathname}`);

    // 3xx: pass Location through so the browser completes OAuth / other redirects
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error) {
    console.error(`[Pages Function] Error proxying to backend:`, error);
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
}
