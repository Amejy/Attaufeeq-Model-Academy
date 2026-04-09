import { env } from '../config/env.js';
import { getDbPool } from '../db/client.js';
import { reloadAdminStoreFromDatabase, saveStoreToDatabaseWithExecutor } from '../data/adminStore.js';

const ADMIN_STORE_WRITE_LOCK_KEY = 941_218;
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function shouldBypass(req) {
  if (env.isTest) return true;
  if (!MUTATION_METHODS.has(req.method)) return true;
  return req.path.startsWith('/auth') || req.path === '/health';
}

export async function serializeAdminStoreWrites(req, res, next) {
  if (shouldBypass(req)) {
    return next();
  }

  const db = await getDbPool();
  const client = await db.connect();
  let finalized = false;

  async function finalize() {
    if (finalized) return;
    finalized = true;
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [ADMIN_STORE_WRITE_LOCK_KEY]);
    } finally {
      client.release();
    }
  }

  try {
    await client.query('SELECT pg_advisory_lock($1)', [ADMIN_STORE_WRITE_LOCK_KEY]);
    await reloadAdminStoreFromDatabase({ executor: client, force: true });
  } catch (error) {
    await finalize();
    return next(error);
  }

  const originalEnd = res.end.bind(res);
  res.end = function patchedEnd(...args) {
    const run = async () => {
      try {
        if (res.statusCode < 400) {
          await saveStoreToDatabaseWithExecutor({ force: true, executor: client });
        }
      } finally {
        await finalize();
      }

      return originalEnd(...args);
    };

    void run().catch((error) => {
      if (!res.headersSent) {
        next(error);
        return;
      }
      console.error('Failed to finalize admin store write:', error.message || error);
    });
    return res;
  };

  res.on('close', () => {
    void finalize();
  });

  return next();
}
