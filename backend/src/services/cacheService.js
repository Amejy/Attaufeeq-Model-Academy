import { env } from '../config/env.js';
import { sendRedisCommand } from './redisClient.js';

const memoryCache = new Map();
const inFlightLoads = new Map();

function buildCacheKey(key) {
  return `${env.redisKeyPrefix}:cache:${String(key || '').trim()}`;
}

function getMemoryEntry(key) {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    memoryCache.delete(key);
    return null;
  }
  return entry;
}

function setMemoryEntry(key, value, ttlSeconds) {
  if (memoryCache.size >= env.cacheMemoryMaxEntries) {
    const oldestKey = memoryCache.keys().next().value;
    if (oldestKey) {
      memoryCache.delete(oldestKey);
    }
  }

  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + Math.max(1, ttlSeconds) * 1000
  });
}

async function scanRedisKeys(pattern) {
  const keys = [];
  let cursor = '0';

  do {
    const response = await sendRedisCommand(['SCAN', cursor, 'MATCH', pattern, 'COUNT', '100']);
    if (!Array.isArray(response) || response.length < 2) break;
    cursor = String(response[0] || '0');
    const batch = Array.isArray(response[1]) ? response[1] : [];
    keys.push(...batch);
  } while (cursor !== '0');

  return keys;
}

export async function getCacheJson(key) {
  if (env.cacheStore === 'disabled') return null;

  const cacheKey = buildCacheKey(key);
  if (env.cacheStore === 'memory') {
    return getMemoryEntry(cacheKey)?.value ?? null;
  }

  try {
    const raw = await sendRedisCommand(['GET', cacheKey]);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    if (!env.isProduction) {
      console.warn(`Cache read bypassed: ${error.message || error}`);
    }
    return null;
  }
}

export async function setCacheJson(key, value, { ttlSeconds = env.cacheDefaultTtlSeconds } = {}) {
  if (env.cacheStore === 'disabled') return value;

  const cacheKey = buildCacheKey(key);
  if (env.cacheStore === 'memory') {
    setMemoryEntry(cacheKey, value, ttlSeconds);
    return value;
  }

  try {
    await sendRedisCommand(['SET', cacheKey, JSON.stringify(value), 'EX', String(Math.max(1, ttlSeconds))]);
  } catch (error) {
    if (!env.isProduction) {
      console.warn(`Cache write bypassed: ${error.message || error}`);
    }
  }

  return value;
}

export async function deleteCacheKey(key) {
  if (env.cacheStore === 'disabled') return;

  const cacheKey = buildCacheKey(key);
  if (env.cacheStore === 'memory') {
    memoryCache.delete(cacheKey);
    return;
  }

  try {
    await sendRedisCommand(['DEL', cacheKey]);
  } catch (error) {
    if (!env.isProduction) {
      console.warn(`Cache delete bypassed: ${error.message || error}`);
    }
  }
}

export async function deleteCacheByPrefix(prefix) {
  if (env.cacheStore === 'disabled') return;

  const cachePrefix = buildCacheKey(prefix);
  if (env.cacheStore === 'memory') {
    Array.from(memoryCache.keys())
      .filter((key) => key.startsWith(cachePrefix))
      .forEach((key) => memoryCache.delete(key));
    return;
  }

  try {
    const keys = await scanRedisKeys(`${cachePrefix}*`);
    if (keys.length) {
      await sendRedisCommand(['DEL', ...keys]);
    }
  } catch (error) {
    if (!env.isProduction) {
      console.warn(`Cache prefix delete bypassed: ${error.message || error}`);
    }
  }
}

export async function withCache(key, loader, options = {}) {
  const cached = await getCacheJson(key);
  if (cached !== null) {
    return cached;
  }

  const cacheKey = buildCacheKey(key);
  if (inFlightLoads.has(cacheKey)) {
    return inFlightLoads.get(cacheKey);
  }

  const loadPromise = (async () => {
    const value = await loader();
    await setCacheJson(key, value, options);
    return value;
  })();

  inFlightLoads.set(cacheKey, loadPromise);

  try {
    return await loadPromise;
  } finally {
    inFlightLoads.delete(cacheKey);
  }
}
