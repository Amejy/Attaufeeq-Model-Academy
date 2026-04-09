import { Router } from 'express';
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { adminStore, makeId } from '../data/adminStore.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { withCache } from '../services/cacheService.js';
import { buildAdmissionPeriodResponse, isProgramOpen } from '../utils/admissionPeriod.js';
import { privateUpload, saveUploadedFile } from './upload.js';

const admissionsRouter = Router();
const ADMISSIONS_CACHE_TTL_SECONDS = 60;
const PROGRAMS = {
  modern: {
    label: 'ATTAUFEEQ Model Academy',
    institution: 'ATTAUFEEQ Model Academy',
    requiresClass: true
  },
  madrasa: {
    label: 'Madrasa Program',
    institution: 'Madrastul ATTAUFEEQ',
    requiresClass: true
  },
  memorization: {
    label: 'Quran Memorization Program',
    institution: 'Quran Memorization Academy',
    requiresClass: true
  }
};

admissionsRouter.get('/period', async (_req, res) => {
  const payload = await withCache(
    'admissions:period',
    async () => ({
      admissionPeriod: {
        ...buildAdmissionPeriodResponse(adminStore.admissionPeriod),
        guardianEmailRequired: env.mailEnabled
      }
    }),
    { ttlSeconds: ADMISSIONS_CACHE_TTL_SECONDS }
  );
  res.setHeader('Cache-Control', `public, max-age=${ADMISSIONS_CACHE_TTL_SECONDS}, stale-while-revalidate=${ADMISSIONS_CACHE_TTL_SECONDS * 2}`);
  return res.json(payload);
});

function buildAdmissionsOptionsCacheKey(programKey) {
  return `admissions:options:program=${programKey || 'all'}`;
}

admissionsRouter.get('/options', async (req, res) => {
  const programKey = String(req.query.program || '').trim().toLowerCase();
  const programMeta = PROGRAMS[programKey];

  const payload = await withCache(
    buildAdmissionsOptionsCacheKey(programKey),
    async () => ({
      classes: adminStore.classes
        .filter((item) => {
          if (!programMeta) return true;
          if (!programMeta.requiresClass) return false;
          return item.institution === programMeta.institution;
        })
        .map((item) => ({
          id: item.id,
          name: item.name,
          arm: item.arm,
          institution: item.institution,
          label: `${item.name} ${item.arm} - ${item.institution}`
        }))
    }),
    { ttlSeconds: ADMISSIONS_CACHE_TTL_SECONDS }
  );
  res.setHeader('Cache-Control', `public, max-age=${ADMISSIONS_CACHE_TTL_SECONDS}, stale-while-revalidate=${ADMISSIONS_CACHE_TTL_SECONDS * 2}`);
  return res.json(payload);
});

admissionsRouter.post('/upload', privateUpload.array('files', 10), async (req, res) => {
  const files = Array.isArray(req.files) ? req.files : [];
  const uploaded = [];

  if (!files.length) {
    return res.status(400).json({ message: 'No files uploaded.' });
  }

  try {
    for (const file of files) {
      const saved = await saveUploadedFile(file, {
        visibility: 'private',
        allowedMimes: [
          'application/pdf',
          'image/jpeg',
          'image/png',
          'image/webp',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ]
      });
      uploaded.push({
        name: file.originalname,
        type: saved.mime,
        size: saved.size,
        url: `/api/uploads/private/${saved.id}`
      });
    }
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Upload failed.' });
  }

  return res.status(201).json({
    files: uploaded
  });
});

admissionsRouter.post('/', (req, res) => {
  const {
    program = 'modern',
    fullName,
    guardianName,
    phone,
    email,
    studentEmail,
    classId,
    documents,
    dateOfBirth,
    gender,
    previousSchool,
    address,
    age,
    quranLevel,
    memorizationLevel,
    previousMadrasa
  } = req.body || {};

  const normalizedStudentEmail = String(studentEmail || '').trim().toLowerCase();
  const normalizedFullName = String(fullName || '').trim().toLowerCase();
  const normalizedGuardianName = String(guardianName || '').trim().toLowerCase();
  const normalizedPhone = String(phone || '').trim().replace(/\s+/g, '');
  const normalizedGuardianEmail = String(email || '').trim();
  const normalizedClassId = String(classId || '').trim();
  const normalizedDateOfBirth = String(dateOfBirth || '').trim();
  const normalizedGender = String(gender || '').trim();
  const normalizedPreviousSchool = String(previousSchool || '').trim();
  const normalizedAddress = String(address || '').trim();
  const normalizedAge = String(age || '').trim();
  const normalizedQuranLevel = String(quranLevel || '').trim();
  const normalizedMemorizationLevel = String(memorizationLevel || '').trim();
  const normalizedPreviousMadrasa = String(previousMadrasa || '').trim();

  const programKey = String(program || '').trim().toLowerCase();
  const programMeta = PROGRAMS[programKey];

  if (!programMeta) {
    return res.status(400).json({ message: 'Invalid program selected.' });
  }

  if (!isProgramOpen(adminStore.admissionPeriod, programKey)) {
    return res.status(403).json({
      message: 'Admissions are currently closed for the selected program.',
      admissionPeriod: buildAdmissionPeriodResponse(adminStore.admissionPeriod)
    });
  }

  if (!normalizedFullName || !normalizedGuardianName || !normalizedPhone) {
    return res.status(400).json({
      message: 'fullName, guardianName, and phone are required.'
    });
  }

  if (!normalizedStudentEmail) {
    return res.status(400).json({
      message: 'studentEmail is required so the student can receive portal access.'
    });
  }

  if (env.mailEnabled && !normalizedGuardianEmail) {
    return res.status(400).json({
      message: 'A guardian email address is required so portal access can be delivered automatically after approval.'
    });
  }

  const duplicate = adminStore.admissions.find((item) => {
    const existingStudentEmail = String(item.studentEmail || '').trim().toLowerCase();
    if (existingStudentEmail && existingStudentEmail === normalizedStudentEmail) return true;

    const existingFullName = String(item.fullName || '').trim().toLowerCase();
    const existingGuardianName = String(item.guardianName || '').trim().toLowerCase();
    const existingPhone = String(item.phone || '').trim().replace(/\s+/g, '');
    const existingProgram = String(item.program || '').trim().toLowerCase();
    const existingClassId = String(item.classId || '').trim();

    return (
      existingProgram === programKey &&
      existingClassId === normalizedClassId &&
      existingFullName === normalizedFullName &&
      existingGuardianName === normalizedGuardianName &&
      existingPhone === normalizedPhone
    );
  });

  if (duplicate) {
    return res.status(200).json({
      message: 'Application already submitted.',
      admission: duplicate,
      duplicate: true
    });
  }

  let classItem = null;
  if (programMeta.requiresClass) {
    if (!normalizedClassId) {
      return res.status(400).json({ message: 'classId is required for the selected program.' });
    }

    classItem = adminStore.classes.find((item) => item.id === normalizedClassId);
    if (!classItem || classItem.institution !== programMeta.institution) {
      return res.status(400).json({ message: 'Invalid classId provided for the selected program.' });
    }
  }

  if (programKey === 'modern') {
    if (!normalizedDateOfBirth || !normalizedGender || !normalizedPreviousSchool || !normalizedAddress) {
      return res.status(400).json({
        message: 'dateOfBirth, gender, previousSchool, and address are required for ATTAUFEEQ Model Academy applications.'
      });
    }
  }

  if (programKey === 'madrasa' || programKey === 'memorization') {
    if (!normalizedAge || !normalizedQuranLevel || !normalizedMemorizationLevel || !normalizedAddress) {
      return res.status(400).json({
        message: 'age, quranLevel, memorizationLevel, and address are required for Islamic program applications.'
      });
    }
  }

  const admission = {
    id: makeId('adm'),
    trackingCode: crypto.randomUUID(),
    program: programKey,
    fullName: String(fullName || '').trim(),
    guardianName: String(guardianName || '').trim(),
    phone: String(phone || '').trim(),
    email: normalizedGuardianEmail,
    studentEmail: normalizedStudentEmail,
    classId: classItem?.id || '',
    level: classItem ? `${classItem.name} ${classItem.arm}` : programMeta.label,
    institution: classItem?.institution || programMeta.institution,
    dateOfBirth: normalizedDateOfBirth,
    gender: normalizedGender,
    previousSchool: normalizedPreviousSchool,
    address: normalizedAddress,
    age: normalizedAge,
    quranLevel: normalizedQuranLevel,
    memorizationLevel: normalizedMemorizationLevel,
    previousMadrasa: normalizedPreviousMadrasa,
    status: 'pending',
    verificationStatus: 'pending',
    paymentStatus: 'pending',
    paymentConfirmedAt: '',
    interviewDate: '',
    interviewMode: '',
    offerStatus: 'none',
    offerLetterRef: '',
    documents: Array.isArray(documents)
      ? documents.filter(Boolean).map((document) => {
        if (typeof document === 'string') {
          return { name: document };
        }
        return {
          name: document.name || 'Document',
          type: document.type || '',
          size: Number(document.size || 0),
          url: document.url || ''
        };
      })
      : [],
    submittedAt: new Date().toISOString()
  };

  adminStore.admissions.unshift(admission);

  return res.status(201).json({
    message: 'Application submitted successfully.',
    admission
  });
});

admissionsRouter.get('/status/:trackingCode', (req, res) => {
  const { trackingCode } = req.params;
  const admission = adminStore.admissions.find((item) => item.trackingCode === trackingCode);

  if (!admission) {
    return res.status(404).json({ message: 'Application not found.' });
  }

  return res.json({
    status: admission.status,
    submittedAt: admission.submittedAt,
    program: admission.program,
    institution: admission.institution
  });
});

admissionsRouter.get('/:id', requireAuth, requireRole('admin', 'admissions'), (req, res) => {
  const { id } = req.params;
  const admission = adminStore.admissions.find((item) => item.id === id);

  if (!admission) {
    return res.status(404).json({ message: 'Application not found.' });
  }

  return res.json({ admission });
});

export default admissionsRouter;
