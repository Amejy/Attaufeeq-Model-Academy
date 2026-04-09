import { env } from '../config/env.js';
import { adminStore, makeId } from '../data/adminStore.js';
import { query } from '../db/client.js';

function mapDbSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    sessionName: row.session_name,
    startDate: row.start_date ? String(row.start_date) : '',
    endDate: row.end_date ? String(row.end_date) : '',
    isActive: Boolean(row.is_active),
    createdAt: row.created_at
  };
}

function normalizeSessionInput(record) {
  return {
    id: String(record?.id || '').trim(),
    sessionName: String(record?.sessionName || '').trim(),
    startDate: String(record?.startDate || '').trim(),
    endDate: String(record?.endDate || '').trim(),
    isActive: Boolean(record?.isActive),
    createdAt: record?.createdAt || new Date().toISOString()
  };
}

export async function listAcademicSessions() {
  if (!env.useDatabase) {
    return (adminStore.academicSessions || []).slice().sort((a, b) => {
      const left = new Date(b.createdAt || 0).getTime();
      const right = new Date(a.createdAt || 0).getTime();
      return left - right || String(b.sessionName).localeCompare(String(a.sessionName));
    });
  }

  const result = await query('SELECT * FROM academic_sessions ORDER BY created_at DESC, session_name DESC');
  return result.rows.map(mapDbSession);
}

export async function findAcademicSessionById(id) {
  if (!id) return null;

  if (!env.useDatabase) {
    return (adminStore.academicSessions || []).find((item) => item.id === id) || null;
  }

  const result = await query('SELECT * FROM academic_sessions WHERE id = $1 LIMIT 1', [id]);
  return mapDbSession(result.rows[0]);
}

export async function findActiveAcademicSession() {
  if (!env.useDatabase) {
    const sessions = adminStore.academicSessions || [];
    return sessions.find((item) => item.isActive) || sessions[0] || null;
  }

  const result = await query(
    'SELECT * FROM academic_sessions WHERE is_active = TRUE ORDER BY created_at DESC LIMIT 1'
  );
  if (result.rows[0]) return mapDbSession(result.rows[0]);

  const fallback = await query('SELECT * FROM academic_sessions ORDER BY created_at DESC LIMIT 1');
  return mapDbSession(fallback.rows[0]);
}

export async function activateAcademicSession(id) {
  if (!id) return null;

  if (!env.useDatabase) {
    const sessions = adminStore.academicSessions || [];
    adminStore.academicSessions = sessions.map((item) => ({
      ...item,
      isActive: item.id === id
    }));
    return adminStore.academicSessions.find((item) => item.id === id) || null;
  }

  await query('UPDATE academic_sessions SET is_active = FALSE WHERE is_active = TRUE');
  const result = await query('UPDATE academic_sessions SET is_active = TRUE WHERE id = $1 RETURNING *', [id]);
  return mapDbSession(result.rows[0]);
}

export async function ensureActiveAcademicSession({ sessionName = '2025/2026' } = {}) {
  const active = await findActiveAcademicSession();
  if (active) return active;

  const sessions = await listAcademicSessions();
  if (sessions.length) {
    return activateAcademicSession(sessions[0].id);
  }

  const created = normalizeSessionInput({ id: makeId('ses'), sessionName, isActive: true });

  if (!env.useDatabase) {
    adminStore.academicSessions = [created, ...(adminStore.academicSessions || [])];
    return created;
  }

  const result = await query(
    `INSERT INTO academic_sessions (id, session_name, start_date, end_date, is_active, created_at)
     VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''), $5, $6)
     RETURNING *`,
    [created.id, created.sessionName, created.startDate, created.endDate, created.isActive, created.createdAt]
  );

  return mapDbSession(result.rows[0]);
}

export async function createAcademicSession(record) {
  const item = normalizeSessionInput(record);
  if (!item.sessionName) return null;

  if (!item.id) {
    item.id = makeId('ses');
  }

  if (!env.useDatabase) {
    const sessions = adminStore.academicSessions || [];
    const exists = sessions.find((session) => session.id === item.id || session.sessionName === item.sessionName);
    if (exists) {
      return exists;
    }
    if (item.isActive) {
      adminStore.academicSessions = sessions.map((session) => ({ ...session, isActive: false }));
    }
    adminStore.academicSessions = [item, ...adminStore.academicSessions];
    return item;
  }

  const existingByName = await query(
    'SELECT * FROM academic_sessions WHERE session_name = $1 LIMIT 1',
    [item.sessionName]
  );
  if (existingByName.rows[0]) {
    return mapDbSession(existingByName.rows[0]);
  }

  if (item.isActive) {
    await query('UPDATE academic_sessions SET is_active = FALSE WHERE is_active = TRUE');
  }

  const result = await query(
    `INSERT INTO academic_sessions (id, session_name, start_date, end_date, is_active, created_at)
     VALUES ($1, $2, NULLIF($3, '')::date, NULLIF($4, '')::date, $5, $6)
     ON CONFLICT (id)
     DO UPDATE SET
       session_name = EXCLUDED.session_name,
       start_date = EXCLUDED.start_date,
       end_date = EXCLUDED.end_date,
       is_active = EXCLUDED.is_active
     RETURNING *`,
    [item.id, item.sessionName, item.startDate, item.endDate, item.isActive, item.createdAt]
  );

  return mapDbSession(result.rows[0]);
}

export async function upsertManyAcademicSessions(records = []) {
  const normalized = records.map(normalizeSessionInput).filter((item) => item.id && item.sessionName);
  if (!env.useDatabase) {
    adminStore.academicSessions = normalized;
    return normalized;
  }

  for (const item of normalized) {
    await query(
      `INSERT INTO academic_sessions (id, session_name, start_date, end_date, is_active, created_at)
       VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''), $5, $6)
       ON CONFLICT (id)
       DO UPDATE SET
         session_name = EXCLUDED.session_name,
         start_date = EXCLUDED.start_date,
         end_date = EXCLUDED.end_date,
         is_active = EXCLUDED.is_active`,
      [item.id, item.sessionName, item.startDate, item.endDate, item.isActive, item.createdAt]
    );
  }

  return normalized;
}
