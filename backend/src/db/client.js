import process from 'node:process';
import { env } from '../config/env.js';

let pool = null;

function createPoolConfig() {
  const baseConfig = {
    ssl: env.dbSsl ? { rejectUnauthorized: false } : false,
    max: env.dbPoolMax,
    idleTimeoutMillis: env.dbIdleTimeoutMs,
    connectionTimeoutMillis: env.dbConnectionTimeoutMs,
    statement_timeout: env.dbStatementTimeoutMs,
    query_timeout: env.dbStatementTimeoutMs,
    application_name: env.serviceName,
    keepAlive: true
  };

  if (env.databaseUrl) {
    return {
      ...baseConfig,
      connectionString: env.databaseUrl
    };
  }

  return {
    ...baseConfig,
    host: env.dbHost,
    port: env.dbPort,
    user: env.dbUser,
    password: env.dbPassword,
    database: env.dbName
  };
}

function normalizeQueryInput(textOrConfig, params = []) {
  if (typeof textOrConfig === 'string') {
    return {
      text: textOrConfig,
      values: Array.isArray(params) ? params : []
    };
  }

  if (!textOrConfig || typeof textOrConfig !== 'object' || typeof textOrConfig.text !== 'string') {
    throw new Error('Invalid query input.');
  }

  return {
    ...textOrConfig,
    values: Array.isArray(textOrConfig.values)
      ? textOrConfig.values
      : Array.isArray(textOrConfig.params)
        ? textOrConfig.params
        : []
  };
}

async function executeQuery(executor, textOrConfig, params = []) {
  const config = normalizeQueryInput(textOrConfig, params);
  const startedAt = process.hrtime.bigint();

  try {
    return await executor.query(config);
  } finally {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    if (durationMs >= env.dbSlowQueryMs) {
      console.warn(
        `[db] Slow query ${durationMs.toFixed(1)}ms: ${String(config.text || '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 240)}`
      );
    }
  }
}

export async function getDbPool() {
  if (pool) return pool;

  const { Pool } = await import('pg');
  pool = new Pool(createPoolConfig());
  pool.on('error', (error) => {
    console.error('Unexpected PostgreSQL pool error:', error.message || error);
  });

  return pool;
}

export async function query(textOrConfig, params = []) {
  const db = await getDbPool();
  return executeQuery(db, textOrConfig, params);
}

export async function withTransaction(work) {
  const db = await getDbPool();

  const client = await db.connect();
  try {
    await executeQuery(client, 'BEGIN');
    const result = await work(client);
    await executeQuery(client, 'COMMIT');
    return result;
  } catch (error) {
    try {
      await executeQuery(client, 'ROLLBACK');
    } catch {
      // Ignore rollback errors and surface the original failure.
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function testDbConnection() {
  const db = await getDbPool();
  await executeQuery(db, 'SELECT 1');
  return {
    enabled: true,
    database: env.dbName,
    host: env.dbHost,
    port: env.dbPort
  };
}

export async function closeDbPool() {
  if (!pool) return;
  const active = pool;
  pool = null;
  await active.end();
}
