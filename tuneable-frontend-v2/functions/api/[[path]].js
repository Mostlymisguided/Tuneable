/**
 * Cloudflare Pages Function to proxy /api/* requests to backend
 * 
 * This function is automatically deployed with Cloudflare Pages.
 * Place this file in: functions/api/[[path]].js
 * 
 * The [[path]] syntax catches all paths under /api/
 */

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  
  // Get backend URL from environment variable
  // Checks VITE_BACKEND_URL first (if already set), then BACKEND_URL, then defaults
  // Set this in Cloudflare Pages → Settings → Environment Variables
  const backendUrl = env.VITE_BACKEND_URL || env.BACKEND_URL || 'https://tuneable.onrender.com';
  
  // Construct the backend URL (preserve path and query string)
  const backendPath = url.pathname + url.search;
  const backendRequestUrl = new URL(backendPath, backendUrl);
  
  console.log(`[Pages Function] Proxying ${request.method} ${url.pathname} to ${backendRequestUrl.toString()}`);
  
  // Create a new request to the backend
  const backendRequest = new Request(backendRequestUrl.toString(), {
    method: request.method,
    headers: request.headers,
    body: request.body,
  });
  
  try {
    // Forward the request to the backend
    const response = await fetch(backendRequest);
    
    // Create a new response with CORS headers
    const newResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        ...Object.fromEntries(response.headers),
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, stripe-signature',
      },
    });
    
    console.log(`[Pages Function] Backend responded with ${response.status} for ${url.pathname}`);
    return newResponse;
  } catch (error) {
    console.error(`[Pages Function] Error proxying to backend:`, error);
    return new Response(
      JSON.stringify({ 
        error: 'Backend proxy error', 
        message: error.message 
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

