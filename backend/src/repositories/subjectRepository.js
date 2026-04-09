import { env } from '../config/env.js';
import { adminStore } from '../data/adminStore.js';
import { query } from '../db/client.js';

function mapDbSubject(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    institution: row.institution,
    createdAt: row.created_at
  };
}

function normalizeSubjectInput({ id, name, institution }) {
  return {
    id: String(id || '').trim(),
    name: String(name || '').trim(),
    institution: String(institution || '').trim()
  };
}

export async function listSubjects({ institution = '' } = {}) {
  if (!env.useDatabase) {
    return institution
      ? adminStore.subjects.filter((item) => item.institution === institution)
      : [...adminStore.subjects];
  }

  const params = [];
  const where = institution ? `WHERE institution = $1` : '';
  if (institution) params.push(institution);
  const result = await query(`SELECT * FROM subjects ${where} ORDER BY institution, name`, params);
  return result.rows.map(mapDbSubject);
}

export async function findSubjectById(id) {
  if (!id) return null;

  if (!env.useDatabase) {
    return adminStore.subjects.find((item) => item.id === id) || null;
  }

  const result = await query('SELECT * FROM subjects WHERE id = $1 LIMIT 1', [id]);
  return mapDbSubject(result.rows[0]);
}

export async function createSubject(record) {
  const normalized = normalizeSubjectInput(record);

  if (!env.useDatabase) {
    adminStore.subjects.unshift(normalized);
    return normalized;
  }

  await query(
    'INSERT INTO subjects (id, name, institution) VALUES ($1, $2, $3)',
    [normalized.id, normalized.name, normalized.institution]
  );

  return normalized;
}

export async function updateSubject(id, record) {
  const normalized = normalizeSubjectInput({ ...record, id });

  if (!env.useDatabase) {
    const index = adminStore.subjects.findIndex((item) => item.id === id);
    if (index === -1) return null;
    adminStore.subjects[index] = normalized;
    return normalized;
  }

  const result = await query(
    `UPDATE subjects
     SET name = $2,
         institution = $3
     WHERE id = $1
     RETURNING *`,
    [id, normalized.name, normalized.institution]
  );

  return mapDbSubject(result.rows[0]);
}

export async function deleteSubjectById(id) {
  if (!id) return false;

  if (!env.useDatabase) {
    const index = adminStore.subjects.findIndex((item) => item.id === id);
    if (index === -1) return false;
    adminStore.subjects.splice(index, 1);
    return true;
  }

  const result = await query('DELETE FROM subjects WHERE id = $1', [id]);
  return result.rowCount > 0;
}

export async function upsertManySubjects(records = []) {
  const normalized = records
    .map(normalizeSubjectInput)
    .filter((item) => item.id && item.name && item.institution);

  if (!env.useDatabase || !normalized.length) return normalized;

  for (const item of normalized) {
    await query(
      `INSERT INTO subjects (id, name, institution)
       VALUES ($1, $2, $3)
       ON CONFLICT (id)
       DO UPDATE SET
         name = EXCLUDED.name,
         institution = EXCLUDED.institution`,
      [item.id, item.name, item.institution]
    );
  }

  return normalized;
}
