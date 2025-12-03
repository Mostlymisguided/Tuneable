/**
 * Cloudflare Worker to proxy /api/* requests to backend
 * 
 * This worker intercepts requests to /api/* and forwards them to your backend server.
 * All other requests are passed through to Cloudflare Pages (frontend).
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // Only proxy requests that start with /api/
    if (url.pathname.startsWith('/api/')) {
      // Get backend URL from environment variable or use default
      const backendUrl = env.BACKEND_URL || 'https://tuneable.onrender.com';
      
      // Construct the backend URL
      const backendRequestUrl = new URL(url.pathname + url.search, backendUrl);
      
      console.log(`[Worker] Proxying ${request.method} ${url.pathname} to ${backendRequestUrl.toString()}`);
      
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
        
        console.log(`[Worker] Backend responded with ${response.status} for ${url.pathname}`);
        return newResponse;
      } catch (error) {
        console.error(`[Worker] Error proxying to backend:`, error);
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
    
    // For non-API routes, pass through to Cloudflare Pages (frontend)
    // This is handled automatically by Cloudflare Pages routing
    return fetch(request);
  },
};



