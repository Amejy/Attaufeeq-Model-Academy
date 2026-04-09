import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { query, withTransaction } from '../db/client.js';

function getExecutor(executor) {
  if (executor?.query) return executor;
  return { query };
}

function mapMailOutboxRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    payload: row.payload || {},
    attempts: Number(row.attempts || 0),
    maxAttempts: Number(row.max_attempts || 0),
    availableAt: row.available_at,
    lockedAt: row.locked_at,
    processedAt: row.processed_at,
    lastError: row.last_error || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function enqueueMailOutbox(items = [], options = {}) {
  if (!env.useDatabase || !items.length) return [];

  const executor = getExecutor(options.executor);
  const created = [];

  for (const item of items) {
    const id = item.id || `outbox-${crypto.randomUUID()}`;
    const result = await executor.query(
      `INSERT INTO mail_outbox (
        id, kind, status, payload, attempts, max_attempts, available_at, last_error, created_at, updated_at
      ) VALUES (
        $1, $2, 'pending', $3::jsonb, 0, $4, COALESCE($5, NOW()), '', NOW(), NOW()
      )
      RETURNING *`,
      [
        id,
        item.kind,
        JSON.stringify(item.payload || {}),
        Number(item.maxAttempts || 5),
        item.availableAt || null
      ]
    );
    created.push(mapMailOutboxRow(result.rows[0]));
  }

  return created;
}

export async function claimMailOutboxBatch({ limit = 10 } = {}) {
  if (!env.useDatabase) return [];

  return withTransaction(async (executor) => {
    const result = await executor.query(
      `WITH next_jobs AS (
        SELECT id
        FROM mail_outbox
        WHERE (
          status = 'pending'
          OR (status = 'processing' AND locked_at <= NOW() - INTERVAL '10 minutes')
        )
          AND available_at <= NOW()
        ORDER BY created_at ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE mail_outbox AS outbox
      SET status = 'processing',
          locked_at = NOW(),
          attempts = outbox.attempts + 1,
          updated_at = NOW()
      FROM next_jobs
      WHERE outbox.id = next_jobs.id
      RETURNING outbox.*`,
      [Math.max(1, Math.min(100, Number(limit || 10)))]
    );

    return result.rows.map(mapMailOutboxRow);
  });
}

export async function markMailOutboxProcessed(id, { status, message = '' } = {}, options = {}) {
  if (!env.useDatabase || !id) return null;

  const executor = getExecutor(options.executor);
  const result = await executor.query(
    `UPDATE mail_outbox
     SET status = $2,
         processed_at = NOW(),
         locked_at = NULL,
         last_error = $3,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, status, message]
  );

  return mapMailOutboxRow(result.rows[0]);
}

export async function markMailOutboxFailure(
  id,
  { errorMessage = '', retryDelaySeconds = 60 } = {},
  options = {}
) {
  if (!env.useDatabase || !id) return null;

  const executor = getExecutor(options.executor);
  const result = await executor.query(
    `UPDATE mail_outbox
     SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END,
         available_at = CASE
           WHEN attempts >= max_attempts THEN available_at
           ELSE NOW() + ($2::text || ' seconds')::interval
         END,
         locked_at = NULL,
         last_error = $3,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, String(Math.max(5, Number(retryDelaySeconds || 60))), errorMessage]
  );

  return mapMailOutboxRow(result.rows[0]);
}
