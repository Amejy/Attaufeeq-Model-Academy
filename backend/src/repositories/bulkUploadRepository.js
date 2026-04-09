import crypto from 'node:crypto';
import { query } from '../db/client.js';

function normalizeNumber(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.trunc(num));
}

function normalizeRows(rows = []) {
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, 500).map((row) => ({
    rowIndex: row.rowIndex ?? row.row_index ?? null,
    status: String(row.status || '').trim() || 'unknown',
    decision: String(row.decision || '').trim() || 'pending',
    error: String(row.error || '').trim(),
    fullName: row.fullName || row.full_name || '',
    classId: row.classId || row.class_id || '',
    className: row.className || row.class_name || '',
    arm: row.arm || '',
    institution: row.institution || '',
    studentEmail: row.studentEmail || row.student_email || '',
    guardianName: row.guardianName || row.guardian_name || '',
    guardianPhone: row.guardianPhone || row.guardian_phone || '',
    guardianEmail: row.guardianEmail || row.guardian_email || '',
    dupeKey: row._dupeKey || row.dupeKey || ''
  }));
}

export async function createBulkStudentUploadSession({
  createdByUserId = '',
  createdByRole = '',
  fileName = '',
  totalRows = 0,
  approvedRows = 0,
  validRows = 0,
  invalidRows = 0,
  duplicateRows = 0,
  reportRows = []
} = {}) {
  const id = crypto.randomUUID();
  const normalizedRows = normalizeRows(reportRows);

  const result = await query(
    `INSERT INTO bulk_student_uploads
      (id, created_by_user_id, created_by_role, file_name, total_rows, approved_rows, valid_rows, invalid_rows, duplicate_rows, report_rows)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      id,
      createdByUserId || null,
      createdByRole || null,
      String(fileName || '').trim() || 'upload',
      normalizeNumber(totalRows),
      normalizeNumber(approvedRows),
      normalizeNumber(validRows),
      normalizeNumber(invalidRows),
      normalizeNumber(duplicateRows),
      JSON.stringify(normalizedRows)
    ]
  );

  return mapBulkUploadRow(result.rows[0]);
}

export async function listBulkStudentUploadSessions({ limit = 25, offset = 0 } = {}) {
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 25));
  const safeOffset = Math.max(0, Number(offset) || 0);

  const result = await query(
    `SELECT *
     FROM bulk_student_uploads
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    [safeLimit, safeOffset]
  );

  return result.rows.map(mapBulkUploadRow);
}

export async function getBulkStudentUploadSession(id = '') {
  const key = String(id || '').trim();
  if (!key) return null;
  const result = await query('SELECT * FROM bulk_student_uploads WHERE id = $1', [key]);
  return mapBulkUploadRow(result.rows[0]);
}

export async function clearBulkStudentUploadSessions() {
  await query('DELETE FROM bulk_student_uploads');
  return true;
}

function mapBulkUploadRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    createdAt: row.created_at?.toISOString?.() || row.created_at,
    createdByUserId: row.created_by_user_id || '',
    createdByRole: row.created_by_role || '',
    fileName: row.file_name || '',
    totalRows: Number(row.total_rows || 0),
    approvedRows: Number(row.approved_rows || 0),
    validRows: Number(row.valid_rows || 0),
    invalidRows: Number(row.invalid_rows || 0),
    duplicateRows: Number(row.duplicate_rows || 0),
    rows: Array.isArray(row.report_rows) ? row.report_rows : []
  };
}
