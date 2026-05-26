import process from 'node:process';
import { env } from '../config/env.js';
import { testDbConnection } from '../db/client.js';
import { testRedisConnection } from './redisClient.js';
import { getStartupState } from './startupState.js';

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
    application: { ready: false, details: null },
    database: { ready: false, details: null },
    redis: { ready: env.rateLimitStore !== 'redis' && env.cacheStore !== 'redis', details: null }
  };

  const startup = getStartupState();
  checks.application.ready = startup.ready;
  checks.application.details = {
    message: startup.message,
    failed: startup.failed,
    updatedAt: startup.updatedAt
  };

  try {
    checks.database.details = await withTimeout('database', () => testDbConnection());
    checks.database.ready = true;
  } catch {
    checks.database.details = { message: 'Database service is not ready.' };
  }

  if (env.rateLimitStore === 'redis' || env.cacheStore === 'redis') {
    try {
      checks.redis.details = await withTimeout('redis', () => testRedisConnection());
      checks.redis.ready = true;
    } catch {
      checks.redis.details = { message: 'Cache service is not ready.' };
      checks.redis.ready = false;
    }
  }

  const ready = checks.application.ready && checks.database.ready && checks.redis.ready;

  return {
    status: ready ? 'ok' : 'degraded',
    ready,
    service: env.serviceName,
    version: env.serviceVersion,
    timestamp: new Date().toISOString(),
    checks
  };
}
