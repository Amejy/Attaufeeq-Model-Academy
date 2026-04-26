const TERM_ORDER = ['First Term', 'Second Term', 'Third Term'];

const CLASS_STAGE_DEFINITIONS = [
  { key: 'creche', label: 'Creche', aliases: ['creche', 'creche class'], order: 10, nextStageKey: 'nursery-1' },
  { key: 'nursery-1', label: 'Nursery 1', aliases: ['nursery 1', 'n1'], order: 20, nextStageKey: 'nursery-2' },
  { key: 'nursery-2', label: 'Nursery 2', aliases: ['nursery 2', 'n2'], order: 30, nextStageKey: 'nursery-3' },
  { key: 'nursery-3', label: 'Nursery 3', aliases: ['nursery 3', 'n3'], order: 40, nextStageKey: 'basic-1' },
  { key: 'basic-1', label: 'Basic 1', aliases: ['basic 1', 'primary 1', 'pri 1', 'p1'], order: 50, nextStageKey: 'basic-2' },
  { key: 'basic-2', label: 'Basic 2', aliases: ['basic 2', 'primary 2', 'pri 2', 'p2'], order: 60, nextStageKey: 'basic-3' },
  { key: 'basic-3', label: 'Basic 3', aliases: ['basic 3', 'primary 3', 'pri 3', 'p3'], order: 70, nextStageKey: 'basic-4' },
  { key: 'basic-4', label: 'Basic 4', aliases: ['basic 4', 'primary 4', 'pri 4', 'p4'], order: 80, nextStageKey: 'basic-5' },
  { key: 'basic-5', label: 'Basic 5', aliases: ['basic 5', 'primary 5', 'pri 5', 'p5'], order: 90, nextStageKey: 'basic-6' },
  { key: 'basic-6', label: 'Basic 6', aliases: ['basic 6', 'primary 6', 'pri 6', 'p6'], order: 100, graduationGate: true },
  { key: 'basic-7', label: 'Basic 7 (JSS 1)', aliases: ['basic 7', 'jss 1', 'js 1'], order: 110, nextStageKey: 'basic-8' },
  { key: 'basic-8', label: 'Basic 8 (JSS 2)', aliases: ['basic 8', 'jss 2', 'js 2'], order: 120, nextStageKey: 'basic-9' },
  { key: 'basic-9', label: 'Basic 9 (JSS 3)', aliases: ['basic 9', 'jss 3', 'js 3'], order: 130, graduationGate: true },
  { key: 'sss-1', label: 'SSS 1', aliases: ['sss 1', 'ss 1', 'senior secondary 1'], order: 140, nextStageKey: 'sss-2' },
  { key: 'sss-2', label: 'SSS 2', aliases: ['sss 2', 'ss 2', 'senior secondary 2'], order: 150, nextStageKey: 'sss-3' },
  { key: 'sss-3', label: 'SSS 3', aliases: ['sss 3', 'ss 3', 'senior secondary 3'], order: 160, graduationGate: true }
];

const CLASS_STAGE_MAP = new Map(CLASS_STAGE_DEFINITIONS.map((entry) => [entry.key, entry]));

function normalizeText(value = '') {
  return String(value || '').trim();
}

function normalizeClassText(value = '') {
  return normalizeText(value)
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeArm(value = '') {
  return normalizeText(value).toLowerCase();
}

function matchesAlias(normalizedName, aliases = []) {
  return aliases.some((alias) => normalizedName === normalizeClassText(alias));
}

export function normalizeTerm(value = '') {
  const trimmed = normalizeText(value);
  return TERM_ORDER.includes(trimmed) ? trimmed : '';
}

export function getNextTerm(term = '') {
  const normalized = normalizeTerm(term);
  const index = TERM_ORDER.indexOf(normalized);
  if (index === -1 || index >= TERM_ORDER.length - 1) return '';
  return TERM_ORDER[index + 1];
}

export function isSessionRolloverTerm(term = '') {
  return normalizeTerm(term) === 'Third Term';
}

export function inferClassStage(classItemOrName) {
  const rawName = typeof classItemOrName === 'string'
    ? classItemOrName
    : classItemOrName?.name || classItemOrName?.classLabel || '';
  const normalizedName = normalizeClassText(rawName);
  if (!normalizedName) return null;

  for (const definition of CLASS_STAGE_DEFINITIONS) {
    if (matchesAlias(normalizedName, definition.aliases)) {
      return definition;
    }
  }

  return null;
}

export function computeAcademicOrder(classItem) {
  if (!classItem) return null;
  const directOrder = classItem.progressionOrder ?? classItem.levelOrder ?? null;
  if (directOrder !== null && directOrder !== undefined && Number.isFinite(Number(directOrder))) {
    return Number(directOrder);
  }

  return inferClassStage(classItem)?.order ?? null;
}

function pickNextClassCandidate(candidates = [], currentClass = null) {
  if (!candidates.length) return null;
  const currentArm = normalizeArm(currentClass?.arm);
  return candidates.find((candidate) => normalizeArm(candidate.arm) === currentArm) || candidates[0] || null;
}

export function resolveNextClass(classItem, classes = []) {
  if (!classItem) return { nextClass: null, stage: null };
  const stage = inferClassStage(classItem);
  if (!stage?.nextStageKey) return { nextClass: null, stage };

  const institution = normalizeText(classItem.institution);
  const candidates = (classes || []).filter((candidate) => {
    if (institution && normalizeText(candidate.institution) !== institution) return false;
    return inferClassStage(candidate)?.key === stage.nextStageKey;
  });

  return { nextClass: pickNextClassCandidate(candidates, classItem), stage };
}

export function describePromotionStep(term = '', classItem = null, classes = []) {
  const normalizedTerm = normalizeTerm(term);
  if (!normalizedTerm) {
    return {
      action: 'hold',
      reason: 'invalid_term',
      label: 'Unknown step'
    };
  }

  if (normalizedTerm !== 'Third Term') {
    const nextTerm = getNextTerm(normalizedTerm);
    if (!nextTerm) {
      return {
        action: 'hold',
        reason: 'term_progression_missing',
        label: 'No next term configured'
      };
    }

    return {
      action: 'term',
      nextTerm,
      label: `Move to ${nextTerm}`
    };
  }

  const stage = inferClassStage(classItem);
  if (stage?.graduationGate) {
    return {
      action: 'graduate',
      reason: 'graduation_gate',
      label: 'Graduate and register again for the next portal'
    };
  }

  const { nextClass } = resolveNextClass(classItem, classes);
  if (nextClass) {
    return {
      action: 'class',
      nextClass,
      label: `Move to ${normalizeText(nextClass.name)} ${normalizeText(nextClass.arm)}`.trim()
    };
  }

  return {
    action: 'hold',
    reason: 'no_mapping',
    label: 'No next class configured'
  };
}

export function listAcademicClassStages() {
  return CLASS_STAGE_DEFINITIONS.map((entry) => ({ ...entry }));
}
