import { env } from '../config/env.js';
import { adminStore, makeId } from '../data/adminStore.js';
import { query } from '../db/client.js';
import { ensureActiveAcademicSession } from './academicSessionRepository.js';

function getExecutor(executor) {
  if (executor?.query) return executor;
  return { query };
}

function mapDbEnrollment(row) {
  if (!row) return null;
  return {
    id: row.id,
    studentId: row.student_id,
    classId: row.class_id,
    sessionId: row.session_id,
    promotedFromClass: row.promoted_from_class || '',
    createdAt: row.created_at
  };
}

function normalizeEnrollmentInput(record) {
  return {
    id: String(record?.id || '').trim(),
    studentId: String(record?.studentId || '').trim(),
    classId: String(record?.classId || '').trim(),
    sessionId: String(record?.sessionId || '').trim(),
    promotedFromClass: String(record?.promotedFromClass || '').trim(),
    createdAt: record?.createdAt || new Date().toISOString()
  };
}

function chunkItems(items = [], size = 250) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export async function listStudentEnrollments({ studentId = '', sessionId = '', classId = '' } = {}) {
  if (!env.useDatabase) {
    return (adminStore.studentEnrollments || [])
      .filter((item) => (studentId ? item.studentId === studentId : true))
      .filter((item) => (sessionId ? item.sessionId === sessionId : true))
      .filter((item) => (classId ? item.classId === classId : true));
  }

  const clauses = [];
  const params = [];

  if (studentId) {
    params.push(studentId);
    clauses.push(`student_id = $${params.length}`);
  }
  if (sessionId) {
    params.push(sessionId);
    clauses.push(`session_id = $${params.length}`);
  }
  if (classId) {
    params.push(classId);
    clauses.push(`class_id = $${params.length}`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await query(`SELECT * FROM student_enrollments ${where} ORDER BY created_at DESC`, params);
  return result.rows.map(mapDbEnrollment);
}

export async function findEnrollmentForStudent({ studentId, sessionId = '' } = {}) {
  if (!studentId) return null;

  let resolvedSessionId = sessionId;
  if (!resolvedSessionId) {
    const active = await ensureActiveAcademicSession();
    resolvedSessionId = active?.id || '';
  }

  if (!env.useDatabase) {
    const enrollments = adminStore.studentEnrollments || [];
    if (resolvedSessionId) {
      return enrollments.find((item) => item.studentId === studentId && item.sessionId === resolvedSessionId) || null;
    }
    return enrollments.find((item) => item.studentId === studentId) || null;
  }

  if (resolvedSessionId) {
    const result = await query(
      'SELECT * FROM student_enrollments WHERE student_id = $1 AND session_id = $2 LIMIT 1',
      [studentId, resolvedSessionId]
    );
    return mapDbEnrollment(result.rows[0]);
  }

  const fallback = await query('SELECT * FROM student_enrollments WHERE student_id = $1 ORDER BY created_at DESC LIMIT 1', [
    studentId
  ]);
  return mapDbEnrollment(fallback.rows[0]);
}

export async function upsertStudentEnrollment(record, options = {}) {
  const normalized = normalizeEnrollmentInput(record);
  if (!normalized.studentId || !normalized.classId) return null;

  let sessionId = normalized.sessionId;
  if (!sessionId) {
    const active = await ensureActiveAcademicSession();
    sessionId = active?.id || '';
  }

  if (!sessionId) return null;

  if (!env.useDatabase) {
    const enrollments = adminStore.studentEnrollments || [];
    const index = enrollments.findIndex(
      (item) => item.studentId === normalized.studentId && item.sessionId === sessionId
    );

    const entry = {
      ...normalized,
      sessionId,
      id: normalized.id || (index >= 0 ? enrollments[index].id : makeId('enr')),
      createdAt: normalized.createdAt || new Date().toISOString()
    };

    if (index >= 0) {
      enrollments[index] = {
        ...enrollments[index],
        ...entry,
        id: enrollments[index].id
      };
    } else {
      enrollments.unshift(entry);
    }
    adminStore.studentEnrollments = enrollments;
    return entry;
  }

  const id = normalized.id || makeId('enr');
  const executor = getExecutor(options.executor);
  const result = await executor.query(
    `INSERT INTO student_enrollments (
      id, student_id, class_id, session_id, promoted_from_class, created_at
    ) VALUES (
      $1, $2, $3, $4, NULLIF($5, ''), $6
    )
    ON CONFLICT (student_id, session_id)
    DO UPDATE SET
      class_id = EXCLUDED.class_id,
      promoted_from_class = COALESCE(EXCLUDED.promoted_from_class, student_enrollments.promoted_from_class)
    RETURNING *`,
    [id, normalized.studentId, normalized.classId, sessionId, normalized.promotedFromClass, normalized.createdAt]
  );

  return mapDbEnrollment(result.rows[0]);
}

export async function upsertManyStudentEnrollments(records = [], options = {}) {
  const normalized = records
    .map(normalizeEnrollmentInput)
    .filter((item) => item.studentId && item.classId && item.sessionId);

  if (!env.useDatabase) {
    adminStore.studentEnrollments = normalized;
    return normalized;
  }

  const executor = getExecutor(options.executor);
  for (const batch of chunkItems(normalized)) {
    const values = [];
    const placeholders = batch.map((item, index) => {
      const offset = index * 6;
      values.push(
        item.id || makeId('enr'),
        item.studentId,
        item.classId,
        item.sessionId,
        item.promotedFromClass,
        item.createdAt
      );
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, NULLIF($${offset + 5}, ''), $${offset + 6})`;
    });

    await executor.query(
      `INSERT INTO student_enrollments (
        id, student_id, class_id, session_id, promoted_from_class, created_at
      ) VALUES ${placeholders.join(', ')}
      ON CONFLICT (student_id, session_id)
      DO UPDATE SET
        class_id = EXCLUDED.class_id,
        promoted_from_class = COALESCE(EXCLUDED.promoted_from_class, student_enrollments.promoted_from_class)`,
      values
    );
  }

  return normalized;
}
