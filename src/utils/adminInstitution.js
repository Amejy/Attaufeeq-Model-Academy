export const ADMIN_INSTITUTIONS = ['ATTAUFEEQ Model Academy', 'Madrastul ATTAUFEEQ', 'Quran Memorization Academy'];

export function canonicalInstitution(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  if (normalized.includes('madrasa') || normalized.includes('madrastul')) {
    return 'Madrastul ATTAUFEEQ';
  }
  if (normalized.includes('memorization')) {
    return 'Quran Memorization Academy';
  }
  return 'ATTAUFEEQ Model Academy';
}

export function institutionAccent(institution) {
  if (String(institution || '').toLowerCase().includes('madrastul')) {
    return 'border-amber-200 bg-amber-50 text-amber-900';
  }
  if (institution === 'Quran Memorization Academy') {
    return 'border-blue-200 bg-blue-50 text-blue-900';
  }
  return 'border-emerald-200 bg-emerald-50 text-emerald-900';
}

export function groupByInstitution(items, getInstitution) {
  return ADMIN_INSTITUTIONS.map((institution) => ({
    institution,
    items: items.filter((item) => getInstitution(item) === institution)
  }));
}
