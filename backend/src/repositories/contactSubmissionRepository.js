import { query } from '../db/client.js';

export async function createContactSubmission(submission) {
  const result = await query(
    `INSERT INTO contact_submissions (
      id,
      full_name,
      email,
      message,
      ip_address,
      user_agent
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id, full_name, email, message, status, created_at`,
    [
      submission.id,
      submission.fullName,
      submission.email,
      submission.message,
      submission.ipAddress,
      submission.userAgent
    ]
  );

  return result.rows[0] || null;
}

export async function listContactSubmissions(limit = 50) {
  const safeLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(Number(limit), 200)) : 50;
  const result = await query(
    `SELECT id, full_name, email, message, status, created_at
     FROM contact_submissions
     ORDER BY created_at DESC
     LIMIT $1`,
    [safeLimit]
  );

  return result.rows;
}
