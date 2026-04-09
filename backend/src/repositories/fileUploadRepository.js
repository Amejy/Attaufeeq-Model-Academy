import crypto from 'node:crypto';
import { query } from '../db/client.js';

function mapUpload(row) {
  if (!row) return null;
  return {
    id: row.id,
    originalName: row.original_name,
    visibility: row.visibility,
    mime: row.mime,
    extension: row.extension,
    size: Number(row.size || 0),
    data: row.data,
    createdAt: row.created_at
  };
}

export async function createFileUpload({ originalName, visibility, mime, extension, size, data }) {
  const id = `upl-${crypto.randomUUID()}`;
  const result = await query(
    `INSERT INTO file_uploads (id, original_name, visibility, mime, extension, size, data)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [id, originalName, visibility, mime, extension, Number(size || 0), data]
  );

  return mapUpload(result.rows[0]);
}

export async function findFileUploadById(id) {
  if (!id) return null;
  const result = await query('SELECT * FROM file_uploads WHERE id = $1 LIMIT 1', [id]);
  return mapUpload(result.rows[0]);
}
