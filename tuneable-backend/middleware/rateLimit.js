/**
 * Fixed-window in-memory rate limiter. Per process, so limits are per instance.
 *
 * @param {object} options
 * @param {string} options.name - bucket namespace
 * @param {number} options.windowMs
 * @param {number} options.max - requests allowed per window per key
 * @param {(req) => string|null} [options.key] - extra key (e.g. email)
 * @param {boolean} [options.perIp=true] - include the client IP in the bucket key
 * @param {string} [options.message]
 */
function rateLimit({ name, windowMs, max, key, perIp = true, message }) {
  const hits = new Map();

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(k);
    }
  }, windowMs);
  sweep.unref?.();

  return (req, res, next) => {
    const extra = key ? key(req) : null;
    if (!perIp && !extra) return next();
    const parts = [name];
    if (perIp) parts.push(req.ip);
    if (extra) parts.push(String(extra).toLowerCase());
    const bucket = parts.join(':');
    const now = Date.now();

    let entry = hits.get(bucket);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(bucket, entry);
    }
    entry.count += 1;

    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: message || 'Too many attempts. Please wait a few minutes and try again.',
        retryAfter,
      });
    }
    next();
  };
}

module.exports = rateLimit;
