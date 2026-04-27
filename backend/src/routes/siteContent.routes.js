import crypto from 'node:crypto';
import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { createContactSubmission, listContactSubmissions } from '../repositories/contactSubmissionRepository.js';
import { defaultSiteContent, loadSiteContent, saveSiteContent } from '../services/siteContentService.js';

const siteContentRouter = Router();

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

siteContentRouter.get('/', async (_req, res) => {
  try {
    const content = await loadSiteContent();
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
    return res.json({ content });
  } catch (error) {
    console.error('Public site content fallback activated:', error.message || error);
    res.setHeader('Cache-Control', 'public, max-age=15, stale-while-revalidate=30');
    return res.json({
      content: defaultSiteContent,
      degraded: true
    });
  }
});

siteContentRouter.post('/contact', async (req, res) => {
  const { fullName, email, message } = req.body || {};
  const normalizedFullName = String(fullName || '').trim();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedMessage = String(message || '').trim();

  if (!normalizedFullName || !normalizedEmail || !normalizedMessage) {
    return res.status(400).json({ message: 'fullName, email, and message are required.' });
  }

  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({ message: 'A valid email address is required.' });
  }

  if (normalizedMessage.length < 10) {
    return res.status(400).json({ message: 'Message must be at least 10 characters long.' });
  }

  const record = await createContactSubmission({
    id: `contact-${crypto.randomUUID()}`,
    fullName: normalizedFullName,
    email: normalizedEmail,
    message: normalizedMessage,
    ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
    userAgent: String(req.get('user-agent') || '').slice(0, 255)
  });

  return res.status(201).json({
    message: 'Message received successfully. The school will follow up shortly.',
    submission: record
  });
});

siteContentRouter.get('/admin', requireAuth, requireRole('admin'), async (_req, res) => {
  const content = await loadSiteContent();
  res.setHeader('Cache-Control', 'private, no-store');
  return res.json({ content });
});

siteContentRouter.put('/admin', requireAuth, requireRole('admin'), async (req, res) => {
  const { content } = req.body || {};
  if (!content || typeof content !== 'object') {
    return res.status(400).json({ message: 'content payload is required.' });
  }

  const saved = await saveSiteContent(content);
  return res.json(saved);
});

siteContentRouter.get('/admin/contact-submissions', requireAuth, requireRole('admin'), async (req, res) => {
  const submissions = await listContactSubmissions(req.query.limit || 50);
  return res.json({ submissions });
});

export default siteContentRouter;
