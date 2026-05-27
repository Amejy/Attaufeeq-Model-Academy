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
import { logger } from './utils/logger.js';
import { normalizeAndPersistSiteContent } from './services/siteContentService.js';
import {
  markStartupFailed,
  markStartupInitializing,
  markStartupReady
} from './services/startupState.js';

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
      logger.warn(`${label} failed (attempt ${attempt}/${attempts}). Retrying in ${waitMs}ms.`, { error });
      await sleep(waitMs);
    }
  }

  throw lastError;
}

let server = null;
let stopMailWorker = () => {};
let stopUptimePinger = () => {};
let shuttingDown = false;

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception.', { error });
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection.', { reason });
});

async function shutdown(signal = 'shutdown', exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info(`Received ${signal}. Shutting down gracefully...`);

  if (!server) {
    stopMailWorker();
    stopUptimePinger();
    await shutdownAdminStore().catch((error) => {
      logger.error('Admin store shutdown error.', { error });
    });
    await closeRedisClient().catch((error) => {
      logger.error('Redis shutdown error.', { error });
    });
    await closeDbPool().catch((error) => {
      logger.error('Database shutdown error.', { error });
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
    logger.error('HTTP server shutdown error.', { error });
    process.exit(1);
    return;
  }

  await shutdownAdminStore().catch((error) => {
    logger.error('Admin store shutdown error.', { error });
  });
  await closeRedisClient().catch((error) => {
    logger.error('Redis shutdown error.', { error });
  });
  await closeDbPool().catch((error) => {
    logger.error('Database shutdown error.', { error });
  });

  process.exit(exitCode);
}

async function start() {
  validateRuntimeConfig();
  markStartupInitializing();

  let currentPort = env.port;
  let retryCount = 0;
  const maxRetries = 5;
  const bindHost = env.host;

  const startServer = () => {
    server = app.listen(currentPort, bindHost, () => {
      logger.info(`ATTAUFEEQ backend running on http://${bindHost}:${currentPort}`);
      if (currentPort !== env.port) {
        logger.warn(`Auto-selected port ${currentPort} (requested ${env.port} was busy).`);
      }
    });

    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        server?.close?.();
        logger.error(
          `Backend port ${currentPort} is already in use on ${bindHost}. Stop the old process or change PORT in backend/.env.`
        );
        logger.error(`Find the process with: lsof -nP -iTCP:${currentPort} -sTCP:LISTEN`);
        if (env.isDevelopment && retryCount < maxRetries) {
          retryCount += 1;
          currentPort += 1;
          logger.warn(`Retrying on port ${currentPort}...`);
          startServer();
          return;
        }
        process.exit(1);
        return;
      }

      if (error.code === 'EACCES' || error.code === 'EPERM') {
        server?.close?.();
        logger.error(
          `Backend cannot bind to ${bindHost}:${currentPort}. Check permissions/host settings in backend/.env.`
        );
        process.exit(1);
        return;
      }

      logger.error('Backend startup error.', { error });
      process.exit(1);
    });
  };

  startServer();

  try {
    await retryWithBackoff('Database migrations', () => runMigrations({ logger }), {
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
      logger.error('Site content normalization error.', { error });
    });
    await ensureBootstrapAdmin();
    await verifyLegacyDemoUsers();
    await syncCoreAcademicStore();

    let redis = { enabled: false };
    try {
      redis = await retryWithBackoff('Redis connection', () => testRedisConnection(), {
        attempts: env.startupRedisRetryAttempts,
        baseMs: env.startupRedisRetryBaseMs
      });
    } catch (error) {
      logger.warn('Redis unavailable during startup; continuing without Redis-backed rate limiting and cache.', { error });
    }

    stopMailWorker = startMailOutboxWorker();
    stopUptimePinger = startUptimePinger();

    logger.info(`PostgreSQL connected at ${connection.host}:${connection.port}/${connection.database}`);
    if (redis.enabled) {
      logger.info('Redis-backed rate limiting enabled.');
    } else {
      logger.warn('Redis-backed rate limiting is disabled for this environment.');
    }
    markStartupReady();
  } catch (error) {
    markStartupFailed('Backend services could not start.');
    logger.error('Startup initialization failed.', { error });
    await shutdown('startup-initialization-failure', 1);
    return;
  }

  process.on('SIGINT', () => {
    void shutdown('SIGINT', 0);
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM', 0);
  });
}

start().catch(async (error) => {
  logger.error('Failed to start backend.', { error });
  await shutdown('startup-failure', 1);
});
