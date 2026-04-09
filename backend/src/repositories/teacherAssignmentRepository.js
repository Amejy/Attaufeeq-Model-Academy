import { env } from '../config/env.js';
import { adminStore } from '../data/adminStore.js';
import { query } from '../db/client.js';

function mapDbAssignment(row) {
  if (!row) return null;
  return {
    id: row.id,
    teacherId: row.teacher_id,
    classId: row.class_id,
    subjectId: row.subject_id,
    term: row.term,
    assignmentRole: row.assignment_role || 'Subject Teacher',
    note: row.note || '',
    createdAt: row.created_at
  };
}

function normalizeAssignmentInput(record) {
  return {
    id: String(record?.id || '').trim(),
    teacherId: String(record?.teacherId || '').trim(),
    classId: String(record?.classId || '').trim(),
    subjectId: String(record?.subjectId || '').trim(),
    term: String(record?.term || '').trim(),
    assignmentRole: String(record?.assignmentRole || 'Subject Teacher').trim() || 'Subject Teacher',
    note: String(record?.note || '').trim()
  };
}

export async function listTeacherAssignments({ teacherId = '', classId = '', subjectId = '', term = '', institution = '' } = {}) {
  if (!env.useDatabase) {
    return adminStore.teacherAssignments
      .filter((item) => (teacherId ? item.teacherId === teacherId : true))
      .filter((item) => (classId ? item.classId === classId : true))
      .filter((item) => (subjectId ? item.subjectId === subjectId : true))
      .filter((item) => (term ? item.term === term : true))
      .filter((item) => {
        if (!institution) return true;
        const classItem = adminStore.classes.find((entry) => entry.id === item.classId);
        return classItem?.institution === institution;
      });
  }

  const clauses = [];
  const params = [];

  if (teacherId) {
    params.push(teacherId);
    clauses.push(`assignment.teacher_id = $${params.length}`);
  }
  if (classId) {
    params.push(classId);
    clauses.push(`assignment.class_id = $${params.length}`);
  }
  if (subjectId) {
    params.push(subjectId);
    clauses.push(`assignment.subject_id = $${params.length}`);
  }
  if (term) {
    params.push(term);
    clauses.push(`assignment.term = $${params.length}`);
  }
  if (institution) {
    params.push(institution);
    clauses.push(`class_item.institution = $${params.length}`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await query(
    `SELECT assignment.*
     FROM teacher_assignments AS assignment
     JOIN classes AS class_item ON class_item.id = assignment.class_id
     ${where}
     ORDER BY assignment.created_at DESC`,
    params
  );

  return result.rows.map(mapDbAssignment);
}

export async function findTeacherAssignmentById(id) {
  if (!id) return null;

  if (!env.useDatabase) {
    return adminStore.teacherAssignments.find((item) => item.id === id) || null;
  }

  const result = await query('SELECT * FROM teacher_assignments WHERE id = $1 LIMIT 1', [id]);
  return mapDbAssignment(result.rows[0]);
}

export async function createTeacherAssignment(record) {
  const item = normalizeAssignmentInput(record);

  if (!env.useDatabase) {
    adminStore.teacherAssignments.unshift(item);
    return item;
  }

  await query(
    `INSERT INTO teacher_assignments (id, teacher_id, class_id, subject_id, term, assignment_role, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [item.id, item.teacherId, item.classId, item.subjectId, item.term, item.assignmentRole, item.note]
  );

  return item;
}

export async function updateTeacherAssignment(id, record) {
  const item = normalizeAssignmentInput({ ...record, id });

  if (!env.useDatabase) {
    const index = adminStore.teacherAssignments.findIndex((assignment) => assignment.id === id);
    if (index === -1) return null;
    adminStore.teacherAssignments[index] = item;
    return item;
  }

  const result = await query(
    `UPDATE teacher_assignments
     SET teacher_id = $2,
         class_id = $3,
         subject_id = $4,
         term = $5,
         assignment_role = $6,
         note = $7
     WHERE id = $1
     RETURNING *`,
    [id, item.teacherId, item.classId, item.subjectId, item.term, item.assignmentRole, item.note]
  );

  return mapDbAssignment(result.rows[0]);
}

export async function deleteTeacherAssignmentById(id) {
  if (!id) return false;

  if (!env.useDatabase) {
    const index = adminStore.teacherAssignments.findIndex((item) => item.id === id);
    if (index === -1) return false;
    adminStore.teacherAssignments.splice(index, 1);
    return true;
  }

  const result = await query('DELETE FROM teacher_assignments WHERE id = $1', [id]);
  return result.rowCount > 0;
}

export async function upsertManyTeacherAssignments(records = []) {
  const normalized = records
    .map(normalizeAssignmentInput)
    .filter((item) => item.id && item.teacherId && item.classId && item.subjectId && item.term);

  if (!env.useDatabase || !normalized.length) return normalized;

  for (const item of normalized) {
    await query(
      `INSERT INTO teacher_assignments (id, teacher_id, class_id, subject_id, term, assignment_role, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id)
       DO UPDATE SET
         teacher_id = EXCLUDED.teacher_id,
         class_id = EXCLUDED.class_id,
         subject_id = EXCLUDED.subject_id,
         term = EXCLUDED.term,
         assignment_role = EXCLUDED.assignment_role,
         note = EXCLUDED.note`,
      [item.id, item.teacherId, item.classId, item.subjectId, item.term, item.assignmentRole, item.note]
    );
  }

  return normalized;
}
