import { env } from '../config/env.js';
import { withTransaction } from '../db/client.js';
import { addActivityLog } from '../data/adminStore.js';
import { findClassById, listClasses } from '../repositories/classRepository.js';
import { upsertStudentEnrollment } from '../repositories/studentEnrollmentRepository.js';
import { createStudent, deleteStudentById, updateStudent } from '../repositories/studentRepository.js';
import { createUser, deleteUserById, findUserByEmail, updateUserProfile } from '../repositories/userRepository.js';
import {
  deliverProvisioningCredentials,
  queueProvisioningCredentials,
  summarizeCredentialDelivery
} from './credentialDeliveryService.js';
import { generateTemporaryPassword, hashPassword } from '../utils/passwords.js';

const PORTAL_EMAIL_DOMAIN = 'portal.attaufiqschools.com';
const DEFAULT_ARM = 'A';

function normalizeString(value) {
  return String(value || '').trim();
}

function titleCaseWords(value) {
  const cleaned = normalizeString(value);
  if (!cleaned) return '';
  return cleaned
    .toLowerCase()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeClassName(value) {
  const raw = normalizeString(value);
  if (!raw) return '';
  const compact = raw.replace(/\s+/g, '').toUpperCase();
  const match = compact.match(/^(JSS|JS|JNR|JUNIOR|SS|SENIOR|SSS)(\d{1,2})$/);
  if (match) {
    const group = match[1];
    const num = match[2];
    if (group.startsWith('J')) return `JSS${num}`;
    return `SS${num}`;
  }
  return titleCaseWords(raw);
}

function normalizeEmail(value) {
  return normalizeString(value).toLowerCase();
}

function normalizeInstitutionKey(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  if (normalized.includes('madrasa') || normalized.includes('madrastul')) return 'madrasa';
  if (normalized.includes('memorization')) return 'memorization';
  return 'model';
}

function normalizeClassKey(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  return raw
    .replace(/\s+/g, '')
    .replace(/jss/g, 'js')
    .replace(/sss/g, 'ss');
}

function extractRegistrationPayload(payload = {}) {
  const studentPayload = payload && typeof payload.student === 'object' && payload.student ? payload.student : payload;
  const guardianPayload = payload && typeof payload.guardian === 'object' && payload.guardian ? payload.guardian : payload;

  return {
    fullName: titleCaseWords(studentPayload?.fullName),
    classId: normalizeString(studentPayload?.classId),
    level: normalizeString(studentPayload?.level),
    className: normalizeClassName(studentPayload?.className || studentPayload?.class),
    arm: normalizeString(studentPayload?.arm || ''),
    institution: normalizeString(studentPayload?.institution),
    studentEmail: normalizeEmail(
      studentPayload?.email
      || studentPayload?.studentEmail
      || payload?.studentEmail
    ),
    guardianName: titleCaseWords(
      guardianPayload?.fullName
      || guardianPayload?.guardianName
      || payload?.guardianName
    ),
    guardianPhone: normalizeString(
      guardianPayload?.phone
      || guardianPayload?.guardianPhone
      || payload?.guardianPhone
    ),
    guardianEmail: normalizeEmail(
      guardianPayload?.email
      || guardianPayload?.guardianEmail
      || payload?.guardianEmail
    )
  };
}

function slugify(value, fallback = 'user') {
  const normalized = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');

  return normalized || fallback;
}

function institutionAlias(institution) {
  const normalized = String(institution || '').toLowerCase();
  if (normalized.includes('memor')) return 'memorization';
  if (normalized.includes('madr')) return 'madrasa';
  return 'modern';
}

async function generatePortalEmail({ fullName, role, institution }, options = {}) {
  const base = `${slugify(fullName, role)}.${role}.${institutionAlias(institution)}`;

  for (let attempt = 0; attempt < 25; attempt += 1) {
    const suffix = attempt === 0 ? '' : `${100 + attempt}`;
    const candidate = `${base}${suffix}@${PORTAL_EMAIL_DOMAIN}`;
    const existing = await findUserByEmail(candidate, options);
    if (!existing) return candidate;
  }

  return `${role}.${Date.now()}@${PORTAL_EMAIL_DOMAIN}`;
}

async function provisionPortalAccount({
  role,
  fullName,
  institution,
  preferredEmail = '',
  allowExisting = false,
  temporaryPasswordOverride = ''
}, options = {}) {
  const normalizedEmail = normalizeEmail(preferredEmail);

  if (normalizedEmail) {
    const existing = await findUserByEmail(normalizedEmail, options);
    if (existing) {
      if (allowExisting && existing.role === role) {
        return { user: existing, temporaryPassword: '', reused: true };
      }
      throw new Error(`A ${existing.role} account already exists for ${normalizedEmail}.`);
    }
  }

  const email = normalizedEmail || await generatePortalEmail({ fullName, role, institution }, options);
  const temporaryPassword = temporaryPasswordOverride || generateTemporaryPassword();
  const user = await createUser({
    fullName: normalizeString(fullName),
    email,
    passwordHash: await hashPassword(temporaryPassword),
    role,
    mustChangePassword: true
  }, options);

  return { user, temporaryPassword, reused: false };
}

async function syncProvisionedUser(userId, { fullName, email }, options = {}) {
  if (!userId) return null;

  const normalizedEmail = normalizeEmail(email);
  if (normalizedEmail) {
    const existing = await findUserByEmail(normalizedEmail, options);
    if (existing && existing.id !== userId) {
      throw new Error(`Portal email ${normalizedEmail} is already assigned to another account.`);
    }
  }

  const updated = await updateUserProfile(userId, {
    fullName: fullName ? normalizeString(fullName) : undefined,
    email: normalizedEmail || undefined
  }, options);

  if (!updated) {
    throw new Error(`Linked portal account ${userId} no longer exists.`);
  }

  return updated;
}

function serializeCredential(result, label, options = {}) {
  if (!result?.user) return null;

  return {
    label,
    userId: result.user.id,
    fullName: options.fullName || result.user.fullName,
    recipientName: options.recipientName || result.user.fullName,
    recipientEmail: options.recipientEmail || '',
    role: result.user.role,
    email: result.user.email,
    password: result.temporaryPassword || '',
    mustChangePassword: Boolean(result.user.mustChangePassword),
    reused: Boolean(result.reused)
  };
}

async function rollbackProvisionedCredentials(credentials = []) {
  const seen = new Set();

  for (const credential of credentials) {
    if (!credential?.userId || credential.reused || !credential.password || seen.has(credential.userId)) continue;
    seen.add(credential.userId);
    await deleteUserById(credential.userId);
  }
}

function recordStudentRegistrationAuditEvent(action, storedStudent, credentials = [], context = {}) {
  if (!storedStudent?.id) return;

  addActivityLog({
    action,
    method: context.method || 'SYSTEM',
    path: context.path || '/internal/student-registration',
    actorRole: context.actorRole || 'system',
    actorEmail: context.actorEmail || 'system@local',
    statusCode: Number(
      context.statusCode
      || (action === 'student.registration.created' ? 201 : 200)
    ),
    ip: context.ip || 'internal',
    details: {
      studentId: storedStudent.id,
      classId: storedStudent.classId || '',
      institution: storedStudent.institution || '',
      userId: storedStudent.userId || '',
      parentUserId: storedStudent.parentUserId || '',
      accountStatus: storedStudent.accountStatus || 'pending',
      delivery: summarizeCredentialDelivery(credentials),
      credentials: credentials.map((credential) => ({
        label: credential.label,
        role: credential.role,
        email: credential.email,
        recipientEmail: credential.recipientEmail,
        emailDeliveryStatus: credential.emailDeliveryStatus || 'pending',
        emailDeliveryOutboxId: credential.emailDeliveryOutboxId || '',
        reused: Boolean(credential.reused)
      }))
    }
  });
}

async function provisionLinkedAccount({
  linkedUserId,
  role,
  fullName,
  institution,
  preferredEmail = '',
  allowExisting = false,
  temporaryPasswordOverride = ''
}, options = {}) {
  if (linkedUserId) {
    try {
      return {
        user: await syncProvisionedUser(linkedUserId, { fullName, email: preferredEmail }, options),
        temporaryPassword: '',
        reused: true
      };
    } catch (error) {
      if (!options.allowBrokenLinksRepair) throw error;
    }
  }

  return provisionPortalAccount({
    role,
    fullName,
    institution,
    preferredEmail,
    allowExisting,
    temporaryPasswordOverride
  }, options);
}

export async function resolveStudentRegistrationInput(payload) {
  const {
    fullName,
    classId,
    level,
    className,
    arm,
    institution,
    studentEmail,
    guardianName,
    guardianPhone,
    guardianEmail
  } = extractRegistrationPayload(payload);

  if (!fullName) {
    return { error: 'student.fullName is required.' };
  }

  if (env.mailEnabled) {
    if (!guardianName) {
      return { error: 'guardian.fullName is required so the parent portal can be assigned automatically.' };
    }

    if (!guardianEmail) {
      return { error: 'guardian.email is required so the parent portal can be delivered automatically.' };
    }
  }

  const preferredInstitution = institution || env.defaultInstitution;
  const resolvedArm = arm || DEFAULT_ARM;
  const resolvedClassName = className;
  const institutionKey = normalizeInstitutionKey(preferredInstitution);

  if (classId) {
    const classItem = await findClassById(classId);
    if (!classItem) {
      return { error: 'Invalid student.classId provided.' };
    }

    return {
      fullName,
      classId: classItem.id,
      level: `${classItem.name} ${classItem.arm}`,
      institution: classItem.institution,
      studentEmail,
      guardianName,
      guardianPhone,
      guardianEmail
    };
  }

  let resolvedClassId = '';
  if (resolvedClassName && resolvedArm) {
    const classes = await listClasses();
    const matched = classes.find((item) => {
      const classKey = normalizeClassKey(`${item.name}${item.arm}`);
      const targetKey = normalizeClassKey(`${resolvedClassName}${resolvedArm}`);
      if (classKey !== targetKey) return false;
      const itemKey = normalizeInstitutionKey(item.institution);
      return !institutionKey || itemKey === institutionKey;
    });
    if (matched?.id) {
      resolvedClassId = matched.id;
    }
  }

  const resolvedLevel = level || (resolvedClassName
    ? `${resolvedClassName} ${resolvedArm || DEFAULT_ARM}`
    : '');

  if (!resolvedLevel || !preferredInstitution) {
    return { error: 'Provide student.classId, or student.level/className and student.institution.' };
  }

  const normalizedStudentEmail = studentEmail || '';
  const fallbackEmail = normalizedStudentEmail
    ? normalizedStudentEmail
    : `${slugify(fullName, 'student')}@${env.studentEmailDomain}`;

  return {
    fullName,
    classId: resolvedClassId,
    level: resolvedClassId ? resolvedLevel : resolvedLevel,
    institution: preferredInstitution,
    studentEmail: fallbackEmail,
    guardianName,
    guardianPhone,
    guardianEmail
  };
}

export async function provisionStudentPortal(student, options = {}) {
  const passwordOverride = env.defaultPasswordMode === 'phone'
    ? normalizeString(student.guardianPhone || '')
    : '';
  const studentAccount = await provisionLinkedAccount({
    linkedUserId: student.userId,
    role: 'student',
    fullName: student.fullName,
    institution: student.institution,
    preferredEmail: student.studentEmail || student.portalEmail || '',
    temporaryPasswordOverride: passwordOverride
  }, options);

  const nextStudent = {
    ...student,
    userId: studentAccount.user?.id || '',
    portalEmail: studentAccount.user?.email || '',
    accountStatus: 'provisioned'
  };

  if (!nextStudent.guardianName || !nextStudent.guardianEmail) {
    return {
      student: nextStudent,
      credentials: [
        serializeCredential(studentAccount, 'Student portal', {
          fullName: nextStudent.fullName,
          recipientName: nextStudent.fullName,
          recipientEmail: nextStudent.studentEmail || nextStudent.guardianEmail || ''
        })
      ].filter(Boolean)
    };
  }

  const parentAccount = await provisionLinkedAccount({
    linkedUserId: nextStudent.parentUserId,
    role: 'parent',
    fullName: nextStudent.guardianName,
    institution: nextStudent.institution,
    preferredEmail: nextStudent.guardianEmail,
    allowExisting: true,
    temporaryPasswordOverride: passwordOverride
  }, options);

  return {
    student: {
      ...nextStudent,
      parentUserId: parentAccount.user?.id || '',
      parentPortalEmail: parentAccount.user?.email || nextStudent.guardianEmail || ''
    },
    credentials: [
      serializeCredential(studentAccount, 'Student portal', {
        fullName: nextStudent.fullName,
        recipientName: nextStudent.fullName,
        recipientEmail: nextStudent.studentEmail || nextStudent.guardianEmail || ''
      }),
      serializeCredential(parentAccount, 'Parent portal', {
        fullName: nextStudent.guardianName,
        recipientName: nextStudent.guardianName,
        recipientEmail: nextStudent.guardianEmail || ''
      })
    ].filter(Boolean)
  };
}

export async function createProvisionedStudentRecord(student, options = {}) {
  if (!student?.id) {
    throw new Error('Student id is required before registration can be completed.');
  }

  const inlineDeliverFn = typeof options.deliverFn === 'function'
    ? options.deliverFn
    : deliverProvisioningCredentials;
  const serviceOptions = { allowBrokenLinksRepair: Boolean(options.allowBrokenLinksRepair) };

  if (!env.useDatabase) {
    let provisioned = null;
    let storedStudent = null;

    try {
      provisioned = await provisionStudentPortal(student, serviceOptions);
      storedStudent = await createStudent(provisioned.student);
      await upsertStudentEnrollment({ studentId: storedStudent.id, classId: storedStudent.classId });
      const deliveredCredentials = await inlineDeliverFn(provisioned.credentials, storedStudent.institution);
      const result = { provisioned, storedStudent, deliveredCredentials };
      recordStudentRegistrationAuditEvent(
        'student.registration.created',
        storedStudent,
        deliveredCredentials,
        options.auditContext
      );
      return result;
    } catch (error) {
      if (storedStudent?.id) {
        await deleteStudentById(storedStudent.id);
      }
      await rollbackProvisionedCredentials(provisioned?.credentials || []);
      throw error;
    }
  }

  return withTransaction(async (executor) => {
    const executorOptions = { ...serviceOptions, executor };
    const provisioned = await provisionStudentPortal(student, executorOptions);
    const storedStudent = await createStudent(provisioned.student, { executor });
    await upsertStudentEnrollment({ studentId: storedStudent.id, classId: storedStudent.classId }, { executor });
    const deliveredCredentials = await queueProvisioningCredentials(provisioned.credentials, storedStudent.institution, {
      executor,
      forceInlineDelivery: Boolean(options.forceInlineDelivery)
    });
    return { provisioned, storedStudent, deliveredCredentials };
  }).then((result) => {
    recordStudentRegistrationAuditEvent(
      'student.registration.created',
      result.storedStudent,
      result.deliveredCredentials,
      options.auditContext
    );
    return result;
  });
}

export async function updateProvisionedStudentRecord(currentStudent, normalized, options = {}) {
  const inlineDeliverFn = typeof options.deliverFn === 'function'
    ? options.deliverFn
    : deliverProvisioningCredentials;
  const serviceOptions = { allowBrokenLinksRepair: Boolean(options.allowBrokenLinksRepair) };
  const shouldReactivate = currentStudent.accountStatus === 'graduated'
    && normalized.classId
    && normalized.classId !== currentStudent.classId;

  const nextStudent = {
    ...currentStudent,
    id: currentStudent.id,
    ...normalized,
    portalEmail: normalized.studentEmail || currentStudent.portalEmail || '',
    parentPortalEmail: normalized.guardianEmail || currentStudent.parentPortalEmail || '',
    accountStatus: shouldReactivate ? 'active' : currentStudent.accountStatus
  };

  if (!env.useDatabase) {
    let provisioned = null;

    try {
      provisioned = await provisionStudentPortal(nextStudent, serviceOptions);
      const storedStudent = await updateStudent(currentStudent.id, provisioned.student);
      await upsertStudentEnrollment({
        studentId: storedStudent.id,
        classId: storedStudent.classId,
        promotedFromClass: currentStudent.classId && currentStudent.classId !== storedStudent.classId ? currentStudent.classId : ''
      });
      const deliveredCredentials = await inlineDeliverFn(provisioned.credentials, storedStudent.institution);
      const result = { provisioned, storedStudent, deliveredCredentials };
      recordStudentRegistrationAuditEvent(
        'student.registration.updated',
        storedStudent,
        deliveredCredentials,
        options.auditContext
      );
      return result;
    } catch (error) {
      await updateStudent(currentStudent.id, currentStudent);
      await rollbackProvisionedCredentials(provisioned?.credentials || []);
      throw error;
    }
  }

  return withTransaction(async (executor) => {
    const executorOptions = { ...serviceOptions, executor };
    const provisioned = await provisionStudentPortal(nextStudent, executorOptions);
    const storedStudent = await updateStudent(currentStudent.id, provisioned.student, { executor });
    await upsertStudentEnrollment({
      studentId: storedStudent.id,
      classId: storedStudent.classId,
      promotedFromClass: currentStudent.classId && currentStudent.classId !== storedStudent.classId ? currentStudent.classId : ''
    }, { executor });
    const deliveredCredentials = await queueProvisioningCredentials(provisioned.credentials, storedStudent.institution, {
      executor,
      forceInlineDelivery: Boolean(options.forceInlineDelivery)
    });
    return { provisioned, storedStudent, deliveredCredentials };
  }).then((result) => {
    recordStudentRegistrationAuditEvent(
      'student.registration.updated',
      result.storedStudent,
      result.deliveredCredentials,
      options.auditContext
    );
    return result;
  });
}
