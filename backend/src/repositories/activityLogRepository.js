import { env } from '../config/env.js';
import { query } from '../db/client.js';

function getExecutor(executor) {
  if (executor?.query) return executor;
  return { query };
}

function mapDbActivityLog(row) {
  if (!row) return null;

  return {
    id: row.id,
    action: row.action,
    method: row.method,
    path: row.path,
    actorRole: row.actor_role,
    actorEmail: row.actor_email,
    statusCode: Number(row.status_code || 0),
    ip: row.ip,
    timestamp: row.timestamp,
    details: row.details || {}
  };
}

export async function persistActivityLog(entry, options = {}) {
  if (!env.useDatabase) return entry;

  const executor = getExecutor(options.executor);
  await executor.query(
    `INSERT INTO activity_logs (
      id, action, method, path, actor_role, actor_email, status_code, ip, timestamp, details
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb
    )`,
    [
      entry.id,
      entry.action,
      entry.method,
      entry.path,
      entry.actorRole,
      entry.actorEmail,
      Number(entry.statusCode || 0),
      entry.ip,
      entry.timestamp,
      JSON.stringify(entry.details || {})
    ]
  );

  return entry;
}

export async function listActivityLogs({
  actorRole = '',
  method = '',
  statusCode = 0,
  search = '',
  limit = 100
} = {}) {
  if (!env.useDatabase) return [];

  const executor = getExecutor();
  const clauses = [];
  const params = [];

  if (actorRole) {
    params.push(actorRole);
    clauses.push(`actor_role = $${params.length}`);
  }

  if (method) {
    params.push(String(method).toUpperCase());
    clauses.push(`method = $${params.length}`);
  }

  if (statusCode) {
    params.push(Number(statusCode));
    clauses.push(`status_code = $${params.length}`);
  }

  if (search) {
    params.push(`%${String(search).toLowerCase()}%`);
    clauses.push(`(
      lower(path) LIKE $${params.length}
      OR lower(actor_email) LIKE $${params.length}
      OR lower(action) LIKE $${params.length}
      OR lower(COALESCE(details::text, '')) LIKE $${params.length}
    )`);
  }

  params.push(Math.max(1, Math.min(500, Number(limit || 100))));
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const result = await executor.query(
    `SELECT *
     FROM activity_logs
     ${where}
     ORDER BY timestamp DESC
     LIMIT $${params.length}`,
    params
  );

  return result.rows.map(mapDbActivityLog);
}
