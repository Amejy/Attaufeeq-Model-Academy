import { query } from '../db/client.js';

function getExecutor(options = {}) {
  if (options.executor?.query) return options.executor;
  return { query };
}

export async function loadAppState(stateKey, options = {}) {
  const executor = getExecutor(options);
  const result = await executor.query(
    `SELECT state_key, payload, updated_at
     FROM app_state
     WHERE state_key = $1
     LIMIT 1`,
    [stateKey]
  );

  return result.rows[0] || null;
}

export async function getAppStateMetadata(stateKey, options = {}) {
  const executor = getExecutor(options);
  const result = await executor.query(
    `SELECT state_key, updated_at
     FROM app_state
     WHERE state_key = $1
     LIMIT 1`,
    [stateKey]
  );

  return result.rows[0] || null;
}

export async function saveAppState(stateKey, payload, options = {}) {
  const executor = getExecutor(options);
  const result = await executor.query(
    `INSERT INTO app_state (state_key, payload, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (state_key) DO UPDATE
     SET payload = EXCLUDED.payload,
         updated_at = NOW()
     RETURNING state_key, payload, updated_at`,
    [stateKey, JSON.stringify(payload)]
  );

  return result.rows[0] || null;
}
