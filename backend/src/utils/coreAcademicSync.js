import { adminStore, saveStoreToDatabase } from '../data/adminStore.js';
import { listAcademicSessions, upsertManyAcademicSessions } from '../repositories/academicSessionRepository.js';
import { listClasses, upsertManyClasses } from '../repositories/classRepository.js';
import { listResults, upsertManyResults } from '../repositories/resultRepository.js';
import { listStudentEnrollments, upsertManyStudentEnrollments } from '../repositories/studentEnrollmentRepository.js';
import { listStudents } from '../repositories/studentRepository.js';
import { listSubjects, upsertManySubjects } from '../repositories/subjectRepository.js';
import { listTeacherAssignments, upsertManyTeacherAssignments } from '../repositories/teacherAssignmentRepository.js';
import { listTeachers, upsertManyTeachers } from '../repositories/teacherRepository.js';
import { findUsersByIds } from '../repositories/userRepository.js';
import {
  createProvisionedStudentRecord,
  updateProvisionedStudentRecord
} from '../services/studentRegistrationService.js';

function hasSeedData() {
  return (
    (adminStore.academicSessions || []).length ||
    adminStore.classes.length ||
    adminStore.students.length ||
    (adminStore.studentEnrollments || []).length ||
    adminStore.subjects.length ||
    adminStore.teachers.length ||
    adminStore.teacherAssignments.length ||
    adminStore.results.length
  );
}

function sanitizeStudentsForSync(students = [], classes = []) {
  const validClassIds = new Set((classes || []).map((item) => item.id));
  return students.map((student) => {
    const classId = String(student?.classId || '').trim();
    if (!classId || validClassIds.has(classId)) return student;
    return {
      ...student,
      classId: ''
    };
  });
}

function normalizeStudentSeedRecord(student = {}) {
  return {
    id: String(student.id || '').trim(),
    fullName: String(student.fullName || '').trim(),
    classId: String(student.classId || '').trim(),
    level: String(student.level || '').trim(),
    institution: String(student.institution || '').trim(),
    studentEmail: String(student.studentEmail || '').trim().toLowerCase(),
    guardianName: String(student.guardianName || '').trim(),
    guardianPhone: String(student.guardianPhone || '').trim(),
    guardianEmail: String(student.guardianEmail || '').trim().toLowerCase(),
    userId: String(student.userId || '').trim(),
    portalEmail: String(student.portalEmail || '').trim().toLowerCase(),
    parentUserId: String(student.parentUserId || '').trim(),
    parentPortalEmail: String(student.parentPortalEmail || '').trim().toLowerCase(),
    accountStatus: String(student.accountStatus || 'pending').trim() || 'pending'
  };
}

async function seedStudentsIntoDatabase(students = []) {
  for (const student of students) {
    const normalized = normalizeStudentSeedRecord(student);
    if (!normalized.id || !normalized.fullName || !normalized.level || !normalized.institution) continue;

    await createProvisionedStudentRecord(normalized, {
      allowBrokenLinksRepair: true
    });
  }
}

async function repairExistingStudentUserLinks(students = []) {
  for (const student of students) {
    const needsRepair = !String(student?.userId || '').trim() || !String(student?.portalEmail || '').trim();
    if (!needsRepair) continue;

    await updateProvisionedStudentRecord(student, normalizeStudentSeedRecord(student), {
      allowBrokenLinksRepair: true
    });
  }
}

async function sanitizeTeachersForSync(teachers = []) {
  const userIds = [...new Set(teachers.map((teacher) => String(teacher?.userId || '').trim()).filter(Boolean))];
  if (!userIds.length) return teachers;

  const users = await findUsersByIds(userIds);
  const validUserIds = new Set(users.map((user) => user.id));

  return teachers.map((teacher) => {
    const userId = String(teacher?.userId || '').trim();
    if (!userId || validUserIds.has(userId)) return teacher;
    return {
      ...teacher,
      userId: '',
      portalEmail: ''
    };
  });
}

function sanitizeEnrollmentsForSync(enrollments = [], { sessions = [], classes = [], students = [] } = {}) {
  const validSessionIds = new Set((sessions || []).map((item) => item.id));
  const validClassIds = new Set((classes || []).map((item) => item.id));
  const validStudentIds = new Set((students || []).map((item) => item.id));

  return enrollments.filter((enrollment) => (
    validSessionIds.has(String(enrollment?.sessionId || '').trim())
    && validClassIds.has(String(enrollment?.classId || '').trim())
    && validStudentIds.has(String(enrollment?.studentId || '').trim())
  ));
}

function sanitizeTeacherAssignmentsForSync(assignments = [], { teachers = [], classes = [], subjects = [] } = {}) {
  const validTeacherIds = new Set((teachers || []).map((item) => item.id));
  const validClassIds = new Set((classes || []).map((item) => item.id));
  const validSubjectIds = new Set((subjects || []).map((item) => item.id));

  return assignments.filter((assignment) => (
    validTeacherIds.has(String(assignment?.teacherId || '').trim())
    && validClassIds.has(String(assignment?.classId || '').trim())
    && validSubjectIds.has(String(assignment?.subjectId || '').trim())
  ));
}

function sanitizeResultsForSync(results = [], { students = [], classes = [], subjects = [], sessions = [] } = {}) {
  const validStudentIds = new Set((students || []).map((item) => item.id));
  const validClassIds = new Set((classes || []).map((item) => item.id));
  const validSubjectIds = new Set((subjects || []).map((item) => item.id));
  const validSessionIds = new Set((sessions || []).map((item) => item.id));

  return results
    .filter((result) => (
      validStudentIds.has(String(result?.studentId || '').trim())
      && validClassIds.has(String(result?.classId || '').trim())
      && validSubjectIds.has(String(result?.subjectId || '').trim())
    ))
    .map((result) => {
      const sessionId = String(result?.sessionId || '').trim();
      if (!sessionId || validSessionIds.has(sessionId)) return result;
      return {
        ...result,
        sessionId: ''
      };
    });
}

export async function syncCoreAcademicStore() {
  let [
    dbSessions,
    dbEnrollments,
    dbClasses,
    dbStudents,
    dbSubjects,
    dbTeachers,
    dbAssignments,
    dbResults
  ] = await Promise.all([
    listAcademicSessions(),
    listStudentEnrollments(),
    listClasses(),
    listStudents(),
    listSubjects(),
    listTeachers(),
    listTeacherAssignments(),
    listResults()
  ]);

  if (!dbSessions.length && (adminStore.academicSessions || []).length) {
    await upsertManyAcademicSessions(adminStore.academicSessions || []);
    dbSessions = await listAcademicSessions();
  }
  if (!dbClasses.length && adminStore.classes.length) {
    await upsertManyClasses(adminStore.classes);
    dbClasses = await listClasses();
  }
  if (!dbSubjects.length && adminStore.subjects.length) {
    await upsertManySubjects(adminStore.subjects);
  }
  if (!dbStudents.length && adminStore.students.length) {
    await seedStudentsIntoDatabase(sanitizeStudentsForSync(adminStore.students, dbClasses));
    dbStudents = await listStudents();
  }
  if (dbStudents.some((student) => !String(student?.userId || '').trim() || !String(student?.portalEmail || '').trim())) {
    await repairExistingStudentUserLinks(dbStudents);
    dbStudents = await listStudents();
  }
  if (!dbEnrollments.length && (adminStore.studentEnrollments || []).length) {
    await upsertManyStudentEnrollments(sanitizeEnrollmentsForSync(adminStore.studentEnrollments || [], {
      sessions: dbSessions,
      classes: dbClasses,
      students: dbStudents
    }));
  }
  if (!dbTeachers.length && adminStore.teachers.length) {
    await upsertManyTeachers(await sanitizeTeachersForSync(adminStore.teachers));
    dbTeachers = await listTeachers();
  }
  if (!dbAssignments.length && adminStore.teacherAssignments.length) {
    await upsertManyTeacherAssignments(sanitizeTeacherAssignmentsForSync(adminStore.teacherAssignments, {
      teachers: dbTeachers,
      classes: dbClasses,
      subjects: dbSubjects
    }));
    dbAssignments = await listTeacherAssignments();
  }
  if (!dbResults.length && adminStore.results.length) {
    await upsertManyResults(sanitizeResultsForSync(adminStore.results, {
      students: dbStudents,
      classes: dbClasses,
      subjects: dbSubjects,
      sessions: dbSessions
    }));
  }

  if (hasSeedData()) {
    [dbSessions, dbEnrollments, dbClasses, dbStudents, dbSubjects, dbTeachers, dbAssignments, dbResults] = await Promise.all([
      listAcademicSessions(),
      listStudentEnrollments(),
      listClasses(),
      listStudents(),
      listSubjects(),
      listTeachers(),
      listTeacherAssignments(),
      listResults()
    ]);
  }

  adminStore.academicSessions = dbSessions;
  adminStore.classes = dbClasses;
  adminStore.students = dbStudents;
  adminStore.studentEnrollments = dbEnrollments;
  adminStore.subjects = dbSubjects;
  adminStore.teachers = dbTeachers;
  adminStore.teacherAssignments = dbAssignments;
  adminStore.results = dbResults;
  await saveStoreToDatabase();
}
