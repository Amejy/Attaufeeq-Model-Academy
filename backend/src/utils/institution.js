const INSTITUTION_ALIASES = [
  {
    key: 'ATTAUFEEQ Model Academy',
    aliases: [
      'model academy',
      'attaufeeq model academy',
      'attaufeeq model academy',
      'attafeeq model academy',
      'attaufiq model academy'
    ]
  },
  {
    key: 'Madrastul ATTAUFEEQ',
    aliases: [
      'madrastul attaufeeq',
      'madrastul attafeeq',
      'madrastul attaufiq',
      'madrastul attaufiq'
    ]
  },
  {
    key: 'Quran Memorization Academy',
    aliases: [
      'quran memorization academy',
      'quran memorisation academy'
    ]
  }
];

function normalizeLower(value) {
  return String(value || '').trim().toLowerCase();
}

export function normalizeInstitution(value = '') {
  const normalized = normalizeLower(value);
  if (!normalized) return '';
  const match = INSTITUTION_ALIASES.find((item) => item.aliases.includes(normalized));
  if (match) return match.key;
  return String(value || '').trim() || '';
}

export function institutionEquals(a = '', b = '') {
  const left = normalizeLower(normalizeInstitution(a));
  const right = normalizeLower(normalizeInstitution(b));
  if (!left || !right) return false;
  return left === right;
}
