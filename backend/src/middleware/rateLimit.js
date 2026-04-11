import { env } from '../config/env.js';
import { evalRedis } from '../services/redisClient.js';

const RATE_LIMIT_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return { current, ttl }
`;

function normalizeKeyPart(value) {
  return String(value || 'unknown').trim().toLowerCase().replace(/[^a-z0-9:_@.-]/g, '_');
}

async function consumeRateLimit(key, windowMs) {
  const response = await evalRedis(RATE_LIMIT_SCRIPT, [key], [windowMs]);
  if (!response) return null;

  const current = Number(response[0] || 0);
  const ttlMs = Math.max(0, Number(response[1] || 0));
  return { current, ttlMs };
}

export function createRateLimiter({ name, windowMs, maxRequests, keyFromReq }) {
  const scope = normalizeKeyPart(name || 'api');

  return async (req, res, next) => {
    try {
      if (req.path === '/health' || req.path.startsWith('/health/')) {
        return next();
      }
      if (env.rateLimitStore !== 'redis') {
        return next();
      }

      const derivedKey = keyFromReq
        ? await keyFromReq(req)
        : req.ip || req.socket?.remoteAddress || 'unknown';
      const key = `${env.redisKeyPrefix}:rate-limit:${scope}:${normalizeKeyPart(derivedKey)}`;

      const state = await consumeRateLimit(key, windowMs);
      if (!state) {
        return next();
      }

      const retryAfter = Math.max(1, Math.ceil(state.ttlMs / 1000));
      res.setHeader('X-RateLimit-Limit', String(maxRequests));
      res.setHeader('X-RateLimit-Remaining', String(Math.max(0, maxRequests - state.current)));
      res.setHeader('X-RateLimit-Reset', String(retryAfter));

      if (state.current > maxRequests) {
        res.setHeader('Retry-After', String(retryAfter));
        return res.status(429).json({
          message: 'Too many requests. Please try again shortly.'
        });
      }

      return next();
    } catch (error) {
      if (!env.isProduction) {
        console.warn(`Rate limiter bypassed: ${error.message || error}`);
        return next();
      }

      return res.status(503).json({ message: 'Service temporarily unavailable.' });
    }
  };
}
