import { getNextTerm, normalizeTerm } from './academicProgression.js';

function cleanDate(value = '') {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  const time = Date.parse(trimmed);
  if (Number.isNaN(time)) return '';
  return new Date(time).toISOString().slice(0, 10);
}

function cleanText(value = '') {
  return String(value || '').trim();
}

export function normalizeAcademicCalendarEntry(entry = {}) {
  return {
    sessionId: cleanText(entry.sessionId),
    term: normalizeTerm(entry.term) || 'First Term',
    termStartDate: cleanDate(entry.termStartDate),
    termEndDate: cleanDate(entry.termEndDate),
    examStartDate: cleanDate(entry.examStartDate),
    examEndDate: cleanDate(entry.examEndDate),
    holidayStartDate: cleanDate(entry.holidayStartDate),
    holidayEndDate: cleanDate(entry.holidayEndDate),
    resultPublishingDate: cleanDate(entry.resultPublishingDate),
    nextTermBegins: cleanDate(entry.nextTermBegins),
    notes: cleanText(entry.notes),
    updatedAt: cleanText(entry.updatedAt)
  };
}

export function listAcademicCalendarEntries(store, sessionId = '') {
  const rows = Array.isArray(store?.academicCalendar) ? store.academicCalendar : [];
  return sessionId ? rows.filter((entry) => entry.sessionId === sessionId) : rows;
}

export function findAcademicCalendarEntry(store, sessionId = '', term = '') {
  const normalizedTerm = normalizeTerm(term);
  if (!sessionId || !normalizedTerm) return null;
  return listAcademicCalendarEntries(store, sessionId).find(
    (entry) => entry.sessionId === sessionId && entry.term === normalizedTerm
  ) || null;
}

export function resolveNextTermBegins(store, sessionId = '', term = '') {
  const current = findAcademicCalendarEntry(store, sessionId, term);
  if (current?.nextTermBegins) return current.nextTermBegins;

  const nextTerm = getNextTerm(term);
  if (!nextTerm) return '';

  const nextEntry = findAcademicCalendarEntry(store, sessionId, nextTerm);
  return nextEntry?.termStartDate || '';
}

export function validateAcademicCalendarEntry(entry = {}) {
  const pairs = [
    ['Term start date', entry.termStartDate],
    ['Term end date', entry.termEndDate],
    ['Exam start date', entry.examStartDate],
    ['Exam end date', entry.examEndDate],
    ['Holiday start date', entry.holidayStartDate],
    ['Holiday end date', entry.holidayEndDate],
    ['Result publishing date', entry.resultPublishingDate],
    ['Next term begins', entry.nextTermBegins]
  ];

  for (const [label, value] of pairs) {
    if (!value) continue;
    if (!cleanDate(value)) return `${label} must be a valid date.`;
  }

  if (entry.termStartDate && entry.termEndDate && entry.termStartDate > entry.termEndDate) {
    return 'Term start date must be before the term end date.';
  }
  if (entry.examStartDate && entry.examEndDate && entry.examStartDate > entry.examEndDate) {
    return 'Exam start date must be before the exam end date.';
  }
  if (entry.holidayStartDate && entry.holidayEndDate && entry.holidayStartDate > entry.holidayEndDate) {
    return 'Holiday start date must be before the holiday end date.';
  }

  return '';
}
