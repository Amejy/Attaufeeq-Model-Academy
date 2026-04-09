import crypto from 'node:crypto';
import process from 'node:process';
import { Pool } from 'pg';
import { env } from '../config/env.js';
import { loadMigrationFiles } from './migrationRunner.js';
import { verifyRequiredAuthTables, ensureBootstrapAdmin } from '../services/authBootstrapService.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.join(__dirname, 'migrations');

function createPool() {
  return env.databaseUrl
    ? new Pool({
      connectionString: env.databaseUrl,
      ssl: env.dbSsl ? { rejectUnauthorized: false } : false
    })
    : new Pool({
      host: env.dbHost,
      port: env.dbPort,
      user: env.dbUser,
      password: env.dbPassword,
      database: env.dbName,
      ssl: env.dbSsl ? { rejectUnauthorized: false } : false
    });
}

async function applyMigrationsInSchema(client) {
  const files = loadMigrationFiles();
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await client.query(sql);
    await client.query(
      `INSERT INTO schema_migrations (id)
       VALUES ($1)
       ON CONFLICT (id) DO NOTHING`,
      [file]
    );
  }
}

async function run() {
  const pool = createPool();
  const schema = `bootstrap_validation_${crypto.randomUUID().replace(/-/g, '')}`;
  const executor = {
    query: (text, params = []) => client.query(text, params)
  };
  let client = null;

  try {
    client = await pool.connect();
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);

    await applyMigrationsInSchema(client);
    await verifyRequiredAuthTables({ executor });

    const firstRun = await ensureBootstrapAdmin({
      executor,
      bootstrapAdminEmail: 'bootstrap-admin@example.com',
      bootstrapAdminPassword: 'BootstrapAdmin123!',
      bootstrapAdminFullName: 'Bootstrap Admin'
    });
    const secondRun = await ensureBootstrapAdmin({
      executor,
      bootstrapAdminEmail: 'bootstrap-admin@example.com',
      bootstrapAdminPassword: 'BootstrapAdmin123!',
      bootstrapAdminFullName: 'Bootstrap Admin'
    });

    const users = await client.query('SELECT id, email, role, must_change_password FROM users ORDER BY created_at ASC');
    console.log(JSON.stringify({
      schema,
      firstRun,
      secondRun,
      userCount: users.rowCount,
      users: users.rows
    }, null, 2));
  } finally {
    if (client) {
      try {
        await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      } catch {
        // Ignore cleanup failures in validation output.
      }
      client.release();
    }
    await pool.end();
  }
}

run().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
