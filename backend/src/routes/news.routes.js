import { Router } from 'express';
import { adminStore, makeId } from '../data/adminStore.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { deleteCacheByPrefix, withCache } from '../services/cacheService.js';
import { publicUpload, saveUploadedFile } from './upload.js';

const newsRouter = Router();
const NEWS_CACHE_TTL_SECONDS = 60;

const INSTITUTION_ALIASES = new Map([
  ['model academy', 'ATTAUFEEQ Model Academy'],
  ['attafeeq model academy', 'ATTAUFEEQ Model Academy'],
  ['attafiq model academy', 'ATTAUFEEQ Model Academy'],
  ['madrastul attafeeq', 'Madrastul ATTAUFEEQ'],
  ['madrastul attaufiq', 'Madrastul ATTAUFEEQ'],
  ['madrastul attaufeeq', 'Madrastul ATTAUFEEQ'],
  ['quran memorization', 'Quran Memorization Academy'],
  ['quran memorization academy', 'Quran Memorization Academy']
]);
const CATEGORY_ALIASES = new Map([
  ['announcement', 'announcement'],
  ['announcements', 'announcement'],
  ['event', 'event'],
  ['events', 'event'],
  ['academic', 'academic'],
  ['academics', 'academic'],
  ['program', 'program'],
  ['programme', 'program'],
  ['programs', 'program'],
  ['programmes', 'program'],
  ['exam', 'exam'],
  ['exams', 'exam'],
  ['examination', 'exam'],
  ['examinations', 'exam'],
  ['holiday', 'holiday'],
  ['holidays', 'holiday'],
  ['achievement', 'achievement'],
  ['achievements', 'achievement']
]);

function normalizeInstitution(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  return INSTITUTION_ALIASES.get(trimmed.toLowerCase()) || trimmed;
}

function normalizeCategory(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  return CATEGORY_ALIASES.get(trimmed.toLowerCase()) || trimmed.toLowerCase();
}

function normalizeNewsItem(item) {
  return item
    ? {
        ...item,
        institution: normalizeInstitution(item.institution),
        category: normalizeCategory(item.category)
      }
    : item;
}

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function buildNewsListCacheKey({ institution = '', category = '' } = {}) {
  return `news:list:institution=${institution || 'all'}:category=${category || 'all'}`;
}

function buildNewsItemCacheKey(key) {
  return `news:item:${String(key || '').trim().toLowerCase() || 'unknown'}`;
}

async function invalidateNewsCache() {
  await deleteCacheByPrefix('news:');
}

newsRouter.get('/', async (req, res) => {
  const institution = normalizeInstitution(req.query.institution ? String(req.query.institution) : '');
  const category = normalizeCategory(req.query.category ? String(req.query.category) : '');

  const payload = await withCache(
    buildNewsListCacheKey({ institution, category }),
    async () => ({
      news: adminStore.newsEvents
        .filter((item) => String(item.status || 'published').trim().toLowerCase() === 'published')
        .map(normalizeNewsItem)
        .filter((item) => (institution ? item.institution === institution : true))
        .filter((item) => (category ? item.category === category : true))
        .sort((a, b) => new Date(b.publishDate || b.createdAt) - new Date(a.publishDate || a.createdAt))
    }),
    { ttlSeconds: NEWS_CACHE_TTL_SECONDS }
  );

  res.setHeader('Cache-Control', `public, max-age=${NEWS_CACHE_TTL_SECONDS}, stale-while-revalidate=${NEWS_CACHE_TTL_SECONDS * 2}`);
  return res.json(payload);
});

newsRouter.get('/admin/all', requireAuth, requireRole('admin', 'admissions'), (_req, res) => {
  const rows = [...adminStore.newsEvents].sort(
    (a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)
  );
  return res.json({ news: rows.map(normalizeNewsItem) });
});

newsRouter.post('/admin/upload', requireAuth, requireRole('admin', 'admissions'), publicUpload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded.' });
  }
  try {
    const saved = await saveUploadedFile(req.file, {
      visibility: 'public',
      allowedMimes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime']
    });
    const baseUrl = req.protocol + '://' + req.get('host') + '/api';
    const url = `${baseUrl}/uploads/public/${saved.id}`;
    return res.status(201).json({ url, filename: saved.id });
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Upload failed.' });
  }
});

newsRouter.post('/admin', requireAuth, requireRole('admin', 'admissions'), async (req, res) => {
  const {
    title,
    category,
    institution,
    excerpt,
    content,
    publishDate,
    images,
    videos
  } = req.body || {};

  const normalizedTitle = String(title || '').trim();
  const normalizedCategory = normalizeCategory(category);
  const normalizedInstitution = normalizeInstitution(institution);
  const normalizedExcerpt = String(excerpt || '').trim();
  const normalizedContent = String(content || '').trim();
  const normalizedPublishDate = String(publishDate || '').trim();

  if (!normalizedTitle || !normalizedCategory || !normalizedInstitution || !normalizedContent) {
    return res.status(400).json({ message: 'title, category, institution, content are required.' });
  }
  if (normalizedPublishDate && Number.isNaN(new Date(normalizedPublishDate).getTime())) {
    return res.status(400).json({ message: 'publishDate must be a valid date.' });
  }

  const slug = slugify(normalizedTitle);
  const slugTaken = adminStore.newsEvents.some((item) => item.slug === slug);
  const finalSlug = slugTaken ? `${slug}-${Date.now()}` : slug;

  const now = new Date().toISOString();
  const record = {
    id: makeId('news'),
    title: normalizedTitle,
    slug: finalSlug,
    category: normalizedCategory,
    institution: normalizedInstitution,
    excerpt: normalizedExcerpt,
    content: normalizedContent,
    status: 'published',
    publishDate: normalizedPublishDate || now,
    images: Array.isArray(images) ? images : [],
    videos: Array.isArray(videos) ? videos : [],
    createdAt: now,
    updatedAt: now
  };

  adminStore.newsEvents.unshift(record);
  await invalidateNewsCache();
  return res.status(201).json({ news: record });
});

newsRouter.put('/admin/:id', requireAuth, requireRole('admin', 'admissions'), async (req, res) => {
  const { id } = req.params;
  const index = adminStore.newsEvents.findIndex((item) => item.id === id);

  if (index === -1) {
    return res.status(404).json({ message: 'News item not found.' });
  }

  const current = adminStore.newsEvents[index];
  const nextTitle = String(req.body?.title ?? current.title).trim();
  const nextCategory = normalizeCategory(req.body?.category ?? current.category);
  const nextInstitution = normalizeInstitution(req.body?.institution ?? current.institution);
  const nextExcerpt = String(req.body?.excerpt ?? current.excerpt ?? '').trim();
  const nextContent = String(req.body?.content ?? current.content).trim();
  const nextPublishDate = String(req.body?.publishDate ?? current.publishDate ?? '').trim();

  if (!nextTitle || !nextCategory || !nextInstitution || !nextContent) {
    return res.status(400).json({ message: 'title, category, institution, content are required.' });
  }
  if (nextPublishDate && Number.isNaN(new Date(nextPublishDate).getTime())) {
    return res.status(400).json({ message: 'publishDate must be a valid date.' });
  }

  const baseSlug = slugify(nextTitle);

  const duplicateSlug = adminStore.newsEvents.some(
    (item) => item.id !== id && item.slug === baseSlug
  );

  adminStore.newsEvents[index] = {
    ...current,
    title: nextTitle,
    slug: duplicateSlug ? `${baseSlug}-${Date.now()}` : baseSlug,
    category: nextCategory,
    institution: nextInstitution,
    excerpt: nextExcerpt,
    content: nextContent,
    status: 'published',
    publishDate: nextPublishDate || current.publishDate,
    images: Array.isArray(req.body?.images) ? req.body.images : (current.images || []),
    videos: Array.isArray(req.body?.videos) ? req.body.videos : (current.videos || []),
    updatedAt: new Date().toISOString()
  };

  await invalidateNewsCache();
  return res.json({ news: adminStore.newsEvents[index] });
});

newsRouter.delete('/admin/:id', requireAuth, requireRole('admin', 'admissions'), async (req, res) => {
  const { id } = req.params;
  const index = adminStore.newsEvents.findIndex((item) => item.id === id);

  if (index === -1) {
    return res.status(404).json({ message: 'News item not found.' });
  }

  adminStore.newsEvents.splice(index, 1);
  await invalidateNewsCache();
  return res.status(204).send();
});

newsRouter.get('/:slugOrId', async (req, res) => {
  const key = String(req.params.slugOrId || '');
  const payload = await withCache(
    buildNewsItemCacheKey(key),
    async () => {
      const item = adminStore.newsEvents.find((entry) => entry.id === key || entry.slug === key);

      if (!item || String(item.status || 'published').trim().toLowerCase() !== 'published') {
        return null;
      }

      return { news: normalizeNewsItem(item) };
    },
    { ttlSeconds: NEWS_CACHE_TTL_SECONDS }
  );

  if (!payload) {
    return res.status(404).json({ message: 'News item not found.' });
  }

  res.setHeader('Cache-Control', `public, max-age=${NEWS_CACHE_TTL_SECONDS}, stale-while-revalidate=${NEWS_CACHE_TTL_SECONDS * 2}`);
  return res.json(payload);
});

export default newsRouter;
