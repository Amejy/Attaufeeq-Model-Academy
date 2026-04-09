import dotenv from 'dotenv';

dotenv.config();

process.env.NODE_ENV = 'test';
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test-jwt-secret';
}
if (!process.env.REFRESH_SECRET) {
  process.env.REFRESH_SECRET = 'test-refresh-secret';
}
if (!process.env.DATABASE_URL) {
  const host = process.env.DB_HOST || '127.0.0.1';
  const port = process.env.DB_PORT || '5432';
  const user = process.env.DB_USER || 'postgres';
  const password = process.env.DB_PASSWORD || 'postgres';
  const name = process.env.DB_NAME || 'school_system';
  process.env.DATABASE_URL = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${name}`;
}
if (!process.env.BOOTSTRAP_ADMIN_EMAIL) {
  process.env.BOOTSTRAP_ADMIN_EMAIL = 'bootstrap.admin@attaufiq.local';
}
if (!process.env.BOOTSTRAP_ADMIN_PASSWORD) {
  process.env.BOOTSTRAP_ADMIN_PASSWORD = 'Bootstrap-Admin-Password-123!';
}
if (!process.env.CORS_ORIGINS) {
  process.env.CORS_ORIGINS = 'http://localhost:5173';
}

process.env.USE_DATABASE = 'true';
process.env.RATE_LIMIT_STORE = 'memory';
process.env.CACHE_STORE = 'memory';
process.env.MAIL_ENABLED = 'false';
