import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { findFileUploadById } from './repositories/fileUploadRepository.js';

import { serializeAdminStoreWrites } from './middleware/adminStoreWriteLock.js';
import { attachUserIfPresent, requireAuth, requireRole } from './middleware/auth.js';
import { auditRequests } from './middleware/audit.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { createRateLimiter } from './middleware/rateLimit.js';
import apiRouter from './routes/index.js';

const app = express();
app.disable('x-powered-by');
if (env.trustProxy) {
  app.set('trust proxy', 1);
}

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  })
);
app.use(
  cors({
    origin(origin, callback) {
      // Allow same-origin and non-browser requests (curl/postman).
      if (!origin) return callback(null, true);

      const vercelPreviewRegex = /^https:\/\/attaufeeq-model-academy(-[a-z0-9-]+)?\.vercel\.app$/i;
      const allowed =
        env.corsOrigins.includes(origin) ||
        vercelPreviewRegex.test(origin) ||
        (
          env.isDevelopment &&
          (
            /^http:\/\/localhost:\d+$/.test(origin) ||
            /^http:\/\/127\.0\.0\.1:\d+$/.test(origin)
          )
        );

      if (allowed) return callback(null, true);
      return callback(new Error('CORS blocked for this origin.'));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    credentials: true
  })
);
app.use(morgan('dev'));
app.use(express.json({ limit: '1mb' }));
app.use(attachUserIfPresent);

function requestIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function requestEmail(req) {
  return String(req.body?.email || '').trim().toLowerCase() || 'anonymous';
}

const apiLimiter = createRateLimiter({
  name: 'api-global',
  windowMs: 60 * 1000,
  maxRequests: 240
});

const authIpLimiter = createRateLimiter({
  name: 'auth-ip',
  windowMs: 15 * 60 * 1000,
  maxRequests: 10,
  keyFromReq: (req) => requestIp(req)
});

const authCredentialLimiter = createRateLimiter({
  name: 'auth-login',
  windowMs: 10 * 60 * 1000,
  maxRequests: 5,
  keyFromReq: async (req) => `${requestEmail(req)}|${requestIp(req)}`
});

const authResetLimiter = createRateLimiter({
  name: 'auth-reset',
  windowMs: 15 * 60 * 1000,
  maxRequests: 5,
  keyFromReq: async (req) => `${requestEmail(req)}|${requestIp(req)}`
});

const signupLimiter = createRateLimiter({
  name: 'auth-signup',
  windowMs: 60 * 60 * 1000,
  maxRequests: 3,
  keyFromReq: async (req) => `${requestEmail(req)}|${requestIp(req)}`
});

const admissionsSubmitLimiter = createRateLimiter({
  name: 'admissions-submit',
  windowMs: 60 * 60 * 1000,
  maxRequests: 10,
  keyFromReq: (req) => requestIp(req)
});

const admissionsUploadLimiter = createRateLimiter({
  name: 'admissions-upload',
  windowMs: 60 * 60 * 1000,
  maxRequests: 10,
  keyFromReq: (req) => requestIp(req)
});

const contactSubmitLimiter = createRateLimiter({
  name: 'contact-submit',
  windowMs: 60 * 60 * 1000,
  maxRequests: 5,
  keyFromReq: (req) => requestIp(req)
});

app.use('/api', apiLimiter);
app.use('/api/auth/login', authIpLimiter);
app.use('/api/auth/login', authCredentialLimiter);
app.use('/api/auth/forgot-password', authResetLimiter);
app.use('/api/auth/reset-password', authResetLimiter);
app.use('/api/auth/change-password', authResetLimiter);
app.use('/api/auth/signup', signupLimiter);
app.use('/api/admissions/upload', admissionsUploadLimiter);
app.post('/api/admissions', admissionsSubmitLimiter);
app.use('/api/site-content/contact', contactSubmitLimiter);
app.use('/api', auditRequests);
app.use('/api', serializeAdminStoreWrites);

app.get('/api/uploads/public/:id', async (req, res) => {
  const upload = await findFileUploadById(String(req.params.id || '').trim());
  if (!upload || upload.visibility !== 'public') {
    return res.status(404).json({ message: 'File not found.' });
  }

  res.setHeader('Content-Type', upload.mime);
  res.setHeader('Content-Length', String(upload.size));
  res.setHeader('Content-Disposition', `inline; filename="${upload.originalName}"`);
  return res.send(upload.data);
});

app.get('/api/uploads/private/:id', requireAuth, requireRole('admin', 'admissions'), async (req, res) => {
  const upload = await findFileUploadById(String(req.params.id || '').trim());
  if (!upload || upload.visibility !== 'private') {
    return res.status(404).json({ message: 'File not found.' });
  }

  res.setHeader('Content-Type', upload.mime);
  res.setHeader('Content-Length', String(upload.size));
  res.setHeader('Content-Disposition', `inline; filename="${upload.originalName}"`);
  return res.send(upload.data);
});

app.use('/api', apiRouter);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
