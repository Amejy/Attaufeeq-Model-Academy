/* global process */
import dotenv from 'dotenv';
import { URL } from 'node:url';

dotenv.config();

const isProd = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';
const isDev = !isProd && !isTest;

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function optionalEnv(name, fallback = '') {
  return process.env[name] || fallback;
}

function parseBoolean(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
}

function parseInteger(value, fallback, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function parseCorsOrigins() {
  const configured = optionalEnv('CORS_ORIGINS', optionalEnv('CORS_ORIGIN', 'http://localhost:5173'));
  return configured
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseDatabaseUrl(databaseUrl) {
  if (!databaseUrl) return {};

  const url = new URL(databaseUrl);
  const sslMode = url.searchParams.get('sslmode');
  return {
    host: decodeURIComponent(url.hostname || ''),
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username || ''),
    password: decodeURIComponent(url.password || ''),
    database: decodeURIComponent(url.pathname.replace(/^\//, '') || ''),
    ssl: ['require', 'verify-ca', 'verify-full'].includes(String(sslMode || '').toLowerCase())
  };
}

function parseRedisUrl(redisUrl) {
  if (!redisUrl) return {};

  const url = new URL(redisUrl);
  const dbFromPath = url.pathname ? Number(url.pathname.replace(/^\//, '') || 0) : 0;
  return {
    host: decodeURIComponent(url.hostname || ''),
    port: Number(url.port || 6379),
    password: decodeURIComponent(url.password || ''),
    db: Number.isFinite(dbFromPath) ? dbFromPath : 0,
    tls: url.protocol === 'rediss:'
  };
}

const databaseUrl = optionalEnv('DATABASE_URL', '').trim();
const parsedDatabaseUrl = parseDatabaseUrl(databaseUrl);
const redisUrl = optionalEnv('REDIS_URL', '').trim();
const parsedRedisUrl = parseRedisUrl(redisUrl);
const rateLimitStore = optionalEnv('RATE_LIMIT_STORE', 'redis').trim().toLowerCase() || 'redis';
const cacheStore = optionalEnv(
  'CACHE_STORE',
  rateLimitStore === 'redis' ? 'redis' : 'memory'
).trim().toLowerCase() || 'memory';

function normalizeSameSite(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'strict') return 'Strict';
  if (normalized === 'none') return 'None';
  return 'Lax';
}

export const env = {
  isProduction: isProd,
  isDevelopment: isDev,
  isTest,
  serviceName: optionalEnv('SERVICE_NAME', 'attaufiqschools-backend').trim() || 'attaufiqschools-backend',
  serviceVersion: optionalEnv('SERVICE_VERSION', optionalEnv('RENDER_GIT_COMMIT', optionalEnv('npm_package_version', '0.1.0'))),
  host: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT || 4000),
  jwtSecret: requiredEnv('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30m',
  refreshSecret: requiredEnv('REFRESH_SECRET'),
  refreshExpiresIn: process.env.REFRESH_EXPIRES_IN || '365d',
  corsOrigins: parseCorsOrigins(),
  useDatabase: String(process.env.USE_DATABASE || 'false').toLowerCase() === 'true',
  databaseUrl: requiredEnv('DATABASE_URL'),
  dbHost: parsedDatabaseUrl.host || process.env.DB_HOST || '127.0.0.1',
  dbPort: parsedDatabaseUrl.port || Number(process.env.DB_PORT || 5432),
  dbUser: parsedDatabaseUrl.user || process.env.DB_USER || 'postgres',
  dbPassword: parsedDatabaseUrl.password || process.env.DB_PASSWORD || '',
  dbName: parsedDatabaseUrl.database || process.env.DB_NAME || 'attaufiqschools',
  dbSsl: parsedDatabaseUrl.host
    ? (parsedDatabaseUrl.ssl || parseBoolean(process.env.DB_SSL, false))
    : parseBoolean(process.env.DB_SSL, false),
  dbPoolMax: parseInteger(process.env.DB_POOL_MAX, 20, { min: 4, max: 100 }),
  dbIdleTimeoutMs: parseInteger(process.env.DB_IDLE_TIMEOUT_MS, 30_000, { min: 1_000, max: 300_000 }),
  dbConnectionTimeoutMs: parseInteger(process.env.DB_CONNECTION_TIMEOUT_MS, 10_000, { min: 1_000, max: 60_000 }),
  dbStatementTimeoutMs: parseInteger(process.env.DB_STATEMENT_TIMEOUT_MS, 15_000, { min: 1_000, max: 120_000 }),
  dbSlowQueryMs: parseInteger(process.env.DB_SLOW_QUERY_MS, 750, { min: 50, max: 60_000 }),
  startupDbRetryAttempts: Math.max(1, Number(process.env.STARTUP_DB_RETRY_ATTEMPTS || 5)),
  startupDbRetryBaseMs: Math.max(100, Number(process.env.STARTUP_DB_RETRY_BASE_MS || 500)),
  trustProxy: parseBoolean(process.env.TRUST_PROXY, false),
  bootstrapAdminEmail: optionalEnv('BOOTSTRAP_ADMIN_EMAIL', '').trim().toLowerCase(),
  bootstrapAdminPassword: optionalEnv('BOOTSTRAP_ADMIN_PASSWORD', ''),
  bootstrapAdminFullName: optionalEnv('BOOTSTRAP_ADMIN_FULL_NAME', 'System Administrator').trim() || 'System Administrator',
  authCookieName: optionalEnv('AUTH_COOKIE_NAME', 'attaufiq_refresh').trim() || 'attaufiq_refresh',
  authCookieDomain: optionalEnv('AUTH_COOKIE_DOMAIN', '').trim(),
  authCookiePath: optionalEnv('AUTH_COOKIE_PATH', '/api/auth').trim() || '/api/auth',
  authCookieSameSite: normalizeSameSite(optionalEnv('AUTH_COOKIE_SAME_SITE', isProd ? 'lax' : 'lax')),
  authCookieSecure: isProd || parseBoolean(process.env.AUTH_COOKIE_SECURE, false),
  rateLimitStore,
  cacheStore,
  cacheDefaultTtlSeconds: parseInteger(process.env.CACHE_DEFAULT_TTL_SECONDS, 60, { min: 5, max: 3600 }),
  cacheMemoryMaxEntries: parseInteger(process.env.CACHE_MEMORY_MAX_ENTRIES, 1_000, { min: 100, max: 50_000 }),
  redisUrl,
  redisHost: parsedRedisUrl.host || optionalEnv('REDIS_HOST', '127.0.0.1'),
  redisPort: parsedRedisUrl.port || Number(process.env.REDIS_PORT || 6379),
  redisPassword: parsedRedisUrl.password || optionalEnv('REDIS_PASSWORD', ''),
  redisDb: Number.isFinite(parsedRedisUrl.db) ? parsedRedisUrl.db : Number(process.env.REDIS_DB || 0),
  redisTls: parsedRedisUrl.host ? parsedRedisUrl.tls : parseBoolean(process.env.REDIS_TLS, false),
  redisKeyPrefix: optionalEnv('REDIS_KEY_PREFIX', 'attaufiqschools').trim() || 'attaufiqschools',
  startupRedisRetryAttempts: Math.max(1, Number(process.env.STARTUP_REDIS_RETRY_ATTEMPTS || 5)),
  startupRedisRetryBaseMs: Math.max(100, Number(process.env.STARTUP_REDIS_RETRY_BASE_MS || 500)),
  healthTimeoutMs: parseInteger(process.env.HEALTH_TIMEOUT_MS, 3_000, { min: 500, max: 30_000 }),
  mailEnabled: String(process.env.MAIL_ENABLED || 'false').toLowerCase() === 'true',
  mailHost: process.env.MAIL_HOST || '',
  mailPort: Number(process.env.MAIL_PORT || 587),
  mailSecure: String(process.env.MAIL_SECURE || 'false').toLowerCase() === 'true',
  mailService: process.env.MAIL_SERVICE || '',
  mailProvider: optionalEnv('MAIL_PROVIDER', '').trim().toLowerCase(),
  sendgridApiKey: optionalEnv('SENDGRID_API_KEY', '').trim(),
  mailFamily: Number(process.env.MAIL_FAMILY || 4),
  mailUser: process.env.MAIL_USER || '',
  mailPassword: process.env.MAIL_PASSWORD || '',
  mailFrom: process.env.MAIL_FROM || '',
  mailFromName: process.env.MAIL_FROM_NAME || 'ATTAUFEEQ Model Academy Portal',
  mailTestSecret: optionalEnv('MAIL_TEST_SECRET', '').trim(),
  defaultInstitution: optionalEnv('DEFAULT_INSTITUTION', 'ATTAUFEEQ Model Academy').trim() || 'ATTAUFEEQ Model Academy',
  studentEmailDomain: optionalEnv('STUDENT_EMAIL_DOMAIN', 'attaufiqschools.com').trim() || 'attaufiqschools.com',
  defaultPasswordMode: optionalEnv('DEFAULT_PASSWORD_MODE', 'random').trim().toLowerCase() || 'random',
  uptimePingUrl: optionalEnv('UPTIME_PING_URL', '').trim(),
  uptimePingMethod: optionalEnv('UPTIME_PING_METHOD', 'GET').trim().toUpperCase() || 'GET',
  uptimePingIntervalMs: parseInteger(process.env.UPTIME_PING_INTERVAL_MS, 300_000, { min: 30_000, max: 3_600_000 }),
  uptimePingTimeoutMs: parseInteger(process.env.UPTIME_PING_TIMEOUT_MS, 5_000, { min: 1_000, max: 30_000 }),
  get redisConfigured() {
    return Boolean(this.redisUrl || this.redisHost);
  }
};

export function validateRuntimeConfig() {
  if (!env.useDatabase) {
    throw new Error('USE_DATABASE must be true. JSON-backed authentication is no longer supported.');
  }

  if (!env.corsOrigins.length) {
    throw new Error('At least one CORS origin must be configured.');
  }

  if (!env.bootstrapAdminEmail || !env.bootstrapAdminPassword) {
    throw new Error('BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD must be configured.');
  }

  if (env.rateLimitStore !== 'redis' && env.rateLimitStore !== 'disabled') {
    throw new Error('RATE_LIMIT_STORE must be "redis" or "disabled".');
  }

  if (!['redis', 'memory', 'disabled'].includes(env.cacheStore)) {
    throw new Error('CACHE_STORE must be "redis", "memory", or "disabled".');
  }

  if (env.isProduction && env.rateLimitStore !== 'redis') {
    throw new Error('RATE_LIMIT_STORE must be set to redis in production.');
  }

  if (env.rateLimitStore === 'redis' && !env.redisConfigured) {
    throw new Error('Redis-backed rate limiting requires REDIS_URL or REDIS_HOST to be configured.');
  }

  if (env.cacheStore === 'redis' && !env.redisConfigured) {
    throw new Error('Redis-backed caching requires REDIS_URL or REDIS_HOST to be configured.');
  }
}
