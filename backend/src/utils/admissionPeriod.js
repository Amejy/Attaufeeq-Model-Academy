const DEFAULT_PROGRAMS = {
  modern: { enabled: true, startDate: '', endDate: '' },
  madrasa: { enabled: true, startDate: '', endDate: '' },
  memorization: { enabled: true, startDate: '', endDate: '' }
};

function toStringValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeAdmissionPeriod(input = {}) {
  const raw = input && typeof input === 'object' ? input : {};
  const hasPrograms = raw.programs && typeof raw.programs === 'object';
  const programs = hasPrograms ? raw.programs : {};
  const legacyEnabled = raw.enabled !== false;
  const legacyStart = toStringValue(raw.startDate);
  const legacyEnd = toStringValue(raw.endDate);

  const normalizedPrograms = Object.keys(DEFAULT_PROGRAMS).reduce((acc, key) => {
    if (!hasPrograms) {
      acc[key] = {
        enabled: legacyEnabled,
        startDate: legacyStart,
        endDate: legacyEnd
      };
      return acc;
    }
    const program = programs[key] && typeof programs[key] === 'object' ? programs[key] : {};
    acc[key] = {
      enabled: program.enabled !== false,
      startDate: toStringValue(program.startDate),
      endDate: toStringValue(program.endDate)
    };
    return acc;
  }, {});

  return {
    enabled: legacyEnabled,
    startDate: legacyStart,
    endDate: legacyEnd,
    programs: normalizedPrograms
  };
}

export function isWindowOpen(period) {
  if (!period?.enabled) return false;
  const start = period.startDate ? new Date(period.startDate).getTime() : null;
  const end = period.endDate ? new Date(period.endDate).getTime() : null;
  const now = Date.now();
  if (start != null && now < start) return false;
  if (end != null && now > end) return false;
  return true;
}

export function isProgramOpen(period, program) {
  const normalized = normalizeAdmissionPeriod(period);
  if (!normalized.enabled) return false;
  const programPeriod = normalized.programs[program];
  if (!programPeriod) return isWindowOpen(normalized);
  return isWindowOpen(programPeriod);
}

export function buildAdmissionPeriodResponse(period) {
  const normalized = normalizeAdmissionPeriod(period);
  const programs = {};
  let anyOpen = false;

  Object.keys(normalized.programs).forEach((key) => {
    const programOpen = normalized.enabled ? isProgramOpen(normalized, key) : false;
    programs[key] = {
      ...normalized.programs[key],
      isOpen: programOpen
    };
    if (programOpen) anyOpen = true;
  });

  return {
    ...normalized,
    programs,
    isOpen: normalized.enabled ? anyOpen : false
  };
}
