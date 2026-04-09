import {
  findChildrenForParent,
  findStudentByUser,
  findTeacherByUser
} from './portalScope.js';

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase();
}

export function resolvePortalAccessState(user) {
  if (!user?.role) {
    return { allowed: false, message: 'User role is missing.' };
  }

  if (user.role === 'admin' || user.role === 'admissions') {
    return { allowed: true };
  }

  if (user.role === 'teacher') {
    const teacher = findTeacherByUser(user);
    if (!teacher) {
      return {
        allowed: false,
        message: 'Your teacher portal account is not linked to an active staff record yet.'
      };
    }
    return { allowed: true, profile: teacher };
  }

  if (user.role === 'student') {
    const student = findStudentByUser(user);
    if (!student) {
      return {
        allowed: false,
        message: 'Your student portal account is not linked to a student record yet.'
      };
    }

    if (normalizeStatus(student.accountStatus) === 'inactive') {
      return {
        allowed: false,
        message: 'This student portal account is currently inactive. Contact school administration.'
      };
    }

    return { allowed: true, profile: student };
  }

  if (user.role === 'parent') {
    const children = findChildrenForParent(user);
    if (!children.length) {
      return {
        allowed: false,
        message: 'Your parent portal account is not linked to any student records yet.'
      };
    }

    return { allowed: true, profile: { children } };
  }

  return { allowed: true };
}
