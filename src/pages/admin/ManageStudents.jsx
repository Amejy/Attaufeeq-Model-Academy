import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import readXlsxFile from 'read-excel-file';
import { useAuth } from '../../context/AuthContext';
import PortalLayout from '../../components/PortalLayout';
import ProvisioningPanel from '../../components/ProvisioningPanel';
import { ADMIN_INSTITUTIONS, canonicalInstitution, institutionAccent } from '../../utils/adminInstitution';
import { buildStudentCode } from '../../utils/studentCode';
import useDebouncedValue from '../../hooks/useDebouncedValue';

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

const IMPORT_FIELDS = [
  { key: 'fullName', label: 'Student Full Name', required: true },
  { key: 'classId', label: 'Class ID', required: false },
  { key: 'className', label: 'Class Name', required: false },
  { key: 'arm', label: 'Arm', required: false },
  { key: 'institution', label: 'Institution', required: false },
  { key: 'studentEmail', label: 'Student Email', required: false },
  { key: 'guardianName', label: 'Guardian Name', required: true },
  { key: 'guardianPhone', label: 'Guardian Phone', required: false },
  { key: 'guardianEmail', label: 'Guardian Email', required: true },
  { key: 'level', label: 'Level (Fallback)', required: false }
];

const FIELD_ALIASES = {
  fullName: ['full name', 'student name', 'name', 'fullname', 'student'],
  classId: ['class id', 'classid', 'class_id', 'class code'],
  className: ['class name', 'classname', 'class', 'level', 'grade'],
  arm: ['arm', 'stream', 'section'],
  institution: ['institution', 'school', 'campus'],
  studentEmail: ['student email', 'studentemail', 'email', 'student mail'],
  guardianName: ['guardian name', 'guardianname', 'parent name', 'guardian', 'parent'],
  guardianPhone: ['guardian phone', 'guardianphone', 'parent phone', 'phone', 'parent phone number', 'guardian phone number'],
  guardianEmail: ['guardian email', 'guardianemail', 'parent email', 'parent mail', 'guardian mail']
};

function cleanText(value) {
  return String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanCell(value) {
  const text = cleanText(value);
  const stripped = text.replace(/^"+|"+$/g, '').replace(/^'+|'+$/g, '');
  return stripped.replace(/""/g, '"').trim();
}

function titleCase(value) {
  const cleaned = cleanText(value).toLowerCase();
  if (!cleaned) return '';
  return cleaned
    .split(' ')
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : ''))
    .join(' ')
    .trim();
}

function normalizeArm(value) {
  const cleaned = cleanText(value).toUpperCase();
  if (!cleaned) return '';
  const match = cleaned.match(/[A-Z0-9]+/);
  return match ? match[0] : cleaned;
}

function normalizeEmail(value) {
  const cleaned = cleanText(value).toLowerCase();
  if (!cleaned) return '';
  return cleaned
    .replace(/\s+/g, '')
    .replace(/\(at\)|\[at\]|\sat\s/g, '@')
    .replace(/\(dot\)|\[dot\]|\sdot\s/g, '.');
}

function normalizePhone(value) {
  const cleaned = cleanText(value);
  if (!cleaned) return '';
  const hasPlus = cleaned.startsWith('+');
  const digits = cleaned.replace(/[^\d]/g, '');
  return hasPlus ? `+${digits}` : digits;
}

function normalizeClassName(value) {
  const cleaned = cleanText(value).toUpperCase();
  if (!cleaned) return '';
  const normalized = cleaned
    .replace(/\bJUNIOR\s+SECONDARY\s+SCHOOL\b/g, 'JSS')
    .replace(/\bSENIOR\s+SECONDARY\s+SCHOOL\b/g, 'SS')
    .replace(/\bJUNIOR\b/g, 'JSS')
    .replace(/\bSENIOR\b/g, 'SS')
    .replace(/\s+/g, '');
  if (normalized.startsWith('JSS')) {
    return `JSS ${normalized.replace('JSS', '').trim()}`.trim();
  }
  if (normalized.startsWith('SS')) {
    return `SS ${normalized.replace('SS', '').trim()}`.trim();
  }
  return titleCase(cleaned);
}

function slugifyUsername(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');
}

function generatePassword(length = 10) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  let result = '';
  for (let i = 0; i < length; i += 1) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function buildStudentId(prefix, index) {
  const year = new Date().getFullYear();
  const padded = String(index + 1).padStart(4, '0');
  return `${prefix}-${year}-${padded}`;
}

function guessFieldForHeader(header, assigned = new Set()) {
  const normalized = cleanText(header).toLowerCase();
  for (const field of IMPORT_FIELDS) {
    if (assigned.has(field.key)) continue;
    const aliases = FIELD_ALIASES[field.key] || [];
    if (aliases.some((alias) => normalized.includes(alias))) {
      return field.key;
    }
  }
  return '';
}

function isValidEmail(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase();
}

function highlightMatch(text, query) {
  const safeText = String(text || '');
  const safeQuery = String(query || '').trim();
  if (!safeQuery) return safeText;
  const lower = safeText.toLowerCase();
  const index = lower.indexOf(safeQuery.toLowerCase());
  if (index === -1) return safeText;
  const before = safeText.slice(0, index);
  const match = safeText.slice(index, index + safeQuery.length);
  const after = safeText.slice(index + safeQuery.length);
  return (
    <span>
      {before}
      <span className="rounded bg-amber-100 px-1 text-amber-900">{match}</span>
      {after}
    </span>
  );
}

function isCountableActiveStudent(item) {
  const status = normalizeStatus(item?.accountStatus);
  return Boolean(item?.userId && item?.portalEmail && ['pending', 'provisioned', 'active'].includes(status));
}

function isInactiveStudent(item) {
  return normalizeStatus(item?.accountStatus) === 'inactive';
}

function isGraduatedStudent(item) {
  return normalizeStatus(item?.accountStatus) === 'graduated';
}

function sortStudents(list, sortBy) {
  const sorted = [...list];
  sorted.sort((a, b) => {
    if (sortBy === 'created-desc') {
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    }
    if (sortBy === 'created-asc') {
      return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
    }
    return String(a.fullName || '').localeCompare(String(b.fullName || ''));
  });
  return sorted;
}

function buildStudentRegistrationRequest(values = {}) {
  return {
    student: {
      fullName: String(values.fullName || '').trim(),
      classId: String(values.classId || '').trim(),
      level: String(values.level || '').trim(),
      institution: String(values.institution || '').trim(),
      email: String(values.studentEmail || '').trim()
    },
    guardian: {
      fullName: String(values.guardianName || '').trim(),
      phone: String(values.guardianPhone || '').trim(),
      email: String(values.guardianEmail || '').trim()
    }
  };
}

function validateStudentRegistration(values = {}) {
  const request = buildStudentRegistrationRequest(values);

  if (!request.student.fullName) return 'Student full name is required.';
  if (!request.student.classId && (!request.student.level || !request.student.institution)) {
    return 'Select a class before submitting the registration.';
  }
  if (!request.guardian.fullName) return 'Parent or guardian name is required.';
  if (!request.guardian.email) return 'Parent or guardian email is required.';
  if (!isValidEmail(request.guardian.email)) return 'Parent or guardian email must be a valid email address.';
  if (request.student.email && !isValidEmail(request.student.email)) {
    return 'Student email must be a valid email address.';
  }

  return '';
}

function normalizeRowLength(row, headerLength) {
  const next = [...row];
  if (next.length < headerLength) {
    while (next.length < headerLength) next.push('');
    return next;
  }
  if (next.length > headerLength) {
    const extra = next.splice(headerLength - 1);
    next[headerLength - 1] = `${next[headerLength - 1] || ''},${extra.join(',')}`.trim();
  }
  return next;
}

function parseCsvWithPapa(text) {
  const parsed = Papa.parse(text, {
    skipEmptyLines: 'greedy',
    dynamicTyping: false
  });

  if (parsed.errors?.length) {
    return { rows: [], headers: [], error: parsed.errors[0]?.message || 'Unable to parse CSV.' };
  }

  const data = parsed.data || [];
  if (data.length < 2) {
    return { rows: [], headers: [], error: 'CSV has no data rows.' };
  }

  const rawHeaders = data[0].map((value) => cleanText(value));
  const headerLength = rawHeaders.length;
  const rows = data.slice(1).map((row) => normalizeRowLength(row.map(cleanCell), headerLength));
  return { headers: rawHeaders, rows };
}

async function parseExcelBuffer(buffer) {
  const data = await readXlsxFile(buffer);
  if (!data || data.length < 2) {
    return { rows: [], headers: [], error: 'Excel sheet has no data rows.' };
  }
  const rawHeaders = data[0].map((value) => cleanText(value));
  const headerLength = rawHeaders.length;
  const rows = data.slice(1).map((row) => normalizeRowLength(row.map(cleanCell), headerLength));
  return { headers: rawHeaders, rows };
}

function downloadCsv(filename, headers, rows) {
  const headerLine = headers.join(',');
  const dataLines = rows.map((row) =>
    headers
      .map((header) => {
        const value = row[header] ?? '';
        const escaped = String(value).replace(/"/g, '""');
        return `"${escaped}"`;
      })
      .join(',')
  );

  const csv = [headerLine, ...dataLines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function ManageStudents({ role }) {
  const { apiJson, user } = useAuth();
  const resolvedRole = role || user?.role || 'admin';
  const managementBase = resolvedRole === 'admissions' ? '/operations' : '/admin';
  const defaultInstitution = ADMIN_INSTITUTIONS[0];
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [creatingStudent, setCreatingStudent] = useState(false);
  const [savingStudentId, setSavingStudentId] = useState('');
  const [deletingStudentId, setDeletingStudentId] = useState('');
  const [bulkUploading, setBulkUploading] = useState(false);
  const [lastCredentials, setLastCredentials] = useState([]);
  const [bulkCredentials, setBulkCredentials] = useState([]);
  const [bulkFile, setBulkFile] = useState(null);
  const [importErrors, setImportErrors] = useState([]);
  const [bulkStep, setBulkStep] = useState('upload');
  const [bulkHeaders, setBulkHeaders] = useState([]);
  const [bulkRawRows, setBulkRawRows] = useState([]);
  const [bulkRows, setBulkRows] = useState([]);
  const [bulkMapping, setBulkMapping] = useState({});
  const [bulkValidation, setBulkValidation] = useState({ valid: 0, invalid: 0 });
  const [bulkDuplicates, setBulkDuplicates] = useState(() => new Set());
  const [bulkPreviewCount, setBulkPreviewCount] = useState(25);
  const [dragActive, setDragActive] = useState(false);
  const [bulkFilter, setBulkFilter] = useState('all');
  const [bulkSearch, setBulkSearch] = useState('');
  const [bulkSelected, setBulkSelected] = useState(() => new Set());
  const [bulkHistory, setBulkHistory] = useState([]);
  const [bulkDefaults, setBulkDefaults] = useState({
    defaultInstitution: ADMIN_INSTITUTIONS[0],
    emailDomain: 'schoolportal.com',
    idPrefix: 'STU',
    passwordMode: 'random',
    defaultArm: 'A'
  });
  const [form, setForm] = useState({
    fullName: '',
    classId: '',
    institution: defaultInstitution,
    studentEmail: '',
    guardianName: '',
    guardianPhone: '',
    guardianEmail: ''
  });
  const [editingId, setEditingId] = useState('');
  const [editForm, setEditForm] = useState({
    fullName: '',
    classId: '',
    studentEmail: '',
    guardianName: '',
    guardianPhone: '',
    guardianEmail: ''
  });
  const [search, setSearch] = useState('');
  const [classSearch, setClassSearch] = useState('');
  const [graduatedSearch, setGraduatedSearch] = useState('');
  const [institutionFilter, setInstitutionFilter] = useState('all');
  const [classFilter, setClassFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [feesFilter, setFeesFilter] = useState('all');
  const [feesTerm, setFeesTerm] = useState('First Term');
  const [sessions, setSessions] = useState([]);
  const [feeSessionId, setFeeSessionId] = useState('');
  const [defaulterIds, setDefaulterIds] = useState([]);
  const [feesLoading, setFeesLoading] = useState(false);
  const [feesError, setFeesError] = useState('');
  const [sortBy, setSortBy] = useState('name-asc');
  const [expandedClasses, setExpandedClasses] = useState({});
  const loadDataSeq = useRef(0);
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const debouncedClassSearch = useDebouncedValue(classSearch.trim(), 300);
  const debouncedGraduatedSearch = useDebouncedValue(graduatedSearch.trim(), 300);
  const studentQuerySeq = useRef(0);

  const classLookupByDetails = useMemo(() => {
    const map = new Map();
    classes.forEach((item) => {
      const key = `${normalize(item.name)}|${normalize(item.arm)}|${normalize(canonicalInstitution(item.institution))}`;
      map.set(key, item.id);
    });
    return map;
  }, [classes]);

  const classLookupById = useMemo(() => {
    const map = new Map();
    classes.forEach((item) => map.set(item.id, item));
    return map;
  }, [classes]);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('attaufiq.bulkStudentHistory') || '[]');
      if (Array.isArray(stored)) {
        setBulkHistory(stored);
      }
    } catch {
      setBulkHistory([]);
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function loadHistory() {
      try {
        const data = await apiJson(`${managementBase}/bulk-uploads/students?limit=10`);
        if (!active) return;
        if (Array.isArray(data.uploads)) {
          setBulkHistory(data.uploads);
          localStorage.setItem('attaufiq.bulkStudentHistory', JSON.stringify(data.uploads));
        }
      } catch {
        // keep local history on failure
      }
    }
    loadHistory();
    return () => {
      active = false;
    };
  }, [apiJson, managementBase]);

  const loadData = useCallback(async () => {
    const seq = ++loadDataSeq.current;
    setLoading(true);
    setError('');
    setSuccess('');
    setStudents([]);
    setClasses([]);
    setLastCredentials([]);
    setBulkCredentials([]);
    setImportErrors([]);
    setExpandedClasses({});
    setEditingId('');

    try {
      const [studentsData, classesData, sessionsData] = await Promise.all([
        apiJson(`${managementBase}/students`),
        apiJson(`${managementBase}/classes`),
        apiJson('/results/sessions')
      ]);
      if (seq !== loadDataSeq.current) return;

      const classList = classesData.classes || [];
      const sessionRows = sessionsData.sessions || [];
      const activeSession = sessionsData.activeSession || sessionRows.find((item) => item.isActive) || sessionRows[0] || null;
      setStudents(studentsData.students || []);
      setClasses(classList);
      setSessions(sessionRows);
      setFeeSessionId((prev) =>
        prev && sessionRows.some((session) => session.id === prev)
          ? prev
          : activeSession?.id || ''
      );
      setForm((prev) => {
        const nextInstitution = canonicalInstitution(prev.institution || classList[0]?.institution || defaultInstitution);
        const nextClasses = classList.filter(
          (item) => canonicalInstitution(item.institution) === canonicalInstitution(nextInstitution)
        );
        return {
          ...prev,
          institution: nextInstitution,
          classId: nextClasses.some((item) => item.id === prev.classId) ? prev.classId : nextClasses[0]?.id || ''
        };
      });
    } catch (err) {
      if (seq !== loadDataSeq.current) return;
      setError(err.message || 'Unable to fetch student data.');
    } finally {
      if (seq === loadDataSeq.current) {
        setLoading(false);
      }
    }
  }, [apiJson, defaultInstitution, managementBase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const entryClasses = useMemo(
    () => classes.filter((item) => canonicalInstitution(item.institution) === canonicalInstitution(form.institution)),
    [classes, form.institution]
  );

  useEffect(() => {
    if (!entryClasses.some((item) => item.id === form.classId)) {
      setForm((prev) => ({ ...prev, classId: entryClasses[0]?.id || '' }));
    }
  }, [entryClasses, form.classId]);

  useEffect(() => {
    let active = true;
    const seq = ++studentQuerySeq.current;
    const params = new URLSearchParams();
    if (institutionFilter !== 'all') params.set('institution', institutionFilter);
    if (classFilter) params.set('classId', classFilter);
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (debouncedSearch) params.set('q', debouncedSearch);
    if (sortBy === 'created-desc') params.set('sort', 'created_desc');
    if (sortBy === 'created-asc') params.set('sort', 'created_asc');
    if (sortBy === 'name-asc') params.set('sort', 'name_asc');
    if (sortBy === 'name-desc') params.set('sort', 'name_desc');

    async function refreshStudents() {
      try {
        const query = params.toString();
        const data = await apiJson(`${managementBase}/students${query ? `?${query}` : ''}`);
        if (!active || seq !== studentQuerySeq.current) return;
        setStudents(data.students || []);
      } catch {
        // keep last loaded list on transient errors
      }
    }

    refreshStudents();
    return () => {
      active = false;
    };
  }, [apiJson, classFilter, debouncedSearch, institutionFilter, managementBase, sortBy, statusFilter]);

  useEffect(() => {
    if (classFilter && !classes.some((item) => item.id === classFilter)) {
      setClassFilter('');
    }
  }, [classFilter, classes]);

  useEffect(() => {
    let active = true;
    if (!feeSessionId || feesFilter === 'all') {
      setDefaulterIds([]);
      setFeesError('');
      return () => {
        active = false;
      };
    }

    async function loadDefaulters() {
      setFeesLoading(true);
      setFeesError('');
      try {
        const params = new URLSearchParams({ term: feesTerm });
        if (feeSessionId) params.set('sessionId', feeSessionId);
        let data;
        try {
          data = await apiJson(`/fees/admin/defaulters?${params.toString()}`);
        } catch (err) {
          const directBase = import.meta.env.VITE_BACKEND_PROXY_TARGET;
          const isNetworkError = String(err?.message || '').toLowerCase().includes('failed to fetch');
          if (directBase && isNetworkError && directBase.startsWith('http')) {
            const base = directBase.replace(/\/+$/, '');
            data = await apiJson(`${base}/api/fees/admin/defaulters?${params.toString()}`);
          } else {
            throw err;
          }
        }
        if (!active) return;
        const defaulters = data.defaulters || [];
        setDefaulterIds(defaulters.map((entry) => entry.student?.id).filter(Boolean));
      } catch (err) {
        if (!active) return;
        const message = String(err?.message || '');
        setFeesError(
          message.toLowerCase().includes('failed to fetch')
            ? 'Unable to reach the backend. Confirm the server is running and the proxy target is correct.'
            : message || 'Unable to load fee status.'
        );
        setDefaulterIds([]);
      } finally {
        if (active) setFeesLoading(false);
      }
    }

    loadDefaulters();
    return () => {
      active = false;
    };
  }, [apiJson, feeSessionId, feesFilter, feesTerm]);

  const activeEditingStudent = useMemo(
    () => students.find((item) => item.id === editingId) || null,
    [editingId, students]
  );
  const editClasses = useMemo(
    () => (activeEditingStudent
      ? classes.filter((item) => canonicalInstitution(item.institution) === canonicalInstitution(activeEditingStudent.institution))
      : []),
    [activeEditingStudent, classes]
  );
  const classFilterOptions = useMemo(
    () => classes
      .filter((item) => {
        if (institutionFilter === 'all') return true;
        return canonicalInstitution(item.institution) === canonicalInstitution(institutionFilter);
      })
      .sort((a, b) => `${a.name} ${a.arm}`.localeCompare(`${b.name} ${b.arm}`)),
    [classes, institutionFilter]
  );

  useEffect(() => {
    if (!editingId) {
      return;
    }

    if (!activeEditingStudent) {
      setEditingId('');
      return;
    }

    setEditForm((prev) => ({
      ...prev,
      classId: editClasses.some((item) => item.id === prev.classId) ? prev.classId : editClasses[0]?.id || ''
    }));
  }, [activeEditingStudent, editClasses, editingId]);

  const createValidationError = validateStudentRegistration(form);
  const editValidationError = validateStudentRegistration(editForm);
  const canCreateStudent = Boolean(entryClasses.length && !createValidationError);
  const canSaveStudent = Boolean(editClasses.length && !editValidationError);

  function downloadTemplate() {
    const firstClass = classes?.[0];
    const templateRows = [
      {
        fullName: 'Abdullah Musa',
        classId: firstClass?.id || 'cls-001',
        studentEmail: 'abdullah.musa.student@portal.attaufiqschools.com',
        guardianName: 'Musa Abdullah',
        guardianPhone: '+2348000000000',
        guardianEmail: 'guardian@example.com',
        className: '',
        arm: '',
        institution: ''
      },
      {
        fullName: 'Maryam Yusuf',
        classId: '',
        studentEmail: '',
        guardianName: 'Yusuf Maryam',
        guardianPhone: '',
        guardianEmail: 'maryam.guardian@example.com',
        className: firstClass?.name || 'JSS 1',
        arm: firstClass?.arm || 'A',
        institution: firstClass?.institution || 'ATTAUFEEQ Model Academy'
      }
    ];

    downloadCsv(
      'students-import-template.csv',
      ['fullName', 'classId', 'studentEmail', 'guardianName', 'guardianPhone', 'guardianEmail', 'className', 'arm', 'institution'],
      templateRows
    );
  }

  function downloadImportErrors() {
    const invalidRows = bulkRows.filter((row) => !row._valid);

    if (invalidRows.length) {
      const rows = invalidRows.map((row) => ({
        rowIndex: row._index,
        error: (row._errors || []).join(' | '),
        fullName: row.fullName,
        classId: row.classId,
        studentEmail: row.studentEmail,
        guardianName: row.guardianName,
        guardianPhone: row.guardianPhone,
        guardianEmail: row.guardianEmail,
        className: row.className,
        arm: row.arm,
        institution: row.institution
      }));

      downloadCsv(
        'students-import-errors.csv',
        ['rowIndex', 'error', 'fullName', 'classId', 'studentEmail', 'guardianName', 'guardianPhone', 'guardianEmail', 'className', 'arm', 'institution'],
        rows
      );
      return;
    }

    if (!importErrors.length) return;

    const rows = importErrors.map((item) => ({
      rowIndex: item.index,
      error: item.error,
      fullName: item.row?.student?.fullName || item.row?.fullName || item.row?.fullname || item.row?.full_name || '',
      classId: item.row?.student?.classId || item.row?.classId || item.row?.classid || item.row?.class_id || '',
      studentEmail: item.row?.student?.email || item.row?.studentEmail || item.row?.studentemail || '',
      guardianName: item.row?.guardian?.fullName || item.row?.guardianName || item.row?.guardianname || '',
      guardianPhone: item.row?.guardian?.phone || item.row?.guardianPhone || item.row?.guardianphone || '',
      guardianEmail: item.row?.guardian?.email || item.row?.guardianEmail || item.row?.guardianemail || '',
      className: item.row?.className || item.row?.classname || item.row?.class_name || '',
      arm: item.row?.arm || '',
      institution: item.row?.student?.institution || item.row?.institution || ''
    }));

    downloadCsv(
      'students-import-errors.csv',
      ['rowIndex', 'error', 'fullName', 'classId', 'studentEmail', 'guardianName', 'guardianPhone', 'guardianEmail', 'className', 'arm', 'institution'],
      rows
    );
  }

  function downloadBulkCredentials() {
    if (!bulkCredentials.length) return;

    downloadCsv(
      'student-portal-credentials.csv',
      ['fullName', 'label', 'role', 'email', 'password', 'reused'],
      bulkCredentials
    );
  }

  function downloadBulkReport(type = 'all') {
    if (!bulkRows.length) return;

    const rows = bulkRows
      .filter((row) => {
        if (type === 'errors') return row._status === 'error';
        if (type === 'success') return row._status === 'valid';
        if (type === 'duplicates') return row._status === 'duplicate';
        return true;
      })
      .map((row) => ({
        rowIndex: row._index,
        status: row._status,
        decision: row._decision,
        error: (row._errors || []).join(' | '),
        fullName: row.fullName,
        classId: row.classId,
        className: row.className,
        arm: row.arm,
        institution: row.institution,
        studentEmail: row.studentEmail,
        guardianName: row.guardianName,
        guardianPhone: row.guardianPhone,
        guardianEmail: row.guardianEmail
      }));

    downloadCsv(
      `students-upload-${type}.csv`,
      [
        'rowIndex',
        'status',
        'decision',
        'error',
        'autoGenerated',
        'fullName',
        'classId',
        'className',
        'arm',
        'institution',
        'studentEmail',
        'studentId',
        'username',
        'defaultPassword',
        'createdAt',
        'guardianName',
        'guardianPhone',
        'guardianEmail'
      ],
      rows
    );
  }

  async function clearBulkHistory() {
    const confirmed = window.confirm('Clear all bulk upload history? This does not delete any student records.');
    if (!confirmed) return;
    try {
      await apiJson(`${managementBase}/bulk-uploads/students`, { method: 'DELETE' });
    } catch {
      // ignore API errors, still clear local cache
    } finally {
      setBulkHistory([]);
      localStorage.removeItem('attaufiq.bulkStudentHistory');
    }
  }

  function buildReportRows(rows) {
    return rows.map((row) => ({
      rowIndex: row._index,
      status: row._status,
      decision: row._decision,
      error: (row._errors || []).join(' | '),
      autoGenerated: (row._autoGenerated || []).join(', '),
      fullName: row.fullName,
      classId: row.classId,
      className: row.className,
      arm: row.arm,
      institution: row.institution,
      studentEmail: row.studentEmail,
      studentId: row.studentId,
      username: row.username,
      defaultPassword: row.defaultPassword,
      createdAt: row.createdAt,
      guardianName: row.guardianName,
      guardianPhone: row.guardianPhone,
      guardianEmail: row.guardianEmail,
      _dupeKey: row._dupeKey
    }));
  }

  function restoreHistoryItem(item) {
    if (!item?.rows?.length) return;
    const rows = item.rows.map((row) => ({
      ...row,
      _errors: row.error ? row.error.split(' | ') : [],
      _fieldErrors: {},
      _valid: row.status === 'valid',
      _status: row.status || 'error',
      _decision: row.decision || 'pending'
    }));
    const duplicates = new Set(rows.filter((row) => row._status === 'duplicate').map((row) => row._dupeKey));
    const refreshed = refreshBulkValidation(rows, duplicates);
    setBulkRows(refreshed.rows);
    setBulkDuplicates(duplicates);
    setBulkValidation({ valid: refreshed.validCount, invalid: refreshed.invalidCount });
    setBulkStep('review');
  }

  function resetBulkState() {
    setBulkFile(null);
    setBulkHeaders([]);
    setBulkRawRows([]);
    setBulkRows([]);
    setBulkMapping({});
    setBulkValidation({ valid: 0, invalid: 0 });
    setBulkDuplicates(new Set());
    setBulkStep('upload');
    setImportErrors([]);
    setBulkCredentials([]);
    setBulkFilter('all');
    setBulkSearch('');
    setBulkSelected(new Set());
  }

  function buildDefaultMapping(headers) {
    const assigned = new Set();
    const mapping = {};
    headers.forEach((header) => {
      const guessed = guessFieldForHeader(header, assigned);
      mapping[header] = guessed;
      if (guessed) assigned.add(guessed);
    });
    return mapping;
  }

  function normalizeMappedRow(row = {}, index = 0) {
    const auto = new Set();
    const next = {
      fullName: titleCase(row.fullName || ''),
      classId: cleanText(row.classId || ''),
      className: normalizeClassName(row.className || ''),
      arm: normalizeArm(row.arm || ''),
      institution: cleanText(row.institution || '') || bulkDefaults.defaultInstitution,
      studentEmail: normalizeEmail(row.studentEmail || ''),
      guardianName: titleCase(row.guardianName || ''),
      guardianPhone: normalizePhone(row.guardianPhone || ''),
      guardianEmail: normalizeEmail(row.guardianEmail || ''),
      level: cleanText(row.level || ''),
      studentId: cleanText(row.studentId || ''),
      username: cleanText(row.username || ''),
      defaultPassword: cleanText(row.defaultPassword || ''),
      createdAt: row.createdAt || ''
    };

    if (!next.institution) {
      next.institution = bulkDefaults.defaultInstitution;
      auto.add('institution');
    }

    if (!next.arm && bulkDefaults.defaultArm) {
      next.arm = normalizeArm(bulkDefaults.defaultArm);
      auto.add('arm');
    }

    if (next.classId && classLookupById.has(next.classId)) {
      const classInfo = classLookupById.get(next.classId);
      next.className = classInfo?.name || next.className;
      next.arm = classInfo?.arm || next.arm;
      next.institution = classInfo?.institution || next.institution;
      next.level = `${next.className} ${next.arm}`.trim();
      auto.add('classId');
      return next;
    }

    if (!next.arm && next.className) {
      const match = next.className.match(/(.+)\s+([A-Za-z0-9]+)$/);
      if (match) {
        next.className = titleCase(match[1]);
        next.arm = normalizeArm(match[2]);
      }
    }

    if (!next.classId && next.className && next.arm && next.institution) {
      const key = `${normalize(next.className)}|${normalize(next.arm)}|${normalize(next.institution)}`;
      const matchedId = classLookupByDetails.get(key);
      if (matchedId) {
        next.classId = matchedId;
        auto.add('classId');
      }
    }

    if (!next.level && next.className && next.arm) {
      next.level = `${next.className} ${next.arm}`.trim();
      auto.add('level');
    }

    if (!next.studentId) {
      next.studentId = buildStudentId(bulkDefaults.idPrefix || 'STU', index);
      auto.add('studentId');
    }

    if (!next.username && next.fullName) {
      next.username = slugifyUsername(next.fullName);
      auto.add('username');
    }

    if (!next.studentEmail && next.fullName) {
      const base = slugifyUsername(next.fullName).replace(/\.+/g, '.');
      next.studentEmail = `${base}@${bulkDefaults.emailDomain}`;
      auto.add('studentEmail');
    }

    if (!next.defaultPassword) {
      next.defaultPassword =
        bulkDefaults.passwordMode === 'phone' && next.guardianPhone
          ? next.guardianPhone
          : generatePassword(10);
      auto.add('defaultPassword');
    }

    if (!next.createdAt) {
      next.createdAt = new Date().toISOString();
      auto.add('createdAt');
    }

    next._autoGenerated = [...auto];

    return next;
  }

  function validateMappedRow(row = {}, duplicates = new Set()) {
    const errors = [];
    const fieldErrors = {};

    if (!row.fullName) {
      errors.push('Student name is required.');
      fieldErrors.fullName = 'Required';
    }

    if (!row.classId && (!row.className || !row.arm)) {
      errors.push('Class name and arm are required when class ID is missing.');
      fieldErrors.className = fieldErrors.className || 'Required';
      fieldErrors.arm = fieldErrors.arm || 'Required';
    }

    if (!row.institution) {
      errors.push('Institution is required.');
      fieldErrors.institution = 'Required';
    }

    if (!row.guardianName) {
      errors.push('Guardian name is required.');
      fieldErrors.guardianName = 'Required';
    }

    if (!row.guardianEmail) {
      errors.push('Guardian email is required.');
      fieldErrors.guardianEmail = 'Required';
    } else if (!isValidEmail(row.guardianEmail)) {
      errors.push('Guardian email is invalid.');
      fieldErrors.guardianEmail = 'Invalid email';
    }

    if (row.studentEmail && !isValidEmail(row.studentEmail)) {
      errors.push('Student email is invalid.');
      fieldErrors.studentEmail = 'Invalid email';
    }

    if (row.guardianPhone && String(row.guardianPhone).replace(/\D/g, '').length < 7) {
      errors.push('Guardian phone looks too short.');
      fieldErrors.guardianPhone = 'Too short';
    }

    if (row.classId && !classLookupById.has(row.classId)) {
      errors.push('Class ID does not exist.');
      fieldErrors.classId = 'Unknown class';
    }

    if (!row.studentEmail && row.fullName) {
      errors.push('Student email missing; auto-generated suggestion applied.');
      fieldErrors.studentEmail = 'Auto-generated';
    } else if (row.studentEmail && !isValidEmail(row.studentEmail)) {
      fieldErrors.studentEmail = fieldErrors.studentEmail || 'Invalid email';
    }

    if (duplicates.has(row._dupeKey)) {
      errors.push('Duplicate row detected (same name + class).');
      fieldErrors.fullName = fieldErrors.fullName || 'Duplicate';
    }

    return { errors, fieldErrors, valid: errors.length === 0 };
  }

  function buildBulkRowsFromMapping(headers, rows, mapping) {
    const mapped = rows.map((cells, index) => {
      const rowObject = {};
      headers.forEach((header, columnIndex) => {
        const field = mapping[header];
        if (!field) return;
        const value = cells[columnIndex] ?? '';
        if (rowObject[field]) {
          rowObject[field] = `${rowObject[field]} ${value}`.trim();
        } else {
          rowObject[field] = value;
        }
      });

      const cleaned = normalizeMappedRow(rowObject, index);
      const dupeKey = `${normalize(cleaned.fullName)}|${normalize(cleaned.classId || `${cleaned.className}-${cleaned.arm}-${cleaned.institution}`)}`;

      return {
        ...cleaned,
        _index: index + 2,
        _dupeKey: dupeKey
      };
    });

    const dupeMap = new Map();
    mapped.forEach((row) => {
      const count = dupeMap.get(row._dupeKey) || 0;
      dupeMap.set(row._dupeKey, count + 1);
    });
    const duplicates = new Set(
      [...dupeMap.entries()].filter(([, count]) => count > 1).map(([key]) => key)
    );

    const validated = mapped.map((row) => {
      const validation = validateMappedRow(row, duplicates);
      const status = duplicates.has(row._dupeKey)
        ? 'duplicate'
        : validation.valid
          ? 'valid'
          : 'error';
      return {
        ...row,
        _errors: validation.errors,
        _fieldErrors: validation.fieldErrors,
        _valid: validation.valid,
        _status: status,
        _decision: 'pending'
      };
    });

    return { rows: validated, duplicates };
  }

  function refreshBulkValidation(nextRows, duplicates = new Set()) {
    const validated = nextRows.map((row) => {
      const validation = validateMappedRow(row, duplicates);
      const status = duplicates.has(row._dupeKey)
        ? 'duplicate'
        : validation.valid
          ? 'valid'
          : 'error';
      return {
        ...row,
        _errors: validation.errors,
        _fieldErrors: validation.fieldErrors,
        _valid: validation.valid,
        _status: status
      };
    });
    const validCount = validated.filter((row) => row._valid).length;
    return { rows: validated, validCount, invalidCount: validated.length - validCount };
  }

  function updateBulkCell(index, field, value) {
    setBulkRows((prev) => {
      const next = prev.map((row, rowIndex) => {
        if (rowIndex !== index) return row;
        const updated = { ...row, [field]: value };
        const cleaned = normalizeMappedRow(updated, rowIndex);
        cleaned._index = row._index;
        cleaned._dupeKey = `${normalize(cleaned.fullName)}|${normalize(cleaned.classId || `${cleaned.className}-${cleaned.arm}-${cleaned.institution}`)}`;
        return cleaned;
      });

      const dupeMap = new Map();
      next.forEach((row) => {
        const count = dupeMap.get(row._dupeKey) || 0;
        dupeMap.set(row._dupeKey, count + 1);
      });
      const duplicates = new Set(
        [...dupeMap.entries()].filter(([, count]) => count > 1).map(([key]) => key)
      );
      const refreshed = refreshBulkValidation(next, duplicates);
      setBulkDuplicates(duplicates);
      setBulkValidation({ valid: refreshed.validCount, invalid: refreshed.invalidCount });
      return refreshed.rows;
    });
  }

  function updateBulkDecision(index, decision) {
    setBulkRows((prev) =>
      prev.map((row, rowIndex) => (rowIndex === index ? { ...row, _decision: decision } : row))
    );
  }

  function deleteBulkRow(index) {
    setBulkRows((prev) => {
      const next = prev.filter((_, rowIndex) => rowIndex !== index);
      const dupeMap = new Map();
      next.forEach((row) => {
        const count = dupeMap.get(row._dupeKey) || 0;
        dupeMap.set(row._dupeKey, count + 1);
      });
      const duplicates = new Set(
        [...dupeMap.entries()].filter(([, count]) => count > 1).map(([key]) => key)
      );
      const refreshed = refreshBulkValidation(next, duplicates);
      setBulkDuplicates(duplicates);
      setBulkValidation({ valid: refreshed.validCount, invalid: refreshed.invalidCount });
      return refreshed.rows;
    });
  }

  async function loadBulkFile(file) {
    setError('');
    setSuccess('');
    setImportErrors([]);
    setBulkCredentials([]);
    if (!file) return;

    const name = file.name.toLowerCase();
    let parsed = { headers: [], rows: [], error: '' };

    if (name.endsWith('.csv')) {
      const text = await file.text();
      parsed = parseCsvWithPapa(text);
    } else if (name.endsWith('.xlsx')) {
      const buffer = await file.arrayBuffer();
      parsed = await parseExcelBuffer(buffer);
    } else {
      setError('Only CSV or Excel (.xlsx) files are supported.');
      return;
    }

    if (parsed.error) {
      setError(parsed.error);
      return;
    }

    const headerCounts = {};
    const headers = parsed.headers.map((header, index) => {
      const base = cleanText(header) || `Column ${index + 1}`;
      const count = (headerCounts[base] || 0) + 1;
      headerCounts[base] = count;
      return count > 1 ? `${base} (${count})` : base;
    });
    const mapping = buildDefaultMapping(headers);
    setBulkHeaders(headers);
    setBulkMapping(mapping);
    setBulkRawRows(parsed.rows);
    setBulkSelected(new Set());
    setBulkStep('mapping');
  }

  function applyBulkMapping() {
    if (!bulkHeaders.length || !bulkRawRows.length) return;
    const { rows, duplicates } = buildBulkRowsFromMapping(bulkHeaders, bulkRawRows, bulkMapping);
    const validCount = rows.filter((row) => row._valid).length;
    setBulkRows(rows);
    setBulkDuplicates(duplicates);
    setBulkValidation({ valid: validCount, invalid: rows.length - validCount });
    setBulkSelected(new Set());
    setBulkStep('review');
  }

  function handleBulkPick(event) {
    const file = event.target.files?.[0] || null;
    setBulkFile(file);
    if (file) {
      void loadBulkFile(file);
    }
  }

  function handleBulkDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0] || null;
    setBulkFile(file);
    if (file) {
      void loadBulkFile(file);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setLastCredentials([]);
    setCreatingStudent(true);

    try {
      const validationError = validateStudentRegistration(form);
      if (validationError) {
        throw new Error(validationError);
      }

      const data = await apiJson(`${managementBase}/students`, {
        method: 'POST',
        body: buildStudentRegistrationRequest(form)
      });

      setForm((prev) => ({
        ...prev,
        fullName: '',
        studentEmail: '',
        guardianName: '',
        guardianPhone: '',
        guardianEmail: ''
      }));
      setStudents((prev) => [data.student, ...prev]);
      setLastCredentials(data.credentials || []);
      setSuccess(data.message || 'Student and parent portal access were provisioned.');
    } catch (err) {
      setError(err.message || 'Unable to create student.');
    } finally {
      setCreatingStudent(false);
    }
  }

  function startEdit(student) {
    setEditingId(student.id);
    setEditForm({
      fullName: student.fullName,
      classId: student.classId || classes[0]?.id || '',
      studentEmail: student.studentEmail || student.portalEmail || '',
      guardianName: student.guardianName || '',
      guardianPhone: student.guardianPhone || '',
      guardianEmail: student.guardianEmail || ''
    });
  }

  function cancelEdit() {
    setEditingId('');
  }

  async function handleUpdate(studentId) {
    setError('');
    setSuccess('');
    setLastCredentials([]);
    setSavingStudentId(studentId);

    try {
      const validationError = validateStudentRegistration(editForm);
      if (validationError) {
        throw new Error(validationError);
      }

      const data = await apiJson(`${managementBase}/students/${studentId}`, {
        method: 'PUT',
        body: buildStudentRegistrationRequest(editForm)
      });

      setStudents((prev) => prev.map((item) => (item.id === studentId ? data.student : item)));
      setEditingId('');
      setLastCredentials(data.credentials || []);
      setSuccess(data.message || 'Student record updated successfully.');
    } catch (err) {
      setError(err.message || 'Unable to update student.');
    } finally {
      setSavingStudentId('');
    }
  }

  async function handleDelete(studentId) {
    setError('');
    setSuccess('');
    setLastCredentials([]);
    setDeletingStudentId(studentId);

    try {
      await apiJson(`${managementBase}/students/${studentId}`, { method: 'DELETE' });

      setStudents((prev) => prev.filter((item) => item.id !== studentId));
      if (editingId === studentId) setEditingId('');
      setSuccess('Student record deleted successfully.');
    } catch (err) {
      setError(err.message || 'Unable to delete student.');
    } finally {
      setDeletingStudentId('');
    }
  }

  async function handleBulkUpload(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setImportErrors([]);
    setBulkCredentials([]);
    setBulkUploading(true);

    try {
      if (!bulkRows.length) {
        throw new Error('No cleaned rows available to upload.');
      }

      const approvedRows = bulkRows.filter((row) => row._decision === 'approved');
      if (!approvedRows.length) {
        throw new Error('Approve at least one valid row before uploading.');
      }

      const payload = approvedRows.map((row) =>
        buildStudentRegistrationRequest({
          fullName: row.fullName,
          classId: row.classId,
          level: row.level,
          institution: row.institution,
          studentEmail: row.studentEmail,
          guardianName: row.guardianName,
          guardianPhone: row.guardianPhone,
          guardianEmail: row.guardianEmail
        })
      );

      const approvedCount = approvedRows.length;
      if (!window.confirm(`You are about to approve ${approvedCount} students. Continue?`)) {
        setBulkUploading(false);
        return;
      }

      const data = await apiJson(`${managementBase}/students/bulk`, {
        method: 'POST',
        body: { students: payload }
      });

      if (Array.isArray(data.created) && data.created.length) {
        setStudents((prev) => [...data.created, ...prev]);
      }

      setImportErrors(data.errors || []);
      setBulkCredentials(data.credentials || []);
      setSuccess(data.message || `Bulk import completed. Created: ${data.createdCount || 0}, Errors: ${data.errorCount || 0}.`);
      try {
        await apiJson(`${managementBase}/system/refresh`, { method: 'POST' });
      } catch {
        // ignore refresh failures
      }
      try {
        const historyItem = {
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          fileName: bulkFile?.name || 'upload',
          totalRows: bulkRows.length,
          approvedRows: approvedRows.length,
          validRows: bulkValidation.valid,
          invalidRows: bulkValidation.invalid,
          duplicateRows: bulkDuplicates.size,
          rows: buildReportRows(bulkRows).slice(0, 500)
        };
        try {
          const response = await apiJson(`${managementBase}/bulk-uploads/students`, {
            method: 'POST',
            body: {
              fileName: historyItem.fileName,
              totalRows: historyItem.totalRows,
              approvedRows: historyItem.approvedRows,
              validRows: historyItem.validRows,
              invalidRows: historyItem.invalidRows,
              duplicateRows: historyItem.duplicateRows,
              rows: historyItem.rows
            }
          });
          if (response?.upload) {
            const nextHistory = [response.upload, ...bulkHistory].slice(0, 25);
            setBulkHistory(nextHistory);
            localStorage.setItem('attaufiq.bulkStudentHistory', JSON.stringify(nextHistory));
          }
        } catch {
          const nextHistory = [historyItem, ...bulkHistory].slice(0, 25);
          setBulkHistory(nextHistory);
          localStorage.setItem('attaufiq.bulkStudentHistory', JSON.stringify(nextHistory));
        }
      } catch {
        // ignore history persistence issues
      }
      setBulkFile(null);
      setBulkStep('upload');
      setBulkRows([]);
      setBulkRawRows([]);
      setBulkHeaders([]);
      setBulkMapping({});
      setBulkValidation({ valid: 0, invalid: 0 });
      setBulkDuplicates(new Set());
      setBulkSelected(new Set());
      setBulkFilter('all');
      setBulkSearch('');
    } catch (err) {
      setError(err.message || 'Unable to process document upload.');
    } finally {
      setBulkUploading(false);
    }
  }

  function toggleClassRoster(classId) {
    setExpandedClasses((prev) => ({ ...prev, [classId]: !prev[classId] }));
  }

  const previewRows = useMemo(
    () => bulkRawRows.slice(0, bulkPreviewCount),
    [bulkPreviewCount, bulkRawRows]
  );
  const invalidBulkRows = useMemo(() => bulkRows.filter((row) => !row._valid), [bulkRows]);
  const filteredBulkRows = useMemo(() => {
    const query = bulkSearch.trim().toLowerCase();
    return bulkRows.filter((row) => {
      if (bulkFilter === 'valid' && row._status !== 'valid') return false;
      if (bulkFilter === 'error' && row._status !== 'error') return false;
      if (bulkFilter === 'duplicate' && row._status !== 'duplicate') return false;
      if (bulkFilter === 'approved' && row._decision !== 'approved') return false;
      if (bulkFilter === 'rejected' && row._decision !== 'rejected') return false;
      if (!query) return true;
      const haystack = `${row.fullName} ${row.className} ${row.arm} ${row.classId} ${row.guardianName} ${row.guardianEmail} ${row.studentEmail}`
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [bulkFilter, bulkRows, bulkSearch]);
  const summaryTotals = useMemo(() => {
    const total = bulkRows.length;
    const valid = bulkRows.filter((row) => row._status === 'valid').length;
    const errors = bulkRows.filter((row) => row._status === 'error').length;
    const duplicates = bulkRows.filter((row) => row._status === 'duplicate').length;
    return { total, valid, errors, duplicates };
  }, [bulkRows]);
  const defaulterIdSet = useMemo(() => new Set(defaulterIds), [defaulterIds]);
  const filteredStudents = useMemo(
    () =>
      students.filter((item) => {
        const byInstitution = institutionFilter === 'all'
          ? true
          : canonicalInstitution(item.institution) === canonicalInstitution(institutionFilter);
        const byClass = classFilter ? item.classId === classFilter : true;
        const statusValue = normalizeStatus(item.accountStatus);
        const byStatus = statusFilter === 'all' ? true : statusValue === statusFilter;
        const isOutstanding = defaulterIdSet.has(item.id);
        const byFees =
          feesFilter === 'all'
            ? true
            : feesFilter === 'outstanding'
              ? isOutstanding
              : !isOutstanding;
        const query = debouncedSearch.trim().toLowerCase();
        const studentCode = buildStudentCode(item);
        const searchable = `${item.fullName} ${studentCode} ${item.classLabel || ''} ${item.portalEmail || ''} ${item.parentPortalEmail || ''} ${item.guardianEmail || ''}`.toLowerCase();
        const bySearch = !query || searchable.includes(query);
        return byInstitution && byClass && byStatus && byFees && bySearch;
      }),
    [classFilter, debouncedSearch, defaulterIdSet, feesFilter, institutionFilter, statusFilter, students]
  );

  const activeStudents = useMemo(
    () => sortStudents(filteredStudents.filter((item) => isCountableActiveStudent(item)), sortBy),
    [filteredStudents, sortBy]
  );

  const inactiveStudents = useMemo(
    () => sortStudents(filteredStudents.filter((item) => isInactiveStudent(item)), sortBy),
    [filteredStudents, sortBy]
  );

  const graduatedStudents = useMemo(
    () => sortStudents(filteredStudents.filter((item) => isGraduatedStudent(item)), sortBy),
    [filteredStudents, sortBy]
  );
  const filteredGraduatedStudents = useMemo(() => {
    const query = debouncedGraduatedSearch.trim().toLowerCase();
    return graduatedStudents.filter((student) => {
      if (!query) return true;
      const searchable = `${student.fullName} ${buildStudentCode(student)} ${student.classLabel || ''} ${student.portalEmail || ''} ${student.guardianEmail || ''}`
        .toLowerCase();
      return searchable.includes(query);
    });
  }, [debouncedGraduatedSearch, graduatedStudents]);

  const groupedRosters = useMemo(
    () =>
      ADMIN_INSTITUTIONS.filter((institution) => {
        if (institutionFilter === 'all') return true;
        return canonicalInstitution(institutionFilter) === canonicalInstitution(institution);
      }).map((institution) => {
        const classQuery = debouncedClassSearch.trim().toLowerCase();
        const institutionClasses = classes
          .filter((item) => canonicalInstitution(item.institution) === canonicalInstitution(institution))
          .filter((item) => {
            if (!classQuery) return true;
            return `${item.name} ${item.arm}`.toLowerCase().includes(classQuery);
          })
          .sort((a, b) => `${a.name} ${a.arm}`.localeCompare(`${b.name} ${b.arm}`))
          .map((classItem) => ({
            ...classItem,
            students: activeStudents
              .filter((student) => student.classId === classItem.id)
              .sort((a, b) => {
                if (sortBy === 'created-desc') {
                  return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
                }
                if (sortBy === 'created-asc') {
                  return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
                }
                return a.fullName.localeCompare(b.fullName);
              })
          }));

        return { institution, classes: institutionClasses };
      }),
    [classes, activeStudents, debouncedClassSearch, institutionFilter, sortBy]
  );

  return (
    <PortalLayout
      role={resolvedRole}
      title="Student Roster Control"
      subtitle="Students are now grouped under their own classes, with live counts for each ATTAUFEEQ Model Academy and Madrasa section."
    >
      <div className="grid gap-4 lg:grid-cols-4">
        {ADMIN_INSTITUTIONS.map((institution) => {
          const count = students
            .filter((item) => canonicalInstitution(item.institution) === canonicalInstitution(institution))
            .filter((item) => isCountableActiveStudent(item)).length;
          return (
            <article key={institution} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${institutionAccent(institution)}`}>
                {institution}
              </p>
              <p className="mt-4 text-3xl font-bold text-slate-900">{count}</p>
              <p className="mt-2 text-sm text-slate-600">Active students currently enrolled in this institution.</p>
            </article>
          );
        })}
        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="inline-flex rounded-full border px-3 py-1 text-xs font-semibold border-slate-300 text-slate-700">
            Inactive
          </p>
          <p className="mt-4 text-3xl font-bold text-slate-900">{inactiveStudents.length}</p>
          <p className="mt-2 text-sm text-slate-600">Students temporarily disabled from active portal and class workflows.</p>
        </article>
        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="inline-flex rounded-full border px-3 py-1 text-xs font-semibold border-amber-200 text-amber-700">
            Graduated
          </p>
          <p className="mt-4 text-3xl font-bold text-slate-900">{graduatedStudents.length}</p>
          <p className="mt-2 text-sm text-slate-600">Students marked as graduated in the ledger.</p>
        </article>
      </div>

      <section className="mt-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-heading text-2xl text-primary">Single Student Entry</h2>
        <form onSubmit={handleSubmit} className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="sm:col-span-2 xl:col-span-3 flex flex-wrap gap-2">
            {ADMIN_INSTITUTIONS.map((institution) => (
              <button
                key={institution}
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, institution }))}
                className={`rounded-full border px-4 py-2 text-xs font-semibold ${
                  canonicalInstitution(form.institution) === canonicalInstitution(institution)
                    ? institutionAccent(institution)
                    : 'border-slate-300 bg-white text-slate-700'
                }`}
              >
                {institution}
              </button>
            ))}
          </div>
          <input
            required
            value={form.fullName}
            onChange={(e) => setForm((prev) => ({ ...prev, fullName: e.target.value }))}
            placeholder="Full name"
            className="rounded-2xl border border-slate-300 px-4 py-3 text-sm"
          />
          <input
            type="email"
            value={form.studentEmail}
            onChange={(e) => setForm((prev) => ({ ...prev, studentEmail: e.target.value }))}
            placeholder="Student portal email (optional, for direct student delivery)"
            className="rounded-2xl border border-slate-300 px-4 py-3 text-sm"
          />
          {entryClasses.length ? (
            <select
              required
              value={form.classId}
              onChange={(e) => setForm((prev) => ({ ...prev, classId: e.target.value }))}
              className="rounded-2xl border border-slate-300 px-4 py-3 text-sm"
            >
              {entryClasses.map((classItem) => (
                <option key={classItem.id} value={classItem.id}>
                  {classItem.name} {classItem.arm} - {classItem.institution}
                </option>
              ))}
            </select>
          ) : (
            <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Add a class in this institution before registering students.
            </p>
          )}
          <input
            required
            value={form.guardianName}
            onChange={(e) => setForm((prev) => ({ ...prev, guardianName: e.target.value }))}
            placeholder="Parent / guardian name"
            className="rounded-2xl border border-slate-300 px-4 py-3 text-sm"
          />
          <input
            value={form.guardianPhone}
            onChange={(e) => setForm((prev) => ({ ...prev, guardianPhone: e.target.value }))}
            placeholder="Parent / guardian phone"
            className="rounded-2xl border border-slate-300 px-4 py-3 text-sm"
          />
          <input
            type="email"
            required
            value={form.guardianEmail}
            onChange={(e) => setForm((prev) => ({ ...prev, guardianEmail: e.target.value }))}
            placeholder="Parent / guardian email"
            className="rounded-2xl border border-slate-300 px-4 py-3 text-sm"
          />
          <p className="text-xs text-slate-500 sm:col-span-2 xl:col-span-3">
            Guardian name and guardian email are required so the parent portal is provisioned and delivered automatically. Add a student email too if the student should receive their own copy directly.
          </p>
          <button
            type="submit"
            disabled={creatingStudent || !canCreateStudent}
            className="rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {creatingStudent ? 'Adding Student...' : 'Add Student'}
          </button>
        </form>
      </section>

      <section className="mt-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-2xl text-primary">Bulk Upload (CSV / Excel)</h2>
            <p className="mt-2 text-sm text-slate-600">
              Upload messy spreadsheets, clean them automatically, map columns, fix errors, and confirm import in one flow.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href="/bulk_students_template.csv?v=2"
              download="bulk_students_template.csv"
              className="rounded-2xl border border-slate-300 px-4 py-3 text-xs font-semibold text-slate-700"
            >
              Download CSV Template
            </a>
            <a
              href="/bulk_students_template.xlsx?v=2"
              download="bulk_students_template.xlsx"
              className="rounded-2xl border border-slate-300 px-4 py-3 text-xs font-semibold text-slate-700"
            >
              Download Excel Template
            </a>
            <button
              type="button"
              disabled={!bulkCredentials.length}
              onClick={downloadBulkCredentials}
              className="rounded-2xl border border-emerald-300 px-4 py-3 text-xs font-semibold text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Download Credentials
            </button>
            <button
              type="button"
              disabled={!bulkRows.length && !importErrors.length}
              onClick={downloadImportErrors}
              className="rounded-2xl border border-red-300 px-4 py-3 text-xs font-semibold text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Export Error Rows
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          {['Upload file', 'Preview & map', 'Fix errors', 'Confirm upload'].map((label, index) => {
            const stepKey = ['upload', 'mapping', 'review', 'confirm'][index];
            const isActive = bulkStep === stepKey;
            const isDone = ['upload', 'mapping', 'review', 'confirm'].indexOf(bulkStep) > index;
            return (
              <div
                key={label}
                className={`rounded-2xl border px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] ${
                  isActive ? 'border-primary bg-emerald-50 text-primary' : isDone ? 'border-emerald-200 bg-emerald-50/60 text-emerald-700' : 'border-slate-200 text-slate-500'
                }`}
              >
                {label}
              </div>
            );
          })}
        </div>

        {bulkStep === 'upload' && (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleBulkDrop}
              className={`flex min-h-[180px] flex-col items-center justify-center rounded-3xl border-2 border-dashed px-6 py-8 text-center ${
                dragActive ? 'border-primary bg-emerald-50' : 'border-slate-200 bg-slate-50'
              }`}
            >
              <p className="text-sm font-semibold text-slate-700">Drag & drop a CSV or Excel file here</p>
              <p className="mt-2 text-xs text-slate-500">We auto-clean quotes, commas, and broken rows.</p>
              <label className="mt-4 inline-flex cursor-pointer rounded-2xl bg-primary px-4 py-2 text-xs font-semibold text-white">
                Choose file
                <input
                  type="file"
                  accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={handleBulkPick}
                  className="hidden"
                />
              </label>
              {bulkFile && (
                <p className="mt-3 text-xs text-slate-600">
                  Selected: <span className="font-semibold">{bulkFile.name}</span>
                </p>
              )}
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-5">
              <h3 className="text-sm font-semibold text-slate-800">Upload tips</h3>
              <ul className="mt-3 list-disc pl-5 text-xs text-slate-600">
                <li>Supported headers include `fullName`, `className`, `arm`, `guardianEmail`.</li>
                <li>Extra commas or broken quotes are auto-fixed where possible.</li>
                <li>Missing institution defaults to {bulkDefaults.defaultInstitution}.</li>
              </ul>
              <div className="mt-4 grid gap-2 text-xs text-slate-600">
                <label className="flex flex-col gap-1">
                  Default institution
                  <select
                    value={bulkDefaults.defaultInstitution}
                    onChange={(event) =>
                      setBulkDefaults((prev) => ({ ...prev, defaultInstitution: event.target.value }))
                    }
                    className="rounded-xl border border-slate-300 px-3 py-2 text-xs"
                  >
                    {ADMIN_INSTITUTIONS.map((inst) => (
                      <option key={inst} value={inst}>
                        {inst}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  Email domain
                  <input
                    value={bulkDefaults.emailDomain}
                    onChange={(event) =>
                      setBulkDefaults((prev) => ({ ...prev, emailDomain: event.target.value }))}
                    className="rounded-xl border border-slate-300 px-3 py-2 text-xs"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  Student ID prefix
                  <input
                    value={bulkDefaults.idPrefix}
                    onChange={(event) =>
                      setBulkDefaults((prev) => ({ ...prev, idPrefix: event.target.value }))}
                    className="rounded-xl border border-slate-300 px-3 py-2 text-xs"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  Default arm
                  <input
                    value={bulkDefaults.defaultArm}
                    onChange={(event) =>
                      setBulkDefaults((prev) => ({ ...prev, defaultArm: event.target.value }))}
                    className="rounded-xl border border-slate-300 px-3 py-2 text-xs"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  Password rule
                  <select
                    value={bulkDefaults.passwordMode}
                    onChange={(event) =>
                      setBulkDefaults((prev) => ({ ...prev, passwordMode: event.target.value }))}
                    className="rounded-xl border border-slate-300 px-3 py-2 text-xs"
                  >
                    <option value="random">Random secure</option>
                    <option value="phone">Guardian phone</option>
                  </select>
                </label>
              </div>
              <button
                type="button"
                onClick={() => bulkFile && loadBulkFile(bulkFile)}
                disabled={!bulkFile}
                className="mt-4 rounded-2xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Preview file
              </button>
            </div>
          </div>
        )}

              {bulkStep === 'mapping' && (
                <div className="mt-5 space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Map uploaded columns to the correct student fields. We auto-detected suggestions — review before continuing.
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              {bulkHeaders.map((header, index) => (
                <div key={`${header}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Column</p>
                  <p className="mt-2 text-sm font-semibold text-slate-800">{header || `Column ${index + 1}`}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    Sample: {previewRows[0]?.[index] ? cleanCell(previewRows[0][index]) : '—'}
                  </p>
                  <select
                    value={bulkMapping[header] || ''}
                    onChange={(event) =>
                      setBulkMapping((prev) => ({ ...prev, [header]: event.target.value }))
                    }
                    className="mt-3 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="">Ignore column</option>
                    {IMPORT_FIELDS.map((field) => (
                      <option key={field.key} value={field.key}>
                        {field.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="mt-4 overflow-x-auto rounded-3xl border border-slate-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    {bulkHeaders.map((header, index) => (
                      <th key={`${header}-head-${index}`} className="px-4 py-3 font-semibold text-slate-600">
                        {header || `Column ${index + 1}`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, rowIndex) => (
                    <tr key={`preview-${rowIndex}`} className="border-t border-slate-100">
                      {bulkHeaders.map((_, colIndex) => (
                        <td key={`preview-${rowIndex}-${colIndex}`} className="px-4 py-3 text-slate-700">
                          {cleanCell(row[colIndex])}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {!previewRows.length && (
                    <tr>
                      <td colSpan={bulkHeaders.length} className="px-4 py-4 text-sm text-slate-600">
                        No preview rows available.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setBulkStep('upload')}
                      className="rounded-2xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={applyBulkMapping}
                      className="rounded-2xl bg-primary px-4 py-2 text-xs font-semibold text-white"
                    >
                      Apply Mapping & Clean
                    </button>
                  </div>
                </div>
              )}

        {bulkStep === 'review' && (
          <div className="mt-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <span>{bulkValidation.valid} valid rows</span>
              <span>{bulkValidation.invalid} invalid rows</span>
              {bulkDuplicates.size > 0 && <span>{bulkDuplicates.size} duplicates detected</span>}
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <article className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs uppercase text-slate-500">Total Rows</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">{summaryTotals.total}</p>
              </article>
              <article className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
                <p className="text-xs uppercase text-emerald-700">Valid</p>
                <p className="mt-2 text-2xl font-bold text-emerald-900">{summaryTotals.valid}</p>
              </article>
              <article className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4">
                <p className="text-xs uppercase text-rose-700">Errors</p>
                <p className="mt-2 text-2xl font-bold text-rose-900">{summaryTotals.errors}</p>
              </article>
              <article className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                <p className="text-xs uppercase text-amber-700">Duplicates</p>
                <p className="mt-2 text-2xl font-bold text-amber-900">{summaryTotals.duplicates}</p>
              </article>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
              Auto-fixes applied: trimmed spaces, corrected quotes, normalized emails, inferred class arms.
            </div>
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              <input
                value={bulkSearch}
                onChange={(event) => setBulkSearch(event.target.value)}
                placeholder="Search uploaded data"
                className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-xs"
              />
              <select
                value={bulkFilter}
                onChange={(event) => setBulkFilter(event.target.value)}
                className="rounded-xl border border-slate-300 px-3 py-2 text-xs"
              >
                <option value="all">All rows</option>
                <option value="valid">Valid only</option>
                <option value="error">Errors only</option>
                <option value="duplicate">Duplicates only</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
              <button
                type="button"
                onClick={() => {
                  setBulkSearch('');
                  setBulkFilter('all');
                }}
                className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600"
              >
                Clear filters
              </button>
            </div>

            <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="px-3 py-2 font-semibold text-slate-600">
                      <input
                        type="checkbox"
                        checked={filteredBulkRows.length > 0 && bulkSelected.size === filteredBulkRows.length}
                        onChange={(event) => {
                          if (event.target.checked) {
                            setBulkSelected(new Set(filteredBulkRows.map((row) => bulkRows.indexOf(row))));
                          } else {
                            setBulkSelected(new Set());
                          }
                        }}
                      />
                    </th>
                    <th className="px-3 py-2 font-semibold text-slate-600">#</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Status</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Decision</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Full Name</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Class Name</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Arm</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Class ID</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Institution</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Student Email</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Student ID</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Username</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Auto Data</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Guardian Name</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Guardian Phone</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Guardian Email</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Errors</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBulkRows.map((row, index) => {
                    const statusColor =
                      row._status === 'valid'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : row._status === 'duplicate'
                          ? 'border-amber-200 bg-amber-50 text-amber-700'
                          : 'border-rose-200 bg-rose-50 text-rose-700';
                    const originalIndex = bulkRows.indexOf(row);
                    return (
                    <tr key={`bulk-row-${row._index}-${index}`} className={`border-t border-slate-100 ${row._valid ? 'bg-white' : 'bg-rose-50/40'}`}>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={bulkSelected.has(originalIndex)}
                          onChange={(event) => {
                            setBulkSelected((prev) => {
                              const next = new Set(prev);
                              if (event.target.checked) {
                                next.add(originalIndex);
                              } else {
                                next.delete(originalIndex);
                              }
                              return next;
                            });
                          }}
                        />
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500">{row._index}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${statusColor}`}>
                          {row._status}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="rounded-full border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600">
                          {row._decision || 'pending'}
                        </span>
                      </td>
                      {['fullName', 'className', 'arm', 'classId', 'institution', 'studentEmail', 'studentId', 'username'].map((field) => (
                        <td key={`${index}-${field}`} className="px-3 py-2">
                          <input
                            value={row[field] || ''}
                            onChange={(event) => updateBulkCell(originalIndex, field, event.target.value)}
                            className={`w-full rounded-md border px-2 py-1 text-xs ${row._fieldErrors?.[field] ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-slate-200'}`}
                          />
                        </td>
                      ))}
                      <td className="px-3 py-2 text-[11px] text-slate-500">
                        {(row._autoGenerated || []).join(', ') || '—'}
                      </td>
                      {['guardianName', 'guardianPhone', 'guardianEmail'].map((field) => (
                        <td key={`${index}-${field}`} className="px-3 py-2">
                          <input
                            value={row[field] || ''}
                            onChange={(event) => updateBulkCell(originalIndex, field, event.target.value)}
                            className={`w-full rounded-md border px-2 py-1 text-xs ${row._fieldErrors?.[field] ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-slate-200'}`}
                          />
                        </td>
                      ))}
                      <td className="px-3 py-2 text-xs text-rose-700">
                        {(row._errors || []).join(' • ')}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => updateBulkDecision(originalIndex, 'approved')}
                            className="rounded-md border border-emerald-300 px-2 py-1 text-[11px] font-semibold text-emerald-700"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => updateBulkDecision(originalIndex, 'rejected')}
                            className="rounded-md border border-rose-300 px-2 py-1 text-[11px] font-semibold text-rose-700"
                          >
                            Reject
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteBulkRow(originalIndex)}
                            className="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );})}
                  {!bulkRows.length && (
                    <tr>
                      <td colSpan={17} className="px-4 py-4 text-sm text-slate-600">
                        No cleaned rows available.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="sticky bottom-4 z-10 flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
              <button
                type="button"
                disabled={bulkSelected.size === 0}
                onClick={() => {
                  const selected = new Set(bulkSelected);
                  const next = bulkRows.map((row, idx) =>
                    selected.has(idx) ? { ...row, _decision: 'approved' } : row
                  );
                  setBulkRows(next);
                }}
                className="rounded-2xl border border-emerald-300 px-4 py-2 text-xs font-semibold text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Approve Selected
              </button>
              <button
                type="button"
                disabled={bulkSelected.size === 0}
                onClick={() => {
                  const selected = new Set(bulkSelected);
                  const next = bulkRows.map((row, idx) =>
                    selected.has(idx) ? { ...row, _decision: 'rejected' } : row
                  );
                  setBulkRows(next);
                }}
                className="rounded-2xl border border-rose-300 px-4 py-2 text-xs font-semibold text-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Reject Selected
              </button>
              <button
                type="button"
                disabled={bulkSelected.size === 0}
                onClick={() => {
                  const selected = new Set(bulkSelected);
                  const next = bulkRows.filter((_, idx) => !selected.has(idx));
                  setBulkSelected(new Set());
                  const dupeMap = new Map();
                  next.forEach((row) => {
                    const count = dupeMap.get(row._dupeKey) || 0;
                    dupeMap.set(row._dupeKey, count + 1);
                  });
                  const duplicates = new Set(
                    [...dupeMap.entries()].filter(([, count]) => count > 1).map(([key]) => key)
                  );
                  const refreshed = refreshBulkValidation(next, duplicates);
                  setBulkDuplicates(duplicates);
                  setBulkValidation({ valid: refreshed.validCount, invalid: refreshed.invalidCount });
                  setBulkRows(refreshed.rows);
                }}
                className="rounded-2xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Delete Selected
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = bulkRows.map((row) =>
                    row._status === 'valid'
                      ? { ...row, _decision: 'approved' }
                      : { ...row, _decision: row._decision }
                  );
                  setBulkRows(next);
                }}
                className="rounded-2xl border border-emerald-300 px-4 py-2 text-xs font-semibold text-emerald-700"
              >
                Approve All Valid
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = bulkRows.map((row) =>
                    row._status === 'error'
                      ? { ...row, _decision: 'rejected' }
                      : { ...row, _decision: row._decision }
                  );
                  setBulkRows(next);
                }}
                className="rounded-2xl border border-rose-300 px-4 py-2 text-xs font-semibold text-rose-700"
              >
                Reject All Errors
              </button>
              <button
                type="button"
                onClick={() => setBulkFilter('duplicate')}
                className="rounded-2xl border border-amber-300 px-4 py-2 text-xs font-semibold text-amber-700"
              >
                Review Duplicates
              </button>
              <button
                type="button"
                onClick={() => downloadBulkReport('all')}
                className="rounded-2xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700"
              >
                Download Full Report
              </button>
              <button
                type="button"
                onClick={() => downloadBulkReport('errors')}
                className="rounded-2xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700"
              >
                Download Errors
              </button>
              <button
                type="button"
                onClick={() => downloadBulkReport('success')}
                className="rounded-2xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700"
              >
                Download Successful
              </button>
              <button
                type="button"
                onClick={() => setBulkStep('confirm')}
                className="rounded-2xl bg-primary px-4 py-2 text-xs font-semibold text-white"
              >
                Continue to Confirm
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setBulkStep('mapping')}
                className="rounded-2xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700"
              >
                Back to Mapping
              </button>
            </div>
          </div>
        )}

        {bulkStep === 'confirm' && (
          <form onSubmit={handleBulkUpload} className="mt-5 space-y-3">
            <div className="rounded-2xl border border-slate-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              Ready to upload {bulkRows.filter((row) => row._decision === 'approved').length} approved rows.
            </div>
            {invalidBulkRows.length > 0 && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
                {invalidBulkRows.length} rows are still invalid. Fix them if you want 100% success.
              </div>
            )}
            <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
              <button
                type="button"
                onClick={() => {
                  const next = bulkRows.map((row) =>
                    row._status === 'valid'
                      ? { ...row, _decision: 'approved' }
                      : { ...row, _decision: row._decision }
                  );
                  setBulkRows(next);
                }}
                className="rounded-2xl border border-emerald-300 px-3 py-2 text-xs font-semibold text-emerald-700"
              >
                Approve All Valid
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = bulkRows.map((row) =>
                    row._status === 'error'
                      ? { ...row, _decision: 'rejected' }
                      : { ...row, _decision: row._decision }
                  );
                  setBulkRows(next);
                }}
                className="rounded-2xl border border-rose-300 px-3 py-2 text-xs font-semibold text-rose-700"
              >
                Reject All Errors
              </button>
              <button
                type="button"
                onClick={() => setBulkFilter('duplicate')}
                className="rounded-2xl border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-700"
              >
                Review Duplicates
              </button>
              <button
                type="button"
                onClick={() => downloadBulkReport('all')}
                className="rounded-2xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"
              >
                Download Full Report
              </button>
              <button
                type="button"
                onClick={() => downloadBulkReport('errors')}
                className="rounded-2xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"
              >
                Download Errors
              </button>
              <button
                type="button"
                onClick={() => downloadBulkReport('success')}
                className="rounded-2xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"
              >
                Download Successful
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setBulkStep('review')}
                className="rounded-2xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700"
              >
                Back to Fixes
              </button>
              <button
                type="submit"
                disabled={bulkUploading || bulkRows.filter((row) => row._decision === 'approved').length === 0}
                className="rounded-2xl bg-primary px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {bulkUploading ? 'Uploading...' : 'Confirm Upload'}
              </button>
              <button
                type="button"
                onClick={resetBulkState}
                className="rounded-2xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700"
              >
                Start Over
              </button>
            </div>
          </form>
        )}

        {bulkHistory.length > 0 && (
          <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-800">Upload History</h3>
              <button
                type="button"
                onClick={clearBulkHistory}
                className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700"
              >
                Clear History
              </button>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {bulkHistory.map((item) => (
                <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-xs uppercase text-slate-500">{new Date(item.createdAt).toLocaleString()}</p>
                  <p className="mt-2 text-sm font-semibold text-slate-800">{item.fileName}</p>
                  <div className="mt-2 text-xs text-slate-600">
                    <p>Total: {item.totalRows}</p>
                    <p>Approved: {item.approvedRows}</p>
                    <p>Valid: {item.validRows}</p>
                    <p>Errors: {item.invalidRows}</p>
                    <p>Duplicates: {item.duplicateRows}</p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => restoreHistoryItem(item)}
                      className="rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700"
                    >
                      Reopen
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const rows = item.rows || [];
                        if (!rows.length) return;
                        downloadCsv(
                          `students-upload-history-${item.id}.csv`,
                          ['rowIndex', 'status', 'decision', 'error', 'autoGenerated', 'fullName', 'classId', 'className', 'arm', 'institution', 'studentEmail', 'studentId', 'username', 'defaultPassword', 'createdAt', 'guardianName', 'guardianPhone', 'guardianEmail'],
                          rows
                        );
                      }}
                      className="rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700"
                    >
                      Download Report
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {loading && <p className="mt-4 text-sm text-slate-600">Loading students...</p>}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {success && <p className="mt-4 text-sm text-emerald-700">{success}</p>}
      <ProvisioningPanel
        title="Student and parent access issued"
        description="Newly provisioned logins are shown here once for controlled handover. Every new account is forced to change password on first sign-in."
        records={lastCredentials}
      />
      <ProvisioningPanel
        title="Bulk import credentials ready"
        description="Bulk-generated credentials are listed here and can also be exported as a CSV sheet for controlled handover."
        records={bulkCredentials}
      />

      <div className="mt-4 grid gap-3 rounded-[28px] border border-slate-200 bg-white p-5 sm:grid-cols-2 xl:grid-cols-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search student"
          className="rounded-2xl border border-slate-300 px-4 py-3 text-sm"
        />
        <input
          value={classSearch}
          onChange={(e) => setClassSearch(e.target.value)}
          placeholder="Search class roster"
          className="rounded-2xl border border-slate-300 px-4 py-3 text-sm"
        />
        <select
          value={institutionFilter}
          onChange={(e) => setInstitutionFilter(e.target.value)}
          className="rounded-2xl border border-slate-300 px-4 py-3 text-sm"
        >
          <option value="all">All Institutions</option>
          {ADMIN_INSTITUTIONS.map((institution) => (
            <option key={institution} value={institution}>
              {institution}
            </option>
          ))}
        </select>
        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          className="rounded-2xl border border-slate-300 px-4 py-3 text-sm"
        >
          <option value="">All Classes</option>
          {classFilterOptions.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} {item.arm} • {item.institution}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-2xl border border-slate-300 px-4 py-3 text-sm"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="provisioned">Provisioned</option>
          <option value="pending">Pending</option>
          <option value="inactive">Inactive</option>
          <option value="graduated">Graduated</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="rounded-2xl border border-slate-300 px-4 py-3 text-sm"
        >
          <option value="name-asc">Sort by name</option>
          <option value="created-desc">Newest added</option>
          <option value="created-asc">Oldest added</option>
        </select>
        <select
          value={feesTerm}
          onChange={(e) => setFeesTerm(e.target.value)}
          className="rounded-2xl border border-slate-300 px-4 py-3 text-sm"
        >
          {['First Term', 'Second Term', 'Third Term'].map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
        <select
          value={feesFilter}
          onChange={(e) => setFeesFilter(e.target.value)}
          className="rounded-2xl border border-slate-300 px-4 py-3 text-sm"
        >
          <option value="all">All Fees Status</option>
          <option value="paid">Paid in full</option>
          <option value="outstanding">Outstanding</option>
        </select>
        <select
          value={feeSessionId}
          onChange={(e) => setFeeSessionId(e.target.value)}
          disabled={!sessions.length}
          className="rounded-2xl border border-slate-300 px-4 py-3 text-sm disabled:cursor-not-allowed disabled:bg-slate-100"
        >
          {!sessions.length && <option value="">No sessions available</option>}
          {sessions.map((session) => (
            <option key={session.id} value={session.id}>
              {session.sessionName} {session.isActive ? '(Active)' : ''}
            </option>
          ))}
        </select>
      </div>
      {(feesLoading || feesError) && (
        <p className={`mt-2 text-xs ${feesError ? 'text-amber-700' : 'text-slate-500'}`}>
          {feesLoading ? 'Loading fee status filter...' : feesError}
        </p>
      )}
      {!feesLoading && !feesError && !sessions.length && (
        <p className="mt-2 text-xs text-amber-700">
          No academic sessions exist yet, so fee status filters are disabled.
        </p>
      )}

      <div className="mt-8 space-y-6">
        {groupedRosters.map((group) => (
          <section key={group.institution} className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-heading text-2xl text-primary">{group.institution}</h2>
                <p className="mt-2 text-sm text-slate-600">Every class shows its own roster and live student count.</p>
              </div>
              <span className={`rounded-full border px-3 py-2 text-xs font-semibold ${institutionAccent(group.institution)}`}>
                {group.classes.reduce((sum, classItem) => sum + classItem.students.length, 0)} active students
              </span>
            </div>

            <div className="mt-5 grid gap-5 xl:grid-cols-2">
              {group.classes.map((classItem) => (
                <article key={classItem.id} className="rounded-3xl border border-slate-200 bg-slate-50/60 p-4">
                  <button
                    type="button"
                    onClick={() => toggleClassRoster(classItem.id)}
                    className="flex w-full items-center justify-between gap-3 text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-lg text-slate-700">
                        {expandedClasses[classItem.id] || classSearch ? '−' : '+'}
                      </span>
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">{classItem.name} {classItem.arm}</h3>
                        <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Class roster</p>
                      </div>
                    </div>
                    <span className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                      {classItem.students.length} students
                    </span>
                  </button>

                  {(expandedClasses[classItem.id] || Boolean(classSearch)) && (
                    <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                      <table className="min-w-full text-sm">
                        <thead className="bg-slate-50 text-left">
                          <tr>
                            <th className="px-4 py-3">Student</th>
                            <th className="px-4 py-3">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {classItem.students.map((student) => (
                            <tr key={student.id} className="border-t border-slate-100">
                              <td className="px-4 py-3">
                                {editingId === student.id ? (
                                  <div className="grid gap-2">
                                    <input
                                      value={editForm.fullName}
                                      onChange={(e) => setEditForm((prev) => ({ ...prev, fullName: e.target.value }))}
                                      className="w-full rounded-xl border border-slate-300 px-3 py-2"
                                    />
                                    <select
                                      value={editForm.classId}
                                      onChange={(e) => setEditForm((prev) => ({ ...prev, classId: e.target.value }))}
                                      className="w-full rounded-xl border border-slate-300 px-3 py-2"
                                    >
                                      {editClasses.map((candidateClass) => (
                                        <option key={candidateClass.id} value={candidateClass.id}>
                                          {candidateClass.name} {candidateClass.arm}
                                        </option>
                                      ))}
                                    </select>
                                    {!editClasses.length && (
                                      <p className="text-xs text-amber-700">
                                        Add a class in this institution before updating this student.
                                      </p>
                                    )}
                                    <input
                                      type="email"
                                      value={editForm.studentEmail}
                                      onChange={(e) => setEditForm((prev) => ({ ...prev, studentEmail: e.target.value }))}
                                      placeholder="Student portal email"
                                      className="w-full rounded-xl border border-slate-300 px-3 py-2"
                                    />
                                    <input
                                      value={editForm.guardianName}
                                      onChange={(e) => setEditForm((prev) => ({ ...prev, guardianName: e.target.value }))}
                                      placeholder="Guardian name"
                                      className="w-full rounded-xl border border-slate-300 px-3 py-2"
                                    />
                                    <input
                                      value={editForm.guardianPhone}
                                      onChange={(e) => setEditForm((prev) => ({ ...prev, guardianPhone: e.target.value }))}
                                      placeholder="Guardian phone"
                                      className="w-full rounded-xl border border-slate-300 px-3 py-2"
                                    />
                                    <input
                                      type="email"
                                      value={editForm.guardianEmail}
                                      onChange={(e) => setEditForm((prev) => ({ ...prev, guardianEmail: e.target.value }))}
                                      placeholder="Guardian email"
                                      className="w-full rounded-xl border border-slate-300 px-3 py-2"
                                    />
                                  </div>
                                ) : (
                                  <div>
                                    <p className="font-semibold text-slate-800">{highlightMatch(student.fullName, debouncedSearch)}</p>
                                    <p className="mt-1 text-xs text-slate-500">{highlightMatch(buildStudentCode(student), debouncedSearch)}</p>
                                    <p className="mt-1 text-xs text-slate-500">Student login: {student.portalEmail || 'Generated when record is provisioned'}</p>
                                    <p className="mt-1 text-xs text-slate-500">Parent login: {student.parentPortalEmail || student.guardianEmail || 'Add guardian email to provision parent access'}</p>
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                {editingId === student.id ? (
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleUpdate(student.id)}
                                      disabled={savingStudentId === student.id || !canSaveStudent}
                                      className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      {savingStudentId === student.id ? 'Saving...' : 'Save'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={cancelEdit}
                                      disabled={savingStudentId === student.id}
                                      className="rounded-xl border border-slate-300 px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      onClick={() => startEdit(student)}
                                      disabled={deletingStudentId === student.id}
                                      className="rounded-xl border border-slate-300 px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDelete(student.id)}
                                      disabled={deletingStudentId === student.id}
                                      className="rounded-xl border border-red-300 px-3 py-2 text-xs text-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      {deletingStudentId === student.id ? 'Deleting...' : 'Delete'}
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                          {!classItem.students.length && (
                            <tr>
                              <td className="px-4 py-8 text-center text-slate-500" colSpan={2}>
                                No students in this class yet.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </article>
              ))}
              {!group.classes.length && (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  No class matches this class search in {group.institution}.
                </div>
              )}
            </div>
          </section>
        ))}
      </div>

      <section className="mt-8 rounded-[28px] border border-slate-200 bg-slate-50/40 p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-2xl text-primary">Inactive Students</h2>
            <p className="mt-2 text-sm text-slate-600">Inactive students stay visible for ledger cleanup without appearing in active rosters.</p>
          </div>
          <span className="rounded-full border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
            {inactiveStudents.length} inactive
          </span>
        </div>
        <div className="mt-4 overflow-x-auto rounded-3xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Last Class</th>
                <th className="px-4 py-3">Institution</th>
              </tr>
            </thead>
            <tbody>
              {inactiveStudents.map((student) => (
                <tr key={student.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-800">{highlightMatch(student.fullName, debouncedSearch)}</p>
                    <p className="text-xs text-slate-500">{highlightMatch(buildStudentCode(student), debouncedSearch)}</p>
                  </td>
                  <td className="px-4 py-3">{student.classLabel || student.level || 'N/A'}</td>
                  <td className="px-4 py-3">{student.institution || 'N/A'}</td>
                </tr>
              ))}
              {!inactiveStudents.length && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-slate-500">
                    No inactive students found for the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8 rounded-[28px] border border-amber-200/60 bg-amber-50/40 p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-2xl text-primary">Graduated Students</h2>
            <p className="mt-2 text-sm text-slate-600">Graduates remain searchable for historical performance records.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={graduatedSearch}
              onChange={(event) => setGraduatedSearch(event.target.value)}
              placeholder="Search graduates"
              className="w-56 rounded-full border border-amber-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700"
            />
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
              {filteredGraduatedStudents.length} / {graduatedStudents.length} graduates
            </span>
          </div>
        </div>
        <div className="mt-4 max-h-[520px] overflow-x-auto overflow-y-auto rounded-3xl border border-amber-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-amber-50/90 text-left">
              <tr>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Last Class</th>
                <th className="px-4 py-3">Institution</th>
              </tr>
            </thead>
            <tbody>
              {filteredGraduatedStudents.map((student) => (
                <tr key={student.id} className="border-t border-amber-100">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-800">
                      {highlightMatch(student.fullName, debouncedGraduatedSearch)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {highlightMatch(buildStudentCode(student), debouncedGraduatedSearch)}
                    </p>
                  </td>
                  <td className="px-4 py-3">{student.classLabel || student.level || 'N/A'}</td>
                  <td className="px-4 py-3">{student.institution || 'N/A'}</td>
                </tr>
              ))}
              {!filteredGraduatedStudents.length && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-slate-500">
                    No graduated students found for the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </PortalLayout>
  );
}

export default ManageStudents;
