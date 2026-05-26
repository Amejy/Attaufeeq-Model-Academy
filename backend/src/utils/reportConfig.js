function cleanText(value = '') {
  return String(value || '').trim();
}

function cleanImageUrl(value = '') {
  return cleanText(value);
}

function cleanCount(value) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.round(parsed));
}

function cleanBehaviorGrade(value = '') {
  const normalized = cleanText(value).toUpperCase();
  return ['A', 'B', 'C', 'D'].includes(normalized) ? normalized : '';
}

export function normalizeReportSettings(settings = {}) {
  return {
    headName: cleanText(settings.headName),
    headTitle: cleanText(settings.headTitle) || 'Head Teacher',
    signatureImage: cleanImageUrl(settings.signatureImage),
    parentAcknowledgementText: cleanText(settings.parentAcknowledgementText) || 'I have received and read this report.',
    footerNote: cleanText(settings.footerNote)
  };
}

export function normalizeReportOverride(value = {}) {
  const totalSchoolDays = cleanCount(value.totalSchoolDays);
  const daysPresent = cleanCount(value.daysPresent);
  const daysAbsent = cleanCount(value.daysAbsent);
  const lateComing = cleanCount(value.lateComing);
  const attendanceRate = totalSchoolDays && daysPresent !== null
    ? Number(((daysPresent / totalSchoolDays) * 100).toFixed(1))
    : null;

  return {
    attendanceSummary: {
      totalSchoolDays,
      daysPresent,
      daysAbsent,
      lateComing,
      attendanceRate,
      attendanceRemark: cleanText(value.attendanceRemark)
    },
    behaviorRatings: {
      discipline: cleanBehaviorGrade(value.behaviorRatings?.discipline),
      responsibility: cleanBehaviorGrade(value.behaviorRatings?.responsibility),
      cooperation: cleanBehaviorGrade(value.behaviorRatings?.cooperation),
      respect: cleanBehaviorGrade(value.behaviorRatings?.respect),
      initiative: cleanBehaviorGrade(value.behaviorRatings?.initiative)
    }
  };
}

export function hasAttendanceOverride(override = {}) {
  const attendance = override.attendanceSummary || {};
  return [
    attendance.totalSchoolDays,
    attendance.daysPresent,
    attendance.daysAbsent,
    attendance.lateComing
  ].some((item) => item !== null && item !== undefined);
}

export function hasBehaviorOverride(override = {}) {
  const behavior = override.behaviorRatings || {};
  return Object.values(behavior).some(Boolean);
}
