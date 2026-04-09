import { institutionEquals } from './institution.js';

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeLowerText(value) {
  return normalizeText(value).toLowerCase();
}

export function normalizeStudentAccountStatus(value) {
  const normalized = normalizeLowerText(value);
  if (['provisioned', 'active', 'inactive', 'graduated', 'pending'].includes(normalized)) {
    return normalized;
  }
  return 'pending';
}

export function hasProvisionedStudentPortal(student) {
  return Boolean(
    normalizeText(student?.userId)
    && normalizeText(student?.portalEmail)
  );
}

export function isCountableActiveStudent(student) {
  const status = normalizeStudentAccountStatus(student?.accountStatus);
  if (!hasProvisionedStudentPortal(student)) return false;
  return status === 'provisioned' || status === 'active' || status === 'pending';
}

export function buildCountableActiveStudentIdSet(students = [], institution = '') {
  return new Set(
    (students || [])
      .filter((student) => (!institution || institutionEquals(student.institution, institution)))
      .filter((student) => isCountableActiveStudent(student))
      .map((student) => student.id)
  );
}

export function filterCountableActiveStudents(students = [], institution = '') {
  return (students || [])
    .filter((student) => (!institution || institutionEquals(student.institution, institution)))
    .filter((student) => isCountableActiveStudent(student));
}

export function countFullyAdmittedStudents(students = [], institution = '') {
  return filterCountableActiveStudents(students, institution).length;
}

export function findMatchingStudentForAdmission(admission, students = []) {
  if (!admission) return null;

  const promotedStudentId = normalizeText(admission.promotedStudentId);
  if (promotedStudentId) {
    const byId = (students || []).find((student) => student.id === promotedStudentId);
    if (byId) return byId;
  }

  const admissionStudentEmail = normalizeLowerText(admission.studentEmail);
  const admissionFullName = normalizeLowerText(admission.fullName);
  const admissionClassId = normalizeText(admission.classId);
  const admissionInstitution = normalizeText(admission.institution);

  if (admissionStudentEmail) {
    const directEmailMatches = (students || []).filter((student) => (
      normalizeLowerText(student.studentEmail) === admissionStudentEmail
      || normalizeLowerText(student.portalEmail) === admissionStudentEmail
    ));

    if (directEmailMatches.length === 1) {
      return directEmailMatches[0];
    }

    const scopedEmailMatches = directEmailMatches.filter((student) => (
      (!admissionInstitution || institutionEquals(student.institution, admissionInstitution))
      && (!admissionClassId || normalizeText(student.classId) === admissionClassId)
    ));

    if (scopedEmailMatches.length === 1) {
      return scopedEmailMatches[0];
    }
  }

  if (!admissionFullName) return null;

  const identityMatches = (students || []).filter((student) => (
    normalizeLowerText(student.fullName) === admissionFullName
    && (!admissionInstitution || institutionEquals(student.institution, admissionInstitution))
    && (!admissionClassId || normalizeText(student.classId) === admissionClassId)
  ));

  return identityMatches.length === 1 ? identityMatches[0] : null;
}
