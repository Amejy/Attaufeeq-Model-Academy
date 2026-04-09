import crypto from 'node:crypto';
import { query, withTransaction } from '../db/client.js';

function mapSubjectResult(row) {
  if (!row) return null;
  return {
    id: row.id,
    studentCode: row.student_code,
    subject: row.subject,
    score: Number(row.score || 0),
    grade: row.grade,
    classId: row.class_id,
    term: row.term,
    sessionId: row.session_id,
    teacherId: row.teacher_id,
    status: row.status,
    createdAt: row.created_at,
    approvedAt: row.approved_at,
    approvedByUserId: row.approved_by_user_id
  };
}

function mapFinalResult(row) {
  if (!row) return null;
  return {
    id: row.id,
    studentCode: row.student_code,
    term: row.term,
    sessionId: row.session_id,
    classId: row.class_id,
    subjects: row.subjects || [],
    totalScore: Number(row.total_score || 0),
    averageScore: Number(row.average_score || 0),
    gradeSummary: row.grade_summary || '',
    approvedAt: row.approved_at,
    approvedByUserId: row.approved_by_user_id
  };
}

export async function createSubjectResult({
  studentCode,
  subject,
  score,
  grade,
  classId,
  term,
  sessionId,
  teacherId
} = {}) {
  const result = await query(
    `INSERT INTO subject_results
      (id, student_code, subject, score, grade, class_id, term, session_id, teacher_id, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
     RETURNING *`,
    [
      crypto.randomUUID(),
      String(studentCode || '').trim(),
      String(subject || '').trim(),
      Number(score || 0),
      String(grade || '').trim(),
      String(classId || '').trim(),
      String(term || '').trim(),
      String(sessionId || '').trim(),
      String(teacherId || '').trim()
    ]
  );
  return mapSubjectResult(result.rows[0]);
}

export async function listPendingSubjectGroups({ term = '', sessionId = '' } = {}) {
  const clauses = ['status = $1'];
  const params = ['pending'];
  if (term) {
    params.push(term);
    clauses.push(`term = $${params.length}`);
  }
  if (sessionId) {
    params.push(sessionId);
    clauses.push(`session_id = $${params.length}`);
  }

  const result = await query(
    `SELECT student_code,
            term,
            session_id,
            class_id,
            json_agg(json_build_object(
              'id', id,
              'subject', subject,
              'score', score,
              'grade', grade,
              'teacherId', teacher_id,
              'createdAt', created_at
            ) ORDER BY created_at ASC) AS subjects,
            MAX(created_at) AS last_submitted_at
     FROM subject_results
     WHERE ${clauses.join(' AND ')}
     GROUP BY student_code, term, session_id, class_id
     ORDER BY last_submitted_at DESC`,
    params
  );

  return result.rows.map((row) => ({
    studentCode: row.student_code,
    term: row.term,
    sessionId: row.session_id,
    classId: row.class_id,
    subjects: row.subjects || [],
    lastSubmittedAt: row.last_submitted_at
  }));
}

export async function listPendingSubjectsForGroup({ studentCode, term, sessionId }) {
  const result = await query(
    `SELECT * FROM subject_results
     WHERE student_code = $1 AND term = $2 AND session_id = $3 AND status = 'pending'
     ORDER BY created_at ASC`,
    [String(studentCode || '').trim(), String(term || '').trim(), String(sessionId || '').trim()]
  );
  return result.rows.map(mapSubjectResult);
}

export async function upsertFinalResult({
  studentCode,
  term,
  sessionId,
  classId,
  subjects,
  totalScore,
  averageScore,
  gradeSummary,
  approvedByUserId
} = {}) {
  const id = crypto.randomUUID();
  const result = await query(
    `INSERT INTO final_results
      (id, student_code, term, session_id, class_id, subjects, total_score, average_score, grade_summary, approved_at, approved_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10)
     ON CONFLICT (student_code, term, session_id)
     DO UPDATE SET
       class_id = EXCLUDED.class_id,
       subjects = EXCLUDED.subjects,
       total_score = EXCLUDED.total_score,
       average_score = EXCLUDED.average_score,
       grade_summary = EXCLUDED.grade_summary,
       approved_at = NOW(),
       approved_by_user_id = EXCLUDED.approved_by_user_id
     RETURNING *`,
    [
      id,
      String(studentCode || '').trim(),
      String(term || '').trim(),
      String(sessionId || '').trim(),
      String(classId || '').trim(),
      JSON.stringify(subjects || []),
      Number(totalScore || 0),
      Number(averageScore || 0),
      String(gradeSummary || '').trim(),
      String(approvedByUserId || '').trim() || null
    ]
  );
  return mapFinalResult(result.rows[0]);
}

export async function markSubjectResultsApproved({ studentCode, term, sessionId, approvedByUserId }) {
  await query(
    `UPDATE subject_results
     SET status = 'approved', approved_at = NOW(), approved_by_user_id = $4
     WHERE student_code = $1 AND term = $2 AND session_id = $3 AND status = 'pending'`,
    [
      String(studentCode || '').trim(),
      String(term || '').trim(),
      String(sessionId || '').trim(),
      String(approvedByUserId || '').trim() || null
    ]
  );
}

export async function getFinalResult({ studentCode, term, sessionId }) {
  const normalizedCode = String(studentCode || '').trim();
  const normalizedTerm = String(term || '').trim();
  const normalizedSessionId = String(sessionId || '').trim();
  if (!normalizedCode || !normalizedTerm) return null;

  if (normalizedSessionId) {
    const result = await query(
      `SELECT * FROM final_results
       WHERE student_code = $1 AND LOWER(term) = LOWER($2) AND session_id = $3
       LIMIT 1`,
      [normalizedCode, normalizedTerm, normalizedSessionId]
    );
    if (result.rows[0]) {
      return mapFinalResult(result.rows[0]);
    }
  }

  const fallback = await query(
    `SELECT * FROM final_results
     WHERE student_code = $1 AND LOWER(term) = LOWER($2)
     ORDER BY approved_at DESC
     LIMIT 1`,
    [normalizedCode, normalizedTerm]
  );
  return mapFinalResult(fallback.rows[0]);
}

export async function countFinalResultsForSessionTerm({ sessionId = '', term = '', classIds = [] } = {}) {
  if (!sessionId || !term) return 0;

  const params = [String(sessionId || '').trim(), String(term || '').trim()];
  let where = 'session_id = $1 AND term = $2';

  if (Array.isArray(classIds) && classIds.length) {
    params.push(classIds);
    where += ` AND class_id = ANY($${params.length})`;
  }

  const result = await query(`SELECT COUNT(*)::int AS count FROM final_results WHERE ${where}`, params);
  return Number(result.rows[0]?.count || 0);
}

export async function compileFinalResultForGroup({
  studentCode,
  term,
  sessionId,
  approvedByUserId
}) {
  return withTransaction(async () => {
    const pending = await listPendingSubjectsForGroup({ studentCode, term, sessionId });
    if (!pending.length) {
      return { error: 'No pending subject results found for this student and term.' };
    }

    const totalScore = pending.reduce((sum, row) => sum + Number(row.score || 0), 0);
    const averageScore = pending.length ? Number((totalScore / pending.length).toFixed(2)) : 0;
    const gradeSummary =
      averageScore >= 70 ? 'A' :
      averageScore >= 60 ? 'B' :
      averageScore >= 50 ? 'C' :
      averageScore >= 45 ? 'D' :
      averageScore >= 40 ? 'E' : 'F';

    const classId = pending[0]?.classId || '';
    const subjects = pending.map((row) => ({
      subject: row.subject,
      score: row.score,
      grade: row.grade,
      teacherId: row.teacherId
    }));

    const finalResult = await upsertFinalResult({
      studentCode,
      term,
      sessionId,
      classId,
      subjects,
      totalScore,
      averageScore,
      gradeSummary,
      approvedByUserId
    });

    await markSubjectResultsApproved({ studentCode, term, sessionId, approvedByUserId });

    return { finalResult };
  });
}
