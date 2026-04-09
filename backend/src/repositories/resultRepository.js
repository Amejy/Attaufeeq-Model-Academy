import { env } from '../config/env.js';
import { adminStore } from '../data/adminStore.js';
import { query } from '../db/client.js';

function serializeTimestamp(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString();

  const normalized = String(value).trim();
  return normalized || '';
}

function mapDbResult(row) {
  if (!row) return null;
  return {
    id: row.id,
    studentId: row.student_id,
    classId: row.class_id,
    sessionId: row.session_id || '',
    subjectId: row.subject_id,
    term: row.term,
    ca: Number(row.ca || 0),
    exam: Number(row.exam || 0),
    total: Number(row.total || 0),
    grade: row.grade,
    remark: row.remark,
    published: Boolean(row.published),
    approvedAt: serializeTimestamp(row.approved_at),
    approvedByUserId: row.approved_by_user_id || '',
    approvedByName: row.approved_by_name || '',
    approvedByEmail: row.approved_by_email || '',
    teacherClearedAt: serializeTimestamp(row.teacher_cleared_at),
    institution: row.institution || '',
    enteredByTeacherId: row.entered_by_teacher_id || '',
    submittedAt: serializeTimestamp(row.submitted_at),
    submittedByTeacherId: row.submitted_by_teacher_id || '',
    createdAt: serializeTimestamp(row.created_at),
    updatedAt: serializeTimestamp(row.updated_at || row.created_at)
  };
}

function normalizeResultInput(record) {
  return {
    id: String(record?.id || '').trim(),
    studentId: String(record?.studentId || '').trim(),
    classId: String(record?.classId || '').trim(),
    sessionId: String(record?.sessionId || '').trim(),
    subjectId: String(record?.subjectId || '').trim(),
    term: String(record?.term || '').trim(),
    ca: Number(record?.ca || 0),
    exam: Number(record?.exam || 0),
    total: Number(record?.total || 0),
    grade: String(record?.grade || '').trim(),
    remark: String(record?.remark || '').trim(),
    published: Boolean(record?.published),
    approvedAt: serializeTimestamp(record?.approvedAt),
    approvedByUserId: String(record?.approvedByUserId || '').trim(),
    approvedByName: String(record?.approvedByName || '').trim(),
    approvedByEmail: String(record?.approvedByEmail || '').trim(),
    teacherClearedAt: serializeTimestamp(record?.teacherClearedAt),
    institution: String(record?.institution || '').trim(),
    enteredByTeacherId: String(record?.enteredByTeacherId || '').trim(),
    submittedAt: serializeTimestamp(record?.submittedAt),
    submittedByTeacherId: String(record?.submittedByTeacherId || '').trim(),
    createdAt: serializeTimestamp(record?.createdAt) || new Date().toISOString(),
    updatedAt: serializeTimestamp(record?.updatedAt) || new Date().toISOString()
  };
}

function chunkItems(items = [], size = 200) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export async function listResults({
  term = '',
  classId = '',
  studentId = '',
  subjectId = '',
  sessionId = '',
  institution = '',
  published
} = {}) {
  if (!env.useDatabase) {
    return adminStore.results
      .filter((item) => (term ? item.term === term : true))
      .filter((item) => (classId ? item.classId === classId : true))
      .filter((item) => (sessionId ? item.sessionId === sessionId : true))
      .filter((item) => (studentId ? item.studentId === studentId : true))
      .filter((item) => (subjectId ? item.subjectId === subjectId : true))
      .filter((item) => (typeof published === 'boolean' ? Boolean(item.published) === published : true))
      .filter((item) => {
        if (!institution) return true;
        if (item.institution) return item.institution === institution;
        const classItem = adminStore.classes.find((entry) => entry.id === item.classId);
        return classItem?.institution === institution;
      });
  }

  const clauses = [];
  const params = [];

  if (term) {
    params.push(term);
    clauses.push(`result.term = $${params.length}`);
  }
  if (classId) {
    params.push(classId);
    clauses.push(`result.class_id = $${params.length}`);
  }
  if (sessionId) {
    params.push(sessionId);
    clauses.push(`result.session_id = $${params.length}`);
  }
  if (studentId) {
    params.push(studentId);
    clauses.push(`result.student_id = $${params.length}`);
  }
  if (subjectId) {
    params.push(subjectId);
    clauses.push(`result.subject_id = $${params.length}`);
  }
  if (typeof published === 'boolean') {
    params.push(published);
    clauses.push(`result.published = $${params.length}`);
  }
  if (institution) {
    params.push(institution);
    clauses.push(`COALESCE(result.institution, class_item.institution) = $${params.length}`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await query(
    `SELECT result.*
     FROM results AS result
     JOIN classes AS class_item ON class_item.id = result.class_id
     ${where}
     ORDER BY COALESCE(result.updated_at, result.created_at) DESC`,
    params
  );

  return result.rows.map(mapDbResult);
}

export async function upsertResult(record) {
  const item = normalizeResultInput(record);

  if (!env.useDatabase) {
    const index = adminStore.results.findIndex(
      (result) =>
        result.studentId === item.studentId &&
        result.classId === item.classId &&
        result.sessionId === item.sessionId &&
        result.subjectId === item.subjectId &&
        result.term === item.term
    );
    if (index >= 0) {
      const existing = adminStore.results[index];
      adminStore.results[index] = {
        ...existing,
        ...item,
        id: adminStore.results[index].id,
        approvedAt: item.approvedAt || existing.approvedAt || '',
        approvedByUserId: item.approvedByUserId || existing.approvedByUserId || '',
        approvedByName: item.approvedByName || existing.approvedByName || '',
        approvedByEmail: item.approvedByEmail || existing.approvedByEmail || '',
        teacherClearedAt: item.teacherClearedAt || existing.teacherClearedAt || '',
        published: typeof item.published === 'boolean' ? item.published : existing.published
      };
      return adminStore.results[index];
    }
    adminStore.results.unshift(item);
    return item;
  }

  const result = await query(
    `INSERT INTO results (
      id, student_id, class_id, session_id, subject_id, term, ca, exam, total, grade, remark,
      published, approved_at, approved_by_user_id, approved_by_name, approved_by_email,
      institution, entered_by_teacher_id, submitted_at, submitted_by_teacher_id, created_at, updated_at
    ) VALUES (
      $1, $2, $3, NULLIF($4, ''), $5, $6, $7, $8, $9, $10, $11,
      $12, CAST(NULLIF($13, '') AS TIMESTAMPTZ), NULLIF($14, ''), NULLIF($15, ''), NULLIF($16, ''),
      NULLIF($17, ''), NULLIF($18, ''), CAST(NULLIF($19, '') AS TIMESTAMPTZ), NULLIF($20, ''), $21::TIMESTAMPTZ, $22::TIMESTAMPTZ
    )
    ON CONFLICT (student_id, class_id, subject_id, term, session_id)
    DO UPDATE SET
      ca = EXCLUDED.ca,
      exam = EXCLUDED.exam,
      total = EXCLUDED.total,
      grade = EXCLUDED.grade,
      remark = EXCLUDED.remark,
      published = results.published,
      approved_at = COALESCE(results.approved_at, EXCLUDED.approved_at),
      approved_by_user_id = COALESCE(results.approved_by_user_id, EXCLUDED.approved_by_user_id),
      approved_by_name = COALESCE(results.approved_by_name, EXCLUDED.approved_by_name),
      approved_by_email = COALESCE(results.approved_by_email, EXCLUDED.approved_by_email),
      session_id = COALESCE(EXCLUDED.session_id, results.session_id),
      institution = EXCLUDED.institution,
      entered_by_teacher_id = EXCLUDED.entered_by_teacher_id,
      submitted_at = COALESCE(results.submitted_at, EXCLUDED.submitted_at),
      submitted_by_teacher_id = COALESCE(results.submitted_by_teacher_id, EXCLUDED.submitted_by_teacher_id),
      updated_at = EXCLUDED.updated_at
    RETURNING *`,
    [
      item.id,
      item.studentId,
      item.classId,
      item.sessionId,
      item.subjectId,
      item.term,
      item.ca,
      item.exam,
      item.total,
      item.grade,
      item.remark,
      item.published,
      item.approvedAt || null,
      item.approvedByUserId || null,
      item.approvedByName || null,
      item.approvedByEmail || null,
      item.institution,
      item.enteredByTeacherId,
      item.submittedAt || null,
      item.submittedByTeacherId || null,
      item.createdAt,
      item.updatedAt
    ]
  );

  return mapDbResult(result.rows[0]);
}

export async function publishResults({
  term,
  classId = '',
  sessionId = '',
  institution = '',
  requireSubmitted = true,
  approvedBy = null,
  studentIds = null
} = {}) {
  if (!term) return [];
  if (Array.isArray(studentIds) && studentIds.length === 0) return [];

  if (!env.useDatabase) {
    const updated = [];
    const approvedAt = new Date().toISOString();
    adminStore.results = adminStore.results.map((item) => {
      const classItem = adminStore.classes.find((entry) => entry.id === item.classId);
      const resultInstitution = item.institution || classItem?.institution || '';
      const submittedOk = !requireSubmitted || item.submittedAt || item.submittedByTeacherId;
      const match =
        item.term === term &&
        (!classId || item.classId === classId) &&
        (!sessionId || item.sessionId === sessionId) &&
        (!institution || resultInstitution === institution) &&
        (!Array.isArray(studentIds) || studentIds.includes(item.studentId)) &&
        !item.published &&
        submittedOk;
      if (!match) return item;
      const next = {
        ...item,
        published: true,
        approvedAt: item.approvedAt || approvedAt,
        approvedByUserId: item.approvedByUserId || approvedBy?.userId || '',
        approvedByName: item.approvedByName || approvedBy?.name || '',
        approvedByEmail: item.approvedByEmail || approvedBy?.email || ''
      };
      updated.push(next);
      return next;
    });
    return updated;
  }

  const params = [term];
  const clauses = ['result.term = $1'];

  if (classId) {
    params.push(classId);
    clauses.push(`result.class_id = $${params.length}`);
  }
  if (sessionId) {
    params.push(sessionId);
    clauses.push(`result.session_id = $${params.length}`);
  }
  if (institution) {
    params.push(institution);
    clauses.push(`COALESCE(result.institution, class_item.institution) = $${params.length}`);
  }
  if (requireSubmitted) {
    clauses.push('(result.submitted_at IS NOT NULL OR result.submitted_by_teacher_id IS NOT NULL)');
  }
  if (Array.isArray(studentIds)) {
    params.push(studentIds);
    clauses.push(`result.student_id = ANY($${params.length})`);
  }

  params.push(approvedBy?.userId || null, approvedBy?.name || null, approvedBy?.email || null);

  const result = await query(
    `UPDATE results AS result
     SET published = TRUE,
         approved_at = COALESCE(result.approved_at, NOW()),
         approved_by_user_id = COALESCE(result.approved_by_user_id, $${params.length - 2}),
         approved_by_name = COALESCE(result.approved_by_name, $${params.length - 1}),
         approved_by_email = COALESCE(result.approved_by_email, $${params.length}),
         institution = COALESCE(result.institution, class_item.institution),
         updated_at = NOW()
     FROM classes AS class_item
     WHERE class_item.id = result.class_id
       AND result.published = FALSE
       AND ${clauses.join(' AND ')}
     RETURNING result.*`,
    params
  );

  return result.rows.map(mapDbResult);
}

export async function submitResults({
  classId = '',
  subjectId = '',
  term = '',
  sessionId = '',
  institution = '',
  teacherId = ''
} = {}) {
  if (!classId || !subjectId || !term) return [];

  if (!env.useDatabase) {
    const updated = [];
    const now = new Date().toISOString();
    adminStore.results = adminStore.results.map((item) => {
      const classItem = adminStore.classes.find((entry) => entry.id === item.classId);
      const resultInstitution = item.institution || classItem?.institution || '';
      const match =
        item.classId === classId &&
        item.subjectId === subjectId &&
        item.term === term &&
        (!sessionId || item.sessionId === sessionId) &&
        (!institution || resultInstitution === institution) &&
        !item.published &&
        !item.submittedAt &&
        !item.submittedByTeacherId;
      if (!match) return item;
      const next = { ...item, submittedAt: now, submittedByTeacherId: teacherId };
      updated.push(next);
      return next;
    });
    return updated;
  }

  const params = [classId, subjectId, term];
  const clauses = ['result.class_id = $1', 'result.subject_id = $2', 'result.term = $3'];

  if (sessionId) {
    params.push(sessionId);
    clauses.push(`result.session_id = $${params.length}`);
  }
  if (institution) {
    params.push(institution);
    clauses.push(`COALESCE(result.institution, class_item.institution) = $${params.length}`);
  }

  params.push(teacherId || null);

  const result = await query(
    `UPDATE results AS result
     SET submitted_at = NOW(),
         submitted_by_teacher_id = COALESCE($${params.length}, result.submitted_by_teacher_id),
         updated_at = NOW()
     FROM classes AS class_item
     WHERE class_item.id = result.class_id
       AND result.published = FALSE
       AND result.submitted_at IS NULL
       AND result.submitted_by_teacher_id IS NULL
       AND ${clauses.join(' AND ')}
     RETURNING result.*`,
    params
  );

  return result.rows.map(mapDbResult);
}

export async function clearUnsubmittedResults({
  classId = '',
  subjectId = '',
  term = '',
  sessionId = '',
  institution = '',
  teacherId = ''
} = {}) {
  if (!classId || !subjectId || !term) return 0;

  if (!env.useDatabase) {
    const before = adminStore.results.length;
    adminStore.results = adminStore.results.filter((item) => {
      const classItem = adminStore.classes.find((entry) => entry.id === item.classId);
      const resultInstitution = item.institution || classItem?.institution || '';
      const match =
        item.classId === classId &&
        item.subjectId === subjectId &&
        item.term === term &&
        (!sessionId || item.sessionId === sessionId) &&
        (!institution || resultInstitution === institution) &&
        (!teacherId || item.enteredByTeacherId === teacherId) &&
        !item.submittedAt &&
        !item.submittedByTeacherId &&
        !item.published;
      return !match;
    });
    return before - adminStore.results.length;
  }

  const params = [classId, subjectId, term];
  const clauses = [
    'result.class_id = $1',
    'result.subject_id = $2',
    'result.term = $3',
    'result.submitted_at IS NULL',
    'result.published = FALSE'
  ];

  if (sessionId) {
    params.push(sessionId);
    clauses.push(`session_id = $${params.length}`);
  }
  if (institution) {
    params.push(institution);
    clauses.push(`COALESCE(result.institution, class_item.institution) = $${params.length}`);
  }
  if (teacherId) {
    params.push(teacherId);
    clauses.push(`entered_by_teacher_id = $${params.length}`);
  }

  const joinClause = institution ? 'USING classes AS class_item' : '';
  if (institution) {
    clauses.push('class_item.id = result.class_id');
  }

  const result = await query(
    `DELETE FROM results AS result
     ${joinClause}
     WHERE ${clauses.join(' AND ')}`,
    params
  );

  return result.rowCount || 0;
}

export async function markResultsClearedForTeacher({
  classId = '',
  subjectId = '',
  term = '',
  sessionId = '',
  institution = '',
  teacherId = ''
} = {}) {
  if (!classId || !subjectId || !term) return 0;

  if (!env.useDatabase) {
    const now = new Date().toISOString();
    let cleared = 0;
    adminStore.results = adminStore.results.map((item) => {
      const classItem = adminStore.classes.find((entry) => entry.id === item.classId);
      const resultInstitution = item.institution || classItem?.institution || '';
      const teacherMatch =
        !teacherId ||
        !item.enteredByTeacherId ||
        item.enteredByTeacherId === teacherId ||
        item.submittedByTeacherId === teacherId;
      const match =
        item.classId === classId &&
        item.subjectId === subjectId &&
        item.term === term &&
        (!sessionId || item.sessionId === sessionId) &&
        (!institution || resultInstitution === institution) &&
        item.published &&
        !item.teacherClearedAt &&
        teacherMatch;
      if (!match) return item;
      cleared += 1;
      return { ...item, teacherClearedAt: now };
    });
    return cleared;
  }

  const params = [classId, subjectId, term];
  const clauses = [
    'result.class_id = $1',
    'result.subject_id = $2',
    'result.term = $3',
    'result.published = TRUE',
    'result.teacher_cleared_at IS NULL'
  ];

  if (sessionId) {
    params.push(sessionId);
    clauses.push(`result.session_id = $${params.length}`);
  }
  if (institution) {
    params.push(institution);
    clauses.push(`COALESCE(result.institution, class_item.institution) = $${params.length}`);
  }
  if (teacherId) {
    params.push(teacherId);
    clauses.push(`(result.entered_by_teacher_id = $${params.length} OR result.submitted_by_teacher_id = $${params.length})`);
  }

  const joinClause = institution ? 'FROM classes AS class_item' : '';
  if (institution) {
    clauses.push('class_item.id = result.class_id');
  }

  const result = await query(
    `UPDATE results AS result
     SET teacher_cleared_at = NOW()
     ${joinClause}
     WHERE ${clauses.join(' AND ')}`,
    params
  );

  return result.rowCount || 0;
}

export async function upsertManyResults(records = []) {
  const normalized = records
    .map(normalizeResultInput)
    .filter((item) => item.id && item.studentId && item.classId && item.subjectId && item.term && item.sessionId);

  if (!env.useDatabase || !normalized.length) return normalized;

  for (const batch of chunkItems(normalized)) {
    const values = [];
    const placeholders = batch.map((item, index) => {
      const offset = index * 22;
      values.push(
        item.id,
        item.studentId,
        item.classId,
        item.sessionId,
        item.subjectId,
        item.term,
        item.ca,
        item.exam,
        item.total,
        item.grade,
        item.remark,
        item.published,
        item.approvedAt || null,
        item.approvedByUserId || null,
        item.approvedByName || null,
        item.approvedByEmail || null,
        item.institution,
        item.enteredByTeacherId,
        item.submittedAt || null,
        item.submittedByTeacherId || null,
        item.createdAt,
        item.updatedAt
      );
      return `(
        $${offset + 1}, $${offset + 2}, $${offset + 3}, NULLIF($${offset + 4}, ''), $${offset + 5}, $${offset + 6},
        $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12},
        CAST(NULLIF($${offset + 13}, '') AS TIMESTAMPTZ), NULLIF($${offset + 14}, ''), NULLIF($${offset + 15}, ''),
        NULLIF($${offset + 16}, ''), NULLIF($${offset + 17}, ''), NULLIF($${offset + 18}, ''),
        CAST(NULLIF($${offset + 19}, '') AS TIMESTAMPTZ), NULLIF($${offset + 20}, ''), $${offset + 21}::TIMESTAMPTZ,
        $${offset + 22}::TIMESTAMPTZ
      )`;
    });

    await query(
      `INSERT INTO results (
        id, student_id, class_id, session_id, subject_id, term, ca, exam, total, grade, remark,
        published, approved_at, approved_by_user_id, approved_by_name, approved_by_email,
        institution, entered_by_teacher_id, submitted_at, submitted_by_teacher_id, created_at, updated_at
      ) VALUES ${placeholders.join(', ')}
      ON CONFLICT (student_id, class_id, subject_id, term, session_id)
      DO UPDATE SET
        ca = EXCLUDED.ca,
        exam = EXCLUDED.exam,
        total = EXCLUDED.total,
        grade = EXCLUDED.grade,
        remark = EXCLUDED.remark,
        published = results.published,
        approved_at = COALESCE(results.approved_at, EXCLUDED.approved_at),
        approved_by_user_id = COALESCE(results.approved_by_user_id, EXCLUDED.approved_by_user_id),
        approved_by_name = COALESCE(results.approved_by_name, EXCLUDED.approved_by_name),
        approved_by_email = COALESCE(results.approved_by_email, EXCLUDED.approved_by_email),
        session_id = COALESCE(EXCLUDED.session_id, results.session_id),
        institution = EXCLUDED.institution,
        entered_by_teacher_id = EXCLUDED.entered_by_teacher_id,
        submitted_at = COALESCE(results.submitted_at, EXCLUDED.submitted_at),
        submitted_by_teacher_id = COALESCE(results.submitted_by_teacher_id, EXCLUDED.submitted_by_teacher_id),
        updated_at = EXCLUDED.updated_at`,
      values
    );
  }

  return normalized;
}
