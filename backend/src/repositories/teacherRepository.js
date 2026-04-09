import { env } from '../config/env.js';
import { adminStore } from '../data/adminStore.js';
import { query } from '../db/client.js';

function mapDbTeacher(row) {
  if (!row) return null;
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    institution: row.institution,
    userId: row.user_id || '',
    portalEmail: row.portal_email || '',
    createdAt: row.created_at
  };
}

function normalizeTeacherInput(record) {
  return {
    id: String(record?.id || '').trim(),
    fullName: String(record?.fullName || '').trim(),
    email: String(record?.email || '').trim().toLowerCase(),
    institution: String(record?.institution || '').trim(),
    userId: String(record?.userId || '').trim(),
    portalEmail: String(record?.portalEmail || '').trim().toLowerCase()
  };
}

export async function listTeachers({ institution = '', search = '', sort = '' } = {}) {
  if (!env.useDatabase) {
    return adminStore.teachers
      .filter((item) => (institution ? item.institution === institution : true))
      .filter((item) => {
        if (!search) return true;
        const needle = search.toLowerCase();
        return `${item.fullName} ${item.email}`.toLowerCase().includes(needle);
      })
      .sort((a, b) => {
        if (sort === 'created_desc') {
          return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        }
        if (sort === 'created_asc') {
          return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
        }
        if (sort === 'name_desc') {
          return String(b.fullName || '').localeCompare(String(a.fullName || ''));
        }
        return String(a.fullName || '').localeCompare(String(b.fullName || ''));
      });
  }

  const params = [];
  const clauses = [];
  if (institution) {
    params.push(institution);
    clauses.push(`institution = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    const idx = params.length;
    clauses.push(`(full_name ILIKE $${idx} OR email ILIKE $${idx})`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const orderBy =
    sort === 'created_desc'
      ? 'created_at DESC'
      : sort === 'created_asc'
        ? 'created_at ASC'
        : sort === 'name_desc'
          ? 'full_name DESC'
          : 'full_name ASC';
  const result = await query(`SELECT * FROM teachers ${where} ORDER BY ${orderBy}`, params);
  return result.rows.map(mapDbTeacher);
}

export async function findTeacherById(id) {
  if (!id) return null;

  if (!env.useDatabase) {
    return adminStore.teachers.find((item) => item.id === id) || null;
  }

  const result = await query('SELECT * FROM teachers WHERE id = $1 LIMIT 1', [id]);
  return mapDbTeacher(result.rows[0]);
}

export async function findTeacherByEmail(email) {
  if (!email) return null;

  if (!env.useDatabase) {
    return adminStore.teachers.find((item) => item.email.toLowerCase() === String(email).toLowerCase()) || null;
  }

  const result = await query('SELECT * FROM teachers WHERE lower(email) = lower($1) LIMIT 1', [email]);
  return mapDbTeacher(result.rows[0]);
}

export async function createTeacher(record) {
  const item = normalizeTeacherInput(record);

  if (!env.useDatabase) {
    adminStore.teachers.unshift(item);
    return item;
  }

  await query(
    `INSERT INTO teachers (id, full_name, email, institution, user_id, portal_email)
     VALUES ($1, $2, $3, $4, NULLIF($5, ''), NULLIF($6, ''))`,
    [item.id, item.fullName, item.email, item.institution, item.userId, item.portalEmail]
  );

  return item;
}

export async function updateTeacher(id, record) {
  const item = normalizeTeacherInput({ ...record, id });

  if (!env.useDatabase) {
    const index = adminStore.teachers.findIndex((teacher) => teacher.id === id);
    if (index === -1) return null;
    adminStore.teachers[index] = item;
    return item;
  }

  const result = await query(
    `UPDATE teachers
     SET full_name = $2,
         email = $3,
         institution = $4,
         user_id = NULLIF($5, ''),
         portal_email = NULLIF($6, '')
     WHERE id = $1
     RETURNING *`,
    [id, item.fullName, item.email, item.institution, item.userId, item.portalEmail]
  );

  return mapDbTeacher(result.rows[0]);
}

export async function deleteTeacherById(id) {
  if (!id) return false;

  if (!env.useDatabase) {
    const index = adminStore.teachers.findIndex((item) => item.id === id);
    if (index === -1) return false;
    adminStore.teachers.splice(index, 1);
    return true;
  }

  const result = await query('DELETE FROM teachers WHERE id = $1', [id]);
  return result.rowCount > 0;
}

export async function upsertManyTeachers(records = []) {
  const normalized = records
    .map(normalizeTeacherInput)
    .filter((item) => item.id && item.fullName && item.email && item.institution);

  if (!env.useDatabase || !normalized.length) return normalized;

  for (const item of normalized) {
    await query(
      `INSERT INTO teachers (id, full_name, email, institution, user_id, portal_email)
       VALUES ($1, $2, $3, $4, NULLIF($5, ''), NULLIF($6, ''))
       ON CONFLICT (id)
       DO UPDATE SET
         full_name = EXCLUDED.full_name,
         email = EXCLUDED.email,
         institution = EXCLUDED.institution,
         user_id = EXCLUDED.user_id,
         portal_email = EXCLUDED.portal_email`,
      [item.id, item.fullName, item.email, item.institution, item.userId, item.portalEmail]
    );
  }

  return normalized;
}
