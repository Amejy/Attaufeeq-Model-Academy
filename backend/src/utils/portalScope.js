import { adminStore } from '../data/adminStore.js';
import { normalizeInstitution } from './institution.js';

const BASE_FEATURES = ['overview', 'timetable', 'attendance', 'notifications', 'messages'];
const INSTITUTION_FEATURES = {
  'ATTAUFEEQ Model Academy': ['results', 'fees', 'library'],
  'Madrastul ATTAUFEEQ': ['results', 'fees', 'madrasa'],
  'Quran Memorization Academy': ['results', 'fees', 'madrasa']
};

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function isLeadTeacherAssignment(assignment) {
  const role = normalize(assignment?.assignmentRole);
  if (!role) return false;
  return role === 'lead teacher' || role === 'class teacher' || role === 'form teacher' || role.includes('lead');
}

function buildClassLabel(classId, fallback = '') {
  const classItem = adminStore.classes.find((item) => item.id === classId);
  return classItem ? `${classItem.name} ${classItem.arm}` : fallback;
}

function getActiveSessionId() {
  const sessions = adminStore.academicSessions || [];
  const active = sessions.find((session) => session.isActive) || sessions[0];
  return active?.id || '';
}

function resolveEnrollmentClassId(studentId, sessionId) {
  if (!studentId || !sessionId) return '';
  const enrollment = (adminStore.studentEnrollments || []).find(
    (entry) => entry.studentId === studentId && entry.sessionId === sessionId
  );
  return enrollment?.classId || '';
}

function enrichStudent(student) {
  if (!student) return null;

  const activeSessionId = getActiveSessionId();
  const enrolledClassId = resolveEnrollmentClassId(student.id, activeSessionId);
  const classId = enrolledClassId || student.classId;
  const classItem = adminStore.classes.find((item) => item.id === classId);

  return {
    ...student,
    classId,
    classLabel: buildClassLabel(classId, student.level || ''),
    institution: student.institution || classItem?.institution || ''
  };
}

export function findClassLead(classId = '') {
  if (!classId) return null;

  const assignments = adminStore.teacherAssignments.filter((item) => item.classId === classId);
  if (!assignments.length) return null;

  const preferred = assignments.find((item) => isLeadTeacherAssignment(item));

  if (!preferred) return null;

  const teacher = adminStore.teachers.find((item) => item.id === preferred.teacherId);
  if (!teacher) return null;

  return {
    id: teacher.id,
    fullName: teacher.fullName,
    email: teacher.email || teacher.portalEmail || '',
    institution: teacher.institution || '',
    assignmentRole: preferred.assignmentRole || 'Subject Teacher',
    note: preferred.note || ''
  };
}

export function findTeacherByUser(user) {
  const email = normalize(user?.email);
  const userId = String(user?.sub || '');

  return (
    adminStore.teachers.find((teacher) => teacher.userId === userId) ||
    adminStore.teachers.find((teacher) => normalize(teacher.portalEmail) === email) ||
    adminStore.teachers.find((teacher) => normalize(teacher.email) === email) ||
    null
  );
}

export function findStudentByUser(user) {
  const email = normalize(user?.email);
  const userId = String(user?.sub || '');

  const byUserId = adminStore.students.find((student) => student.userId === userId);
  if (byUserId) return enrichStudent(byUserId);
  if (!email) return null;

  const matches = adminStore.students.filter(
    (student) => normalize(student.portalEmail || student.studentEmail) === email
  );

  if (matches.length !== 1) return null;
  return enrichStudent(matches[0]);
}

export function findChildrenForParent(user) {
  const email = normalize(user?.email);
  const userId = String(user?.sub || '');

  return adminStore.students
    .filter((student) => {
      if (student.parentUserId && student.parentUserId === userId) return true;
      if (email && normalize(student.parentPortalEmail || student.guardianEmail) === email) return true;
      return false;
    })
    .map(enrichStudent)
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

export function findChildForParent(user, childId = '') {
  const children = findChildrenForParent(user);
  if (!children.length) return null;
  if (childId) {
    return children.find((child) => child.id === childId) || null;
  }
  return children[0];
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function featuresFromInstitutions(institutions = []) {
  const normalizedInstitutions = unique(
    institutions.map((institution) => normalizeInstitution(institution)).filter(Boolean)
  );
  return unique([
    ...BASE_FEATURES,
    ...normalizedInstitutions.flatMap((institution) => INSTITUTION_FEATURES[institution] || [])
  ]);
}

export function buildUserScope(user) {
  if (!user?.role) {
    return {
      role: '',
      institutions: [],
      institutionLabel: '',
      features: []
    };
  }

  if (user.role === 'admin') {
    return {
      role: 'admin',
      institutions: ['ATTAUFEEQ Model Academy', 'Madrastul ATTAUFEEQ', 'Quran Memorization Academy'],
      institutionLabel: 'All Institutions',
      features: ['all']
    };
  }

  if (user.role === 'admissions') {
    return {
      role: 'admissions',
      institutions: ['ATTAUFEEQ Model Academy', 'Madrastul ATTAUFEEQ', 'Quran Memorization Academy'],
      institutionLabel: 'Admissions Desk',
      features: ['overview', 'admissions', 'students', 'fees', 'library', 'news', 'messages', 'result-tokens']
    };
  }

  if (user.role === 'teacher') {
    const teacher = findTeacherByUser(user);
    const institutions = unique([teacher?.institution || '']);
    const normalizedInstitution = String(teacher?.institution || '').toLowerCase();
    const isIslamicTrack = normalizedInstitution.includes('madrastul')
      || normalizedInstitution.includes('quran');
    const teacherFeatures = unique([
      'overview',
      'attendance',
      'timetable',
      'notifications',
      'messages',
      'results',
      ...(isIslamicTrack ? ['madrasa'] : [])
    ]);

    return {
      role: 'teacher',
      institutions,
      institutionLabel: institutions[0] || '',
      features: teacherFeatures,
      profile: teacher
    };
  }

  if (user.role === 'student') {
    const student = findStudentByUser(user);
    const institutions = unique([normalizeInstitution(student?.institution || '')]);

    return {
      role: 'student',
      institutions,
      institutionLabel: institutions[0] || '',
      features: featuresFromInstitutions(institutions),
      profile: student
    };
  }

  if (user.role === 'parent') {
    const children = findChildrenForParent(user);
    const institutions = unique(children.map((child) => normalizeInstitution(child.institution)));

    return {
      role: 'parent',
      institutions,
      institutionLabel:
        institutions.length <= 1
          ? institutions[0] || ''
          : `${institutions.length} institution scopes`,
      features: featuresFromInstitutions(institutions),
      profile: {
        children,
        linkedChildrenCount: children.length
      }
    };
  }

  return {
    role: user.role,
    institutions: [],
    institutionLabel: '',
    features: BASE_FEATURES
  };
}
