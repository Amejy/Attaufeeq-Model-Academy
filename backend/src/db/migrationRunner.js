import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDbPool } from './client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.join(__dirname, 'migrations');

export function loadMigrationFiles() {
  return fs
    .readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));
}

export async function ensureSchemaMigrations(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function runMigrations({ logger = console } = {}) {
  const files = loadMigrationFiles();
  if (!files.length) {
    logger.log('No migration files found.');
    return { applied: [] };
  }

  const pool = await getDbPool();
  await ensureSchemaMigrations(pool);
  const applied = [];

  for (const file of files) {
    const migrationId = file;
    const check = await pool.query('SELECT 1 FROM schema_migrations WHERE id = $1 LIMIT 1', [migrationId]);
    if (check.rowCount > 0) {
      logger.log(`Skipping already applied migration: ${migrationId}`);
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [migrationId]);
      await client.query('COMMIT');
      applied.push(migrationId);
      logger.log(`Applied migration: ${migrationId}`);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Failed migration: ${migrationId}`);
      throw error;
    } finally {
      client.release();
    }
  }

  logger.log('Migrations completed successfully.');
  return { applied };
}
