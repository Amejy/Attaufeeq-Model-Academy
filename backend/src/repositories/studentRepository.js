import { env } from '../config/env.js';
import { adminStore } from '../data/adminStore.js';
import { query } from '../db/client.js';
import { findUsersByIds } from './userRepository.js';

function canonicalInstitutionKey(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  if (normalized.includes('madrasa') || normalized.includes('madrastul')) return 'madrasa';
  if (normalized.includes('memorization')) return 'memorization';
  return 'model';
}

function getExecutor(executor) {
  if (executor?.query) return executor;
  return { query };
}

function currentStudentIdYear() {
  return new Date().getFullYear();
}

function normalizeGeneratedStudentId(value = '') {
  return String(value || '').trim().toUpperCase();
}

function extractStudentIdSequence(id = '', year = currentStudentIdYear()) {
  const match = normalizeGeneratedStudentId(id).match(/^AMA-(\d{4})-(\d{4})$/);
  if (!match) return null;
  if (Number(match[1]) !== Number(year)) return null;
  return Number(match[2]);
}

async function generateStudentId(options = {}) {
  const year = Number(options.year || currentStudentIdYear());

  if (!env.useDatabase) {
    const nextSequence = adminStore.students.reduce((max, student) => {
      const sequence = extractStudentIdSequence(student.id, year);
      return sequence && sequence > max ? sequence : max;
    }, 0) + 1;
    return `AMA-${year}-${String(nextSequence).padStart(4, '0')}`;
  }

  const executor = getExecutor(options.executor);
  const result = await executor.query(
    `SELECT id
       FROM students
      WHERE id LIKE $1
      ORDER BY id DESC
      LIMIT 1`,
    [`AMA-${year}-%`]
  );

  const nextSequence = extractStudentIdSequence(result.rows[0]?.id, year) || 0;
  return `AMA-${year}-${String(nextSequence + 1).padStart(4, '0')}`;
}

function mapDbStudent(row) {
  if (!row) return null;
  return {
    id: row.id,
    fullName: row.full_name,
    classId: row.class_id || '',
    level: row.level,
    institution: row.institution,
    studentEmail: row.student_email || '',
    guardianName: row.guardian_name || '',
    guardianPhone: row.guardian_phone || '',
    guardianEmail: row.guardian_email || '',
    userId: row.user_id || '',
    portalEmail: row.portal_email || '',
    parentUserId: row.parent_user_id || '',
    parentPortalEmail: row.parent_portal_email || '',
    accountStatus: row.account_status || 'pending',
    createdAt: row.created_at
  };
}

function normalizeStudentInput(record) {
  return {
    id: String(record?.id || '').trim(),
    fullName: String(record?.fullName || '').trim(),
    classId: String(record?.classId || '').trim(),
    level: String(record?.level || '').trim(),
    institution: String(record?.institution || '').trim(),
    studentEmail: String(record?.studentEmail || '').trim(),
    guardianName: String(record?.guardianName || '').trim(),
    guardianPhone: String(record?.guardianPhone || '').trim(),
    guardianEmail: String(record?.guardianEmail || '').trim(),
    userId: String(record?.userId || '').trim(),
    portalEmail: String(record?.portalEmail || '').trim(),
    parentUserId: String(record?.parentUserId || '').trim(),
    parentPortalEmail: String(record?.parentPortalEmail || '').trim(),
    accountStatus: String(record?.accountStatus || 'pending').trim() || 'pending'
  };
}

function ensureStudentUserLink(item, options = {}) {
  if (!env.useDatabase) return;
  if (options.requireUserLink === false) return;

  if (!item.userId) {
    throw new Error('Student record must include a valid userId before it can be saved.');
  }

  if (!item.portalEmail) {
    throw new Error('Student record must include a portalEmail before it can be saved.');
  }
}

async function normalizeStudentReferences(item, options = {}) {
  if (!env.useDatabase) return item;

  const userIds = [...new Set([item.userId, item.parentUserId].filter(Boolean))];
  if (!userIds.length) return item;

  const users = await findUsersByIds(userIds, { executor: options.executor });
  const existingIds = new Set(users.map((user) => user.id));
  const missingUserId = item.userId && !existingIds.has(item.userId);
  const missingParentUserId = item.parentUserId && !existingIds.has(item.parentUserId);

  if (!missingUserId && !missingParentUserId) {
    return item;
  }

  if (options.onMissingUser === 'strip') {
    return {
      ...item,
      userId: missingUserId ? '' : item.userId,
      portalEmail: missingUserId ? '' : item.portalEmail,
      parentUserId: missingParentUserId ? '' : item.parentUserId,
      parentPortalEmail: missingParentUserId ? '' : item.parentPortalEmail,
      accountStatus: missingUserId ? 'pending' : item.accountStatus
    };
  }

  if (missingUserId) {
    throw new Error(`Student user account ${item.userId} does not exist.`);
  }

  throw new Error(`Parent user account ${item.parentUserId} does not exist.`);
}

export async function listStudents({ institution = '', classId = '', status = '', search = '', sort = '' } = {}) {
  if (!env.useDatabase) {
    const institutionKey = canonicalInstitutionKey(institution);
    return adminStore.students
      .filter((item) => {
        if (!institutionKey) return true;
        return canonicalInstitutionKey(item.institution) === institutionKey;
      })
      .filter((item) => (classId ? item.classId === classId : true))
      .filter((item) => (status ? String(item.accountStatus || '').toLowerCase() === status : true))
      .filter((item) => {
        if (!search) return true;
        const needle = search.toLowerCase();
        const haystack = `${item.fullName} ${item.studentEmail} ${item.guardianEmail} ${item.portalEmail} ${item.parentPortalEmail} ${item.id}`.toLowerCase();
        return haystack.includes(needle);
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

  const clauses = [];
  const params = [];

  const institutionKey = canonicalInstitutionKey(institution);
  if (institutionKey) {
    if (institutionKey === 'madrasa') {
      clauses.push(`(LOWER(institution) LIKE '%madrasa%' OR LOWER(institution) LIKE '%madrastul%')`);
    } else if (institutionKey === 'memorization') {
      clauses.push(`LOWER(institution) LIKE '%memorization%'`);
    } else {
      clauses.push(`LOWER(institution) NOT LIKE '%madrasa%' AND LOWER(institution) NOT LIKE '%madrastul%' AND LOWER(institution) NOT LIKE '%memorization%'`);
    }
  }

  if (classId) {
    params.push(classId);
    clauses.push(`class_id = $${params.length}`);
  }

  if (status) {
    params.push(status);
    clauses.push(`LOWER(account_status) = $${params.length}`);
  }

  if (search) {
    params.push(`%${search}%`);
    const idx = params.length;
    clauses.push(`(full_name ILIKE $${idx} OR student_email ILIKE $${idx} OR guardian_email ILIKE $${idx} OR portal_email ILIKE $${idx} OR parent_portal_email ILIKE $${idx} OR id ILIKE $${idx})`);
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
  const result = await query(`SELECT * FROM students ${where} ORDER BY ${orderBy}`, params);
  return result.rows.map(mapDbStudent);
}

export async function findStudentById(id) {
  if (!id) return null;

  if (!env.useDatabase) {
    return adminStore.students.find((item) => item.id === id) || null;
  }

  const result = await query('SELECT * FROM students WHERE id = $1 LIMIT 1', [id]);
  return mapDbStudent(result.rows[0]);
}

export async function createStudent(record, options = {}) {
  const baseItem = normalizeStudentInput(record);
  const item = await normalizeStudentReferences({
    ...baseItem,
    id: baseItem.id || await generateStudentId({ executor: options.executor })
  }, {
    executor: options.executor,
    onMissingUser: options.onMissingUser || 'error'
  });
  ensureStudentUserLink(item, options);

  if (!env.useDatabase) {
    adminStore.students.unshift(item);
    return item;
  }

  const executor = getExecutor(options.executor);
  await executor.query(
    `INSERT INTO students (
      id, full_name, class_id, level, institution, student_email,
      guardian_name, guardian_phone, guardian_email, user_id, portal_email,
      parent_user_id, parent_portal_email, account_status
    ) VALUES (
      $1, $2, NULLIF($3, ''), $4, $5, $6,
      $7, $8, $9, NULLIF($10, ''), $11,
      NULLIF($12, ''), $13, $14
    )`,
    [
      item.id,
      item.fullName,
      item.classId,
      item.level,
      item.institution,
      item.studentEmail,
      item.guardianName,
      item.guardianPhone,
      item.guardianEmail,
      item.userId,
      item.portalEmail,
      item.parentUserId,
      item.parentPortalEmail,
      item.accountStatus
    ]
  );

  return item;
}

export async function updateStudent(id, record, options = {}) {
  const item = await normalizeStudentReferences(normalizeStudentInput({ ...record, id }), {
    executor: options.executor,
    onMissingUser: options.onMissingUser || 'error'
  });
  ensureStudentUserLink(item, options);

  if (!env.useDatabase) {
    const index = adminStore.students.findIndex((student) => student.id === id);
    if (index === -1) return null;
    adminStore.students[index] = item;
    return item;
  }

  const executor = getExecutor(options.executor);
  const result = await executor.query(
    `UPDATE students
     SET full_name = $2,
         class_id = NULLIF($3, ''),
         level = $4,
         institution = $5,
         student_email = $6,
         guardian_name = $7,
         guardian_phone = $8,
         guardian_email = $9,
         user_id = NULLIF($10, ''),
         portal_email = $11,
         parent_user_id = NULLIF($12, ''),
         parent_portal_email = $13,
         account_status = $14
     WHERE id = $1
     RETURNING *`,
    [
      id,
      item.fullName,
      item.classId,
      item.level,
      item.institution,
      item.studentEmail,
      item.guardianName,
      item.guardianPhone,
      item.guardianEmail,
      item.userId,
      item.portalEmail,
      item.parentUserId,
      item.parentPortalEmail,
      item.accountStatus
    ]
  );

  return mapDbStudent(result.rows[0]);
}

export async function deleteStudentById(id, options = {}) {
  if (!id) return false;

  if (!env.useDatabase) {
    const index = adminStore.students.findIndex((item) => item.id === id);
    if (index === -1) return false;
    adminStore.students.splice(index, 1);
    return true;
  }

  const executor = getExecutor(options.executor);
  const result = await executor.query('DELETE FROM students WHERE id = $1', [id]);
  return result.rowCount > 0;
}

export async function upsertManyStudents(records = [], options = {}) {
  const normalized = records.map(normalizeStudentInput).filter((item) => item.id && item.fullName && item.level && item.institution);
  if (!env.useDatabase || !normalized.length) return normalized;

  const executor = getExecutor(options.executor);

  for (const item of normalized) {
    const prepared = await normalizeStudentReferences(item, {
      executor: options.executor,
      onMissingUser: options.onMissingUser || 'error'
    });
    ensureStudentUserLink(prepared, options);

    await executor.query(
      `INSERT INTO students (
        id, full_name, class_id, level, institution, student_email,
        guardian_name, guardian_phone, guardian_email, user_id, portal_email,
        parent_user_id, parent_portal_email, account_status
      ) VALUES (
        $1, $2, NULLIF($3, ''), $4, $5, $6,
        $7, $8, $9, NULLIF($10, ''), $11,
        NULLIF($12, ''), $13, $14
      )
      ON CONFLICT (id)
      DO UPDATE SET
        full_name = EXCLUDED.full_name,
        class_id = EXCLUDED.class_id,
        level = EXCLUDED.level,
        institution = EXCLUDED.institution,
        student_email = EXCLUDED.student_email,
        guardian_name = EXCLUDED.guardian_name,
        guardian_phone = EXCLUDED.guardian_phone,
        guardian_email = EXCLUDED.guardian_email,
        user_id = EXCLUDED.user_id,
        portal_email = EXCLUDED.portal_email,
        parent_user_id = EXCLUDED.parent_user_id,
        parent_portal_email = EXCLUDED.parent_portal_email,
        account_status = EXCLUDED.account_status`,
      [
        prepared.id,
        prepared.fullName,
        prepared.classId,
        prepared.level,
        prepared.institution,
        prepared.studentEmail,
        prepared.guardianName,
        prepared.guardianPhone,
        prepared.guardianEmail,
        prepared.userId,
        prepared.portalEmail,
        prepared.parentUserId,
        prepared.parentPortalEmail,
        prepared.accountStatus
      ]
    );
  }

  return Promise.all(
    normalized.map((item) => normalizeStudentReferences(item, {
      executor: options.executor,
      onMissingUser: options.onMissingUser || 'error'
    }))
  );
}
