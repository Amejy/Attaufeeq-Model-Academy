import process from 'node:process';
import { env } from '../config/env.js';
import { query, testDbConnection } from './client.js';

async function run() {
  await testDbConnection();

  const duplicateResult = await query(
    `SELECT
       user_id,
       COUNT(*)::int AS duplicate_count,
       ARRAY_AGG(id ORDER BY created_at ASC) AS student_ids
     FROM students
     WHERE user_id IS NOT NULL
     GROUP BY user_id
     HAVING COUNT(*) > 1
     ORDER BY duplicate_count DESC, user_id ASC`
  );

  const migrationResult = await query(
    `SELECT id
     FROM schema_migrations
     WHERE id IN ('012_student_registration_hardening.sql', '013_student_registration_delivery_outbox.sql')
     ORDER BY id ASC`
  );

  const payload = {
    checkedAt: new Date().toISOString(),
    database: env.dbName,
    host: env.dbHost,
    migrationsApplied: migrationResult.rows.map((row) => row.id),
    duplicateUserLinksFound: duplicateResult.rowCount,
    duplicates: duplicateResult.rows.map((row) => ({
      userId: row.user_id,
      duplicateCount: Number(row.duplicate_count || 0),
      studentIds: row.student_ids || []
    }))
  };

  console.log(JSON.stringify(payload, null, 2));

  if (duplicateResult.rowCount > 0) {
    process.exitCode = 2;
  }
}

run().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
