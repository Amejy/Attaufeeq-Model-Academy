import process from 'node:process';
import app from './app.js';
import { env, validateRuntimeConfig } from './config/env.js';
import { closeDbPool, testDbConnection } from './db/client.js';
import { runMigrations } from './db/migrationRunner.js';
import { initializeAdminStore, shutdownAdminStore } from './data/adminStore.js';
import { startMailOutboxWorker } from './jobs/mailOutboxWorker.js';
import { closeRedisClient, testRedisConnection } from './services/redisClient.js';
import { startUptimePinger } from './services/uptimePingService.js';
import {
  ensureBootstrapAdmin,
  verifyLegacyDemoUsers,
  verifyRequiredAuthTables
} from './services/authBootstrapService.js';
import { syncCoreAcademicStore } from './utils/coreAcademicSync.js';
import { normalizeAndPersistSiteContent } from './services/siteContentService.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryWithBackoff(label, work, { attempts, baseMs }) {
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) break;

      const waitMs = baseMs * (2 ** (attempt - 1));
      console.warn(`${label} failed (attempt ${attempt}/${attempts}). Retrying in ${waitMs}ms.`);
      await sleep(waitMs);
    }
  }

  throw lastError;
}

let server = null;
let stopMailWorker = () => {};
let stopUptimePinger = () => {};
let shuttingDown = false;

async function shutdown(signal = 'shutdown', exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`Received ${signal}. Shutting down gracefully...`);

  if (!server) {
    stopMailWorker();
    stopUptimePinger();
    await shutdownAdminStore().catch((error) => {
      console.error('Admin store shutdown error:', error.message || error);
    });
    await closeRedisClient().catch((error) => {
      console.error('Redis shutdown error:', error.message || error);
    });
    await closeDbPool().catch((error) => {
      console.error('Database shutdown error:', error.message || error);
    });
    process.exit(exitCode);
    return;
  }

  stopMailWorker();
  stopUptimePinger();

  try {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  } catch (error) {
    console.error('HTTP server shutdown error:', error.message || error);
    process.exit(1);
    return;
  }

  await shutdownAdminStore().catch((error) => {
    console.error('Admin store shutdown error:', error.message || error);
  });
  await closeRedisClient().catch((error) => {
    console.error('Redis shutdown error:', error.message || error);
  });
  await closeDbPool().catch((error) => {
    console.error('Database shutdown error:', error.message || error);
  });

  process.exit(exitCode);
}

async function start() {
  validateRuntimeConfig();

  await retryWithBackoff('Database migrations', () => runMigrations({ logger: console }), {
    attempts: env.startupDbRetryAttempts,
    baseMs: env.startupDbRetryBaseMs
  });

  const connection = await retryWithBackoff('Database connection', () => testDbConnection(), {
    attempts: env.startupDbRetryAttempts,
    baseMs: env.startupDbRetryBaseMs
  });

  await verifyRequiredAuthTables();
  await initializeAdminStore();
  await normalizeAndPersistSiteContent().catch((error) => {
    console.error('Site content normalization error:', error.message || error);
  });
  await ensureBootstrapAdmin();
  await verifyLegacyDemoUsers();
  await syncCoreAcademicStore();

  const redis = await retryWithBackoff('Redis connection', () => testRedisConnection(), {
    attempts: env.startupRedisRetryAttempts,
    baseMs: env.startupRedisRetryBaseMs
  });

  stopMailWorker = startMailOutboxWorker();
  stopUptimePinger = startUptimePinger();

  console.log(`PostgreSQL connected at ${connection.host}:${connection.port}/${connection.database}`);
  if (redis.enabled) {
    console.log('Redis-backed rate limiting enabled.');
  } else {
    console.warn('Redis-backed rate limiting is disabled for this environment.');
  }

  let currentPort = env.port;
  let retryCount = 0;
  const maxRetries = 5;
  const bindHost = '0.0.0.0';

  const startServer = () => {
    server = app.listen(currentPort, bindHost, () => {
      console.log(`ATTAUFEEQ backend running on http://${bindHost}:${currentPort}`);
      if (currentPort !== env.port) {
        console.warn(`Auto-selected port ${currentPort} (requested ${env.port} was busy).`);
      }
    });

    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(
          `Backend port ${currentPort} is already in use on ${bindHost}. Stop the old process or change PORT in backend/.env.`
        );
        console.error(
          `Find the process with: lsof -nP -iTCP:${currentPort} -sTCP:LISTEN`
        );
        if (env.isDevelopment && retryCount < maxRetries) {
          retryCount += 1;
          currentPort += 1;
          console.warn(`Retrying on port ${currentPort}...`);
          startServer();
          return;
        }
        process.exit(1);
        return;
      }

      if (error.code === 'EACCES' || error.code === 'EPERM') {
        console.error(
          `Backend cannot bind to ${env.host}:${currentPort}. Check permissions/host settings in backend/.env.`
        );
        process.exit(1);
        return;
      }

      console.error('Backend startup error:', error);
      process.exit(1);
    });
  };

  startServer();

  process.on('SIGINT', () => {
    void shutdown('SIGINT', 0);
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM', 0);
  });
}

start().catch(async (error) => {
  console.error('Failed to start backend:', error.message || error);
  await shutdown('startup-failure', 1);
});
