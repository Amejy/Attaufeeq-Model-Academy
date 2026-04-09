import { env } from '../config/env.js';
import { adminStore } from '../data/adminStore.js';
import { query } from '../db/client.js';
import { isCountableActiveStudent } from '../utils/studentLifecycle.js';

function mapDbClass(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    arm: row.arm,
    progressionOrder: row.progression_order ?? null,
    institution: row.institution,
    createdAt: row.created_at
  };
}

function normalizeClassInput({ id, name, arm, institution, progressionOrder }) {
  const parsedOrder = progressionOrder === '' || progressionOrder === null || progressionOrder === undefined
    ? null
    : Number(progressionOrder);

  return {
    id: String(id || '').trim(),
    name: String(name || '').trim(),
    arm: String(arm || '').trim(),
    institution: String(institution || '').trim(),
    progressionOrder: Number.isFinite(parsedOrder) ? parsedOrder : null
  };
}

export async function listClasses({ institution = '' } = {}) {
  if (!env.useDatabase) {
    return adminStore.classes.filter((item) => (institution ? item.institution === institution : true));
  }

  const clauses = [];
  const params = [];

  if (institution) {
    params.push(institution);
    clauses.push(`institution = $${params.length}`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await query(`SELECT * FROM classes ${where} ORDER BY institution, name, arm`, params);
  return result.rows.map(mapDbClass);
}

export async function findClassById(id) {
  if (!id) return null;

  if (!env.useDatabase) {
    return adminStore.classes.find((item) => item.id === id) || null;
  }

  const result = await query('SELECT * FROM classes WHERE id = $1 LIMIT 1', [id]);
  return mapDbClass(result.rows[0]);
}

export async function createClass(record) {
  const normalized = normalizeClassInput(record);

  if (!env.useDatabase) {
    adminStore.classes.unshift(normalized);
    return normalized;
  }

  await query(
    'INSERT INTO classes (id, name, arm, progression_order, institution) VALUES ($1, $2, $3, $4, $5)',
    [normalized.id, normalized.name, normalized.arm, normalized.progressionOrder, normalized.institution]
  );

  return normalized;
}

export async function updateClass(id, record) {
  const normalized = normalizeClassInput({ ...record, id });

  if (!env.useDatabase) {
    const index = adminStore.classes.findIndex((item) => item.id === id);
    if (index === -1) return null;
    adminStore.classes[index] = normalized;
    return normalized;
  }

  const result = await query(
    `UPDATE classes
     SET name = $2,
         arm = $3,
         progression_order = $4,
         institution = $5
     WHERE id = $1
     RETURNING *`,
    [id, normalized.name, normalized.arm, normalized.progressionOrder, normalized.institution]
  );

  return mapDbClass(result.rows[0]);
}

export async function deleteClassById(id) {
  if (!id) return false;

  if (!env.useDatabase) {
    const index = adminStore.classes.findIndex((item) => item.id === id);
    if (index === -1) return false;
    adminStore.classes.splice(index, 1);
    return true;
  }

  const result = await query('DELETE FROM classes WHERE id = $1', [id]);
  return result.rowCount > 0;
}

export async function countStudentsByClassIds(classIds = []) {
  const normalized = [...new Set(classIds.filter(Boolean))];
  if (!normalized.length) return new Map();

  if (!env.useDatabase) {
    return new Map(
      normalized.map((classId) => [
        classId,
        adminStore.students.filter((student) => student.classId === classId).filter((student) => isCountableActiveStudent(student)).length
      ])
    );
  }

  const result = await query(
    `SELECT class_id, COUNT(*)::int AS student_count
     FROM students
     WHERE class_id = ANY($1::text[])
       AND account_status = ANY($2::text[])
       AND COALESCE(user_id, '') <> ''
       AND COALESCE(portal_email, '') <> ''
     GROUP BY class_id`,
    [normalized, ['pending', 'provisioned', 'active']]
  );

  const counts = new Map();
  result.rows.forEach((row) => {
    counts.set(row.class_id, Number(row.student_count || 0));
  });

  return counts;
}

export async function upsertManyClasses(records = []) {
  const normalized = records.map(normalizeClassInput).filter((item) => item.id && item.name && item.arm && item.institution);
  if (!env.useDatabase || !normalized.length) return normalized;

  for (const item of normalized) {
    await query(
      `INSERT INTO classes (id, name, arm, progression_order, institution)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id)
       DO UPDATE SET
         name = EXCLUDED.name,
         arm = EXCLUDED.arm,
         progression_order = EXCLUDED.progression_order,
         institution = EXCLUDED.institution`,
      [item.id, item.name, item.arm, item.progressionOrder, item.institution]
    );
  }

  return normalized;
}
