const ENV_KEYS = {
  facebook: 'FACEBOOK_CALLBACK_URL',
  google: 'GOOGLE_CALLBACK_URL',
  soundcloud: 'SOUNDCLOUD_CALLBACK_URL',
  instagram: 'INSTAGRAM_CALLBACK_URL',
  spotify: 'SPOTIFY_CALLBACK_URL',
};

/**
 * OAuth state/PKCE/linking data lives in the `tuneable.sid` session cookie, which is
 * host-scoped. The callback must therefore be on the same host where the flow starts
 * (the frontend's VITE_API_URL — tuneable.stream in prod, proxied to Render).
 */
function resolveOAuthCallbackURL(provider) {
  const envKey = ENV_KEYS[provider];
  if (envKey && process.env[envKey]) return process.env[envKey];
  const frontend = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
  if (frontend && !/localhost|127\.0\.0\.1/.test(frontend)) {
    return `${frontend}/api/auth/${provider}/callback`;
  }
  return `http://localhost:8000/api/auth/${provider}/callback`;
}

function oauthCallbackHostMismatch(callbackURL) {
  const frontend = process.env.FRONTEND_URL || '';
  if (!frontend || /localhost|127\.0\.0\.1/.test(frontend)) return false;
  try {
    return new URL(callbackURL).host !== new URL(frontend).host;
  } catch {
    return false;
  }
}

/** Resolve, log, and warn if the callback host differs from FRONTEND_URL. */
function getOAuthCallbackURL(provider) {
  const callbackURL = resolveOAuthCallbackURL(provider);
  console.log(`${provider} OAuth callbackURL:`, callbackURL);
  if (oauthCallbackHostMismatch(callbackURL)) {
    const expected = `${process.env.FRONTEND_URL.replace(/\/$/, '')}/api/auth/${provider}/callback`;
    console.warn(
      `⚠️  ${ENV_KEYS[provider]} host differs from FRONTEND_URL — the session cookie set when ` +
      `OAuth starts won't reach the callback. Expected ${expected}`
    );
  }
  return callbackURL;
}

module.exports = { resolveOAuthCallbackURL, getOAuthCallbackURL };
