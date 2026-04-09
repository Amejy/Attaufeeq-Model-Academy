import process from 'node:process';
import { env } from '../config/env.js';
import { testDbConnection } from '../db/client.js';
import { testRedisConnection } from './redisClient.js';

function withTimeout(label, work) {
  return Promise.race([
    work(),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${env.healthTimeoutMs}ms`)), env.healthTimeoutMs);
    })
  ]);
}

export function getLivenessStatus() {
  return {
    status: 'ok',
    service: env.serviceName,
    version: env.serviceVersion,
    uptimeSeconds: Number(process.uptime().toFixed(1)),
    timestamp: new Date().toISOString()
  };
}

export async function getReadinessStatus() {
  const checks = {
    database: { ready: false, details: null },
    redis: { ready: env.rateLimitStore !== 'redis' && env.cacheStore !== 'redis', details: null }
  };

  try {
    checks.database.details = await withTimeout('database', () => testDbConnection());
    checks.database.ready = true;
  } catch (error) {
    checks.database.details = { message: error.message || 'Database not ready.' };
  }

  if (env.rateLimitStore === 'redis' || env.cacheStore === 'redis') {
    try {
      checks.redis.details = await withTimeout('redis', () => testRedisConnection());
      checks.redis.ready = true;
    } catch (error) {
      checks.redis.details = { message: error.message || 'Redis not ready.' };
      checks.redis.ready = false;
    }
  }

  const ready = checks.database.ready && checks.redis.ready;

  return {
    status: ready ? 'ok' : 'degraded',
    ready,
    service: env.serviceName,
    version: env.serviceVersion,
    timestamp: new Date().toISOString(),
    checks
  };
}
