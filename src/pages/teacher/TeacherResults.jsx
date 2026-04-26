import { Fragment, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import PortalLayout from '../../components/PortalLayout';
import { ADMIN_INSTITUTIONS, canonicalInstitution, institutionAccent } from '../../utils/adminInstitution';
import { buildStudentCode } from '../../utils/studentCode';

const TERM_OPTIONS = ['First Term', 'Second Term', 'Third Term'];

function clampScore(value, min, max) {
  const numeric = Number(value || 0);
  if (Number.isNaN(numeric)) return min;
  return Math.max(min, Math.min(max, numeric));
}

function gradeFromTotal(total) {
  if (total >= 70) return 'A';
  if (total >= 60) return 'B';
  if (total >= 50) return 'C';
  if (total >= 45) return 'D';
  if (total >= 40) return 'E';
  return 'F';
}

function matchesPerformance(total, filter) {
  if (filter === 'high') return total >= 70;
  if (filter === 'mid') return total >= 50 && total < 70;
  if (filter === 'low') return total < 50;
  return true;
}

function formatDateTime(value) {
  if (!value) return 'Not yet saved';

  try {
    return new Intl.DateTimeFormat('en-NG', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function nextPromotionLabel(term = '') {
  if (term === 'First Term') return 'Second Term';
  if (term === 'Second Term') return 'Third Term';
  return 'Next Class';
}

function rowStatus(row, baseline) {
  const total = Number(row.ca || 0) + Number(row.exam || 0);

  if (row.published) return 'Approved';
  if (row.submittedAt) return 'Submitted';
  if (!baseline) return total > 0 ? 'New draft' : 'Pending';
  if (baseline.ca !== row.ca || baseline.exam !== row.exam) return 'Edited';
  if (total > 0) return 'Saved';
  return 'Pending';
}

function TeacherResults() {
  const { apiJson } = useAuth();
  const [options, setOptions] = useState({
    institution: ADMIN_INSTITUTIONS[0],
    classes: [],
    subjects: [],
    students: [],
    assignments: [],
    sessionId: '',
    activeSession: null,
    leadByClassTerm: {}
  });
  const [records, setRecords] = useState([]);
  const [rows, setRows] = useState([]);
  const [baselineRows, setBaselineRows] = useState([]);
  const [expandedStudents, setExpandedStudents] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearingPublished, setClearingPublished] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [promotionStatus, setPromotionStatus] = useState({ error: '', success: '' });
  const [promotionSaving, setPromotionSaving] = useState(false);
  const [promotionDecisions, setPromotionDecisions] = useState({});
  const [performanceFilter, setPerformanceFilter] = useState('all');
  const [showRosterRows, setShowRosterRows] = useState(true);
  const [showSavedRows, setShowSavedRows] = useState(true);
  const [showPromotionRows, setShowPromotionRows] = useState(true);
  const hasSession = Boolean(options.sessionId);
  const [form, setForm] = useState({
    classId: '',
    subjectId: '',
    term: 'First Term'
  });
  const deferredSearch = useDeferredValue(searchTerm.trim().toLowerCase());
  const loadDataSeq = useRef(0);

  const loadData = useCallback(async (selection = null) => {
    const seq = ++loadDataSeq.current;
    setError('');
    setSuccess('');
    setLoading(true);
    setOptions({
      institution: ADMIN_INSTITUTIONS[0],
      classes: [],
      subjects: [],
      students: [],
      assignments: [],
      sessionId: '',
      activeSession: null,
      leadByClassTerm: {}
    });
    setRecords([]);
    setRows([]);
    setBaselineRows([]);
    setExpandedStudents({});
    setPromotionStatus({ error: '', success: '' });
    setPromotionDecisions({});

    try {
      const [optionsData, recordsData] = await Promise.all([
        apiJson('/results/teacher/options'),
        apiJson('/results/teacher/records')
      ]);
      if (seq !== loadDataSeq.current) return;

      const scopedOptions = {
        institution: optionsData.institution || 'ATTAUFEEQ Model Academy',
        classes: optionsData.classes || [],
        subjects: optionsData.subjects || [],
        students: optionsData.students || [],
        assignments: optionsData.assignments || [],
        sessionId: optionsData.sessionId || '',
        activeSession: optionsData.activeSession || null,
        leadByClassTerm: optionsData.leadByClassTerm || {}
      };

      setOptions(scopedOptions);
      setRecords(recordsData.results || []);

      const nextTerm = selection?.term || 'First Term';
      const preferredSelection = selection || {
        classId: '',
        subjectId: '',
        term: 'First Term'
      };
      const termAssignments = scopedOptions.assignments.filter((item) => item.term === nextTerm);
      const termClassIds = [...new Set(termAssignments.map((item) => item.classId))];
      const defaultClassId =
        termAssignments[0]?.classId ||
        scopedOptions.classes.find((item) => termClassIds.includes(item.id))?.id ||
        '';
      const classId =
        preferredSelection.classId &&
        termClassIds.includes(preferredSelection.classId)
          ? preferredSelection.classId
          : defaultClassId;

      const subjectIdsForClass = termAssignments
        .filter((item) => item.classId === classId)
        .map((item) => item.subjectId);
      const defaultSubjectId =
        subjectIdsForClass[0] ||
        scopedOptions.subjects.find((item) => subjectIdsForClass.includes(item.id))?.id ||
        '';
      const subjectId =
        preferredSelection.subjectId && subjectIdsForClass.includes(preferredSelection.subjectId)
          ? preferredSelection.subjectId
          : defaultSubjectId;

      setForm((prev) => ({
        ...prev,
        classId,
        subjectId,
        term: nextTerm || prev.term || 'First Term'
      }));
    } catch (err) {
      if (seq !== loadDataSeq.current) return;
      setError(err.message || 'Unable to load result module.');
    } finally {
      if (seq === loadDataSeq.current) {
        setLoading(false);
      }
    }
  }, [apiJson]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const classMap = useMemo(
    () => new Map(options.classes.map((item) => [item.id, `${item.name} ${item.arm}`])),
    [options.classes]
  );
  const subjectMap = useMemo(
    () => new Map(options.subjects.map((item) => [item.id, item.name])),
    [options.subjects]
  );
  const termAssignments = useMemo(
    () => options.assignments.filter((item) => item.term === form.term),
    [form.term, options.assignments]
  );
  const termClasses = useMemo(() => {
    const classIds = new Set(termAssignments.map((item) => item.classId));
    return options.classes
      .filter((item) => classIds.has(item.id))
      .sort((a, b) => `${a.name} ${a.arm}`.localeCompare(`${b.name} ${b.arm}`));
  }, [options.classes, termAssignments]);

  const classSubjects = useMemo(() => {
    if (!form.classId) return [];

    const subjectIds = new Set(
      termAssignments
        .filter((item) => item.classId === form.classId)
        .map((item) => item.subjectId)
    );

    return options.subjects
      .filter((item) => subjectIds.has(item.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [form.classId, options.subjects, termAssignments]);

  const classStudents = useMemo(
    () =>
      options.students
        .filter((student) => student.classId === form.classId)
        .filter((student) => {
          const studentInstitution = canonicalInstitution(student.institution) || canonicalInstitution(options.institution || 'ATTAUFEEQ Model Academy');
          return studentInstitution === canonicalInstitution(options.institution || 'ATTAUFEEQ Model Academy');
        })
        .sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [form.classId, options.institution, options.students]
  );

  const canRecommendPromotion = Boolean(options.leadByClassTerm?.[`${form.classId}|${form.term}`]);

  useEffect(() => {
    setPromotionDecisions((prev) => {
      const next = {};
      classStudents.forEach((student) => {
        next[student.id] = prev[student.id] || 'promote';
      });
      return next;
    });
  }, [classStudents]);

  useEffect(() => {
    if (!canRecommendPromotion || !form.term || !form.classId || !options.sessionId) return;

    let active = true;

    async function loadRecommendation() {
      try {
        const params = new URLSearchParams({
          classId: form.classId,
          term: form.term,
          sessionId: options.sessionId
        });
        const data = await apiJson(`/results/teacher/promotion-recommendations?${params.toString()}`);
        if (!active) return;
        const decisions = data.recommendation?.decisions || [];
        if (!decisions.length) return;
        setPromotionDecisions((prev) => {
          const next = { ...prev };
          decisions.forEach((decision) => {
            if (decision.studentId) {
              next[decision.studentId] = decision.action || 'promote';
            }
          });
          return next;
        });
      } catch {
        // Ignore loading errors; recommendations are optional.
      }
    }

    loadRecommendation();

    return () => {
      active = false;
    };
  }, [apiJson, canRecommendPromotion, form.classId, form.term, options.sessionId]);

  useEffect(() => {
    if (!form.term) return;

    if (!termClasses.length) {
      if (form.classId) {
        setForm((prev) => ({ ...prev, classId: '', subjectId: '' }));
      }
      return;
    }

    const isCurrentClassValid = termClasses.some((classItem) => classItem.id === form.classId);
    if (!isCurrentClassValid) {
      setForm((prev) => ({ ...prev, classId: termClasses[0]?.id || '', subjectId: '' }));
    }
  }, [form.classId, form.term, termClasses]);

  useEffect(() => {
    if (!form.classId || !classSubjects.length) {
      if (form.subjectId) {
        setForm((prev) => ({ ...prev, subjectId: '' }));
      }
      return;
    }

    const isCurrentSubjectValid = classSubjects.some((subject) => subject.id === form.subjectId);
    if (!isCurrentSubjectValid) {
      setForm((prev) => ({ ...prev, subjectId: classSubjects[0].id }));
    }
  }, [classSubjects, form.classId, form.subjectId]);

  useEffect(() => {
    const recordMap = new Map(
      records
        .filter(
          (record) =>
            record.classId === form.classId &&
            record.subjectId === form.subjectId &&
            record.term === form.term
        )
        .map((record) => [record.studentId, record])
    );

    const nextRows = classStudents.map((student) => {
      const existing = recordMap.get(student.id);

      return {
        studentId: student.id,
        fullName: student.fullName,
        studentCode: buildStudentCode(student),
        ca: Number(existing?.ca || 0),
        exam: Number(existing?.exam || 0),
        published: Boolean(existing?.published),
        submittedAt: existing?.submittedAt || '',
        teacherClearedAt: existing?.teacherClearedAt || '',
        approvedAt: existing?.approvedAt || '',
        approvedByName: existing?.approvedByName || '',
        savedAt: existing?.updatedAt || existing?.createdAt || ''
      };
    });

    setRows(nextRows);
    setBaselineRows(nextRows);
  }, [classStudents, form.classId, form.subjectId, form.term, records]);

  const baselineMap = useMemo(
    () => new Map(baselineRows.map((row) => [row.studentId, row])),
    [baselineRows]
  );

  const visibleRows = useMemo(() => {
    return rows.filter((row) => {
      const total = Number(row.ca || 0) + Number(row.exam || 0);
      const byPerformance = matchesPerformance(total, performanceFilter);
      if (!deferredSearch) return byPerformance;
      const searchable = `${row.fullName} ${row.studentCode || buildStudentCode({ id: row.studentId, institution: options.institution })}`.toLowerCase();
      return byPerformance && searchable.includes(deferredSearch);
    });
  }, [deferredSearch, performanceFilter, rows]);

  const dirtyCount = useMemo(
    () =>
      rows.filter((row) => {
        const baseline = baselineMap.get(row.studentId);
        if (!baseline) return Number(row.ca || 0) + Number(row.exam || 0) > 0;
        return baseline.ca !== row.ca || baseline.exam !== row.exam;
      }).length,
    [baselineMap, rows]
  );

  const completedCount = useMemo(
    () => rows.filter((row) => Number(row.ca || 0) + Number(row.exam || 0) > 0).length,
    [rows]
  );
  const editableRows = useMemo(
    () => rows.filter((row) => !row.published && !row.submittedAt),
    [rows]
  );
  const submittableRows = useMemo(
    () => rows.filter((row) => !row.published && !row.submittedAt && row.savedAt),
    [rows]
  );
  const clearablePublishedRows = useMemo(
    () => rows.filter((row) => row.published && !row.teacherClearedAt),
    [rows]
  );
  const hasEditableRows = editableRows.length > 0;
  const hasSubmittableRows = submittableRows.length > 0;
  const hasClearablePublishedRows = clearablePublishedRows.length > 0;

  const classAverage = useMemo(() => {
    if (!rows.length) return 0;
    const total = rows.reduce((sum, row) => sum + Number(row.ca || 0) + Number(row.exam || 0), 0);
    return Number((total / rows.length).toFixed(1));
  }, [rows]);

  const hasUnsavedChanges = dirtyCount > 0;

  const groupedRecords = useMemo(() => {
    const scopedRecords = records.filter((record) => {
      if (record.institution && record.institution !== (options.institution || 'ATTAUFEEQ Model Academy')) return false;
      if (form.classId && record.classId !== form.classId) return false;
      if (form.term && record.term !== form.term) return false;
      if (!deferredSearch) return true;

      const studentCode = buildStudentCode({
        id: record.studentId,
        institution: record.institution || options.institution
      });
      return `${record.studentName} ${studentCode} ${record.subjectName} ${record.classLabel}`
        .toLowerCase()
        .includes(deferredSearch);
    });

    const grouped = new Map();

    scopedRecords.forEach((record) => {
      const studentCode = buildStudentCode({
        id: record.studentId,
        institution: record.institution || options.institution
      });
      const existing = grouped.get(record.studentId) || {
        studentId: record.studentId,
        studentName: record.studentName || record.studentId,
        studentCode,
        classLabel: record.classLabel || classMap.get(record.classId) || record.classId,
        updatedAt: record.updatedAt || record.createdAt || '',
        publishedCount: 0,
        subjects: []
      };

      existing.subjects.push(record);
      existing.publishedCount += record.published ? 1 : 0;

      const currentUpdatedAt = new Date(existing.updatedAt || 0).getTime();
      const candidateUpdatedAt = new Date(record.updatedAt || record.createdAt || 0).getTime();
      if (candidateUpdatedAt > currentUpdatedAt) {
        existing.updatedAt = record.updatedAt || record.createdAt || '';
      }

      grouped.set(record.studentId, existing);
    });

    return [...grouped.values()]
      .map((group) => ({
        ...group,
        subjectCount: group.subjects.length,
        averageTotal: Number(
          (
            group.subjects.reduce((sum, subject) => sum + Number(subject.total || 0), 0) /
            group.subjects.length
          ).toFixed(1)
        ),
        subjects: group.subjects.sort((a, b) => {
          const subjectCompare = (a.subjectName || '').localeCompare(b.subjectName || '');
          if (subjectCompare !== 0) return subjectCompare;
          return (a.term || '').localeCompare(b.term || '');
        })
      }))
      .filter((group) => matchesPerformance(group.averageTotal, performanceFilter))
      .sort((a, b) => {
        const timeDiff =
          new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
        if (timeDiff !== 0) return timeDiff;
        return a.studentName.localeCompare(b.studentName);
      });
  }, [classMap, deferredSearch, form.classId, form.term, options.institution, performanceFilter, records]);

  const selectedClassLabel = classMap.get(form.classId) || 'No class selected';
  const selectedSubjectLabel = subjectMap.get(form.subjectId) || 'No subject selected';

  const latestSubmission = useMemo(() => {
    if (!form.classId || !form.subjectId || !form.term) return '';
    const timestamps = records
      .filter(
        (record) =>
          record.classId === form.classId &&
          record.subjectId === form.subjectId &&
          record.term === form.term &&
          record.submittedAt
      )
      .map((record) => record.submittedAt)
      .filter(Boolean);
    if (!timestamps.length) return '';
    const latest = timestamps.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
    return latest || '';
  }, [form.classId, form.subjectId, form.term, records]);
  const actionBusy = saving || submitting || clearing || clearingPublished || promotionSaving;

  function updateScore(studentId, field, value) {
    const nextValue = clampScore(value, 0, field === 'ca' ? 40 : 60);

    setRows((prev) =>
      prev.map((row) => (row.studentId === studentId ? { ...row, [field]: nextValue } : row))
    );
  }

  function toggleStudentExpansion(studentId) {
    setExpandedStudents((prev) => ({ ...prev, [studentId]: !prev[studentId] }));
  }

  async function handleSaveScores(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (!hasSession) {
      setError('No active session found. Ask the admin to configure the current session before saving scores.');
      return;
    }
    setSaving(true);

    try {
      const payloadRows = editableRows.map((row) => ({
        studentId: row.studentId,
        ca: Number(row.ca || 0),
        exam: Number(row.exam || 0)
      }));

      const data = await apiJson('/results/teacher/scores', {
        method: 'POST',
        body: { ...form, sessionId: options.sessionId, rows: payloadRows }
      });

      setSuccess(
        `${data.savedCount || 0} student score records saved for ${selectedClassLabel} in ${selectedSubjectLabel}.`
      );
      await loadData(form);
    } catch (err) {
      setError(err.message || 'Unable to save scores.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitToAdmin() {
    setError('');
    setSuccess('');
    if (!hasSession) {
      setError('No active session found. Ask the admin to configure the current session before submitting results.');
      return;
    }
    setSubmitting(true);

    try {
      const data = await apiJson('/results/teacher/submit', {
        method: 'POST',
        body: { classId: form.classId, subjectId: form.subjectId, term: form.term, sessionId: options.sessionId }
      });

      setSuccess(`Submitted ${data.submittedCount || 0} result rows for admin review.`);
      await loadData(form);
    } catch (err) {
      setError(err.message || 'Unable to submit results.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleClearDrafts() {
    if (!form.classId || !form.subjectId) return;
    if (!window.confirm('Clear all unsubmitted drafts for this class, subject, and term?')) return;
    if (!hasSession) {
      setError('No active session found. Ask the admin to configure the current session before clearing drafts.');
      return;
    }

    setClearing(true);
    setError('');
    setSuccess('');

    try {
      const data = await apiJson('/results/teacher/clear-drafts', {
        method: 'POST',
        body: {
          classId: form.classId,
          subjectId: form.subjectId,
          term: form.term,
          sessionId: options.sessionId
        }
      });

      setSuccess(`Cleared ${data.removedCount || 0} draft records for this class.`);
      await loadData(form);
    } catch (err) {
      setError(err.message || 'Unable to clear drafts.');
    } finally {
      setClearing(false);
    }
  }

  async function handleClearPublished() {
    if (!form.classId || !form.subjectId) return;
    if (!window.confirm('Clear approved results from your dashboard for this class, subject, and term?')) return;
    if (!hasSession) {
      setError('No active session found. Ask the admin to configure the current session before clearing approved results.');
      return;
    }

    setClearingPublished(true);
    setError('');
    setSuccess('');

    try {
      const data = await apiJson('/results/teacher/clear-published', {
        method: 'POST',
        body: {
          classId: form.classId,
          subjectId: form.subjectId,
          term: form.term,
          sessionId: options.sessionId
        }
      });

      setSuccess(`Cleared ${data.clearedCount || 0} approved result records from your dashboard.`);
      await loadData(form);
    } catch (err) {
      setError(err.message || 'Unable to clear approved results.');
    } finally {
      setClearingPublished(false);
    }
  }

  async function handleSubmitPromotion() {
    if (!form.classId || !form.term) return;
    setPromotionStatus({ error: '', success: '' });
    if (!hasSession) {
      setPromotionStatus({
        error: 'No active session found. Ask the admin to configure the current session before submitting recommendations.',
        success: ''
      });
      return;
    }
    setPromotionSaving(true);

    try {
      const decisions = Object.entries(promotionDecisions).map(([studentId, action]) => ({
        studentId,
        action
      }));
      await apiJson('/results/teacher/promotion-recommendations', {
        method: 'POST',
        body: {
          classId: form.classId,
          term: form.term,
          sessionId: options.sessionId,
          decisions
        }
      });

      setPromotionStatus({ error: '', success: `Promotion recommendations for ${nextPromotionLabel(form.term)} have been sent to admin.` });
    } catch (err) {
      setPromotionStatus({ error: err.message || 'Unable to submit promotion recommendations.', success: '' });
    } finally {
      setPromotionSaving(false);
    }
  }

  return (
    <PortalLayout
      role="teacher"
      title="Teacher Result Studio"
      subtitle={`${options.institution || 'Institution'} score operations with class-level filtering, searchable entry, and expandable student records.`}
      actions={
        <div className={`inline-flex items-center rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] ${institutionAccent(options.institution)}`}>
          Scope: {options.institution}
        </div>
      }
    >
      <div className="grid gap-4 xl:grid-cols-4">
        <div className="rounded-3xl border border-emerald-900/10 bg-[linear-gradient(145deg,rgba(15,81,50,0.08),rgba(201,162,39,0.06))] p-5 xl:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Active scoring lane</p>
          <h2 className="mt-2 font-heading text-2xl text-primary">{selectedClassLabel}</h2>
          <p className="mt-2 text-sm text-slate-600">
            {selectedSubjectLabel} • {form.term} {options.activeSession?.sessionName ? `• ${options.activeSession.sessionName}` : ''}
          </p>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600">
            This workspace is locked to your assigned institution only. Choose a class to load the exact roster, search
            within that class, edit existing scores safely, and keep each saved record attached to the student profile.
          </p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Roster</p>
          <p className="mt-3 text-3xl font-bold text-slate-900">{classStudents.length}</p>
          <p className="mt-2 text-sm text-slate-600">Students in the selected class.</p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Completion</p>
          <p className="mt-3 text-3xl font-bold text-slate-900">{completedCount}</p>
          <p className="mt-2 text-sm text-slate-600">
            Scored students. Class average: <span className="font-semibold text-primary">{classAverage}</span>
          </p>
        </div>
      </div>

      {error && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {!hasSession && (
        <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No active academic session is configured. Ask the admin to set the current session to unlock result entry.
        </p>
      )}
      {success && (
        <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </p>
      )}

      <form
        onSubmit={handleSaveScores}
        className="mt-6 rounded-[28px] border border-emerald-900/10 bg-white/95 p-5 shadow-sm"
      >
        <div className="grid gap-4 lg:grid-cols-5">
          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Institution</span>
            <div className="rounded-2xl border border-emerald-900/10 bg-emerald-50 px-4 py-3 text-sm font-semibold text-primary">
              {options.institution}
            </div>
          </label>

          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Class</span>
            <select
              required
              value={form.classId}
              onChange={(event) => setForm((prev) => ({ ...prev, classId: event.target.value }))}
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10"
            >
              {termClasses.map((classItem) => (
                <option key={classItem.id} value={classItem.id}>
                  {classItem.name} {classItem.arm}
                </option>
              ))}
              {!termClasses.length && <option value="">No assigned classes for this term</option>}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Subject</span>
            <select
              required
              value={form.subjectId}
              onChange={(event) => setForm((prev) => ({ ...prev, subjectId: event.target.value }))}
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10"
            >
              {classSubjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
              {!classSubjects.length && <option value="">No assigned subjects</option>}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Term</span>
            <select
              value={form.term}
              onChange={(event) => setForm((prev) => ({ ...prev, term: event.target.value }))}
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10"
            >
              {TERM_OPTIONS.map((term) => (
                <option key={term} value={term}>
                  {term}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Search student</span>
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by name or code"
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
          </label>

          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Performance</span>
            <select
              value={performanceFilter}
              onChange={(event) => setPerformanceFilter(event.target.value)}
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10"
            >
              <option value="all">All performance</option>
              <option value="high">70+ (High)</option>
              <option value="mid">50–69 (Mid)</option>
              <option value="low">Below 50 (Low)</option>
            </select>
          </label>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            <span className="rounded-full bg-white px-3 py-2 text-slate-700">{visibleRows.length} visible</span>
            <span className="rounded-full bg-white px-3 py-2 text-slate-700">{dirtyCount} edited rows</span>
            <span className="rounded-full bg-white px-3 py-2 text-slate-700">{groupedRecords.length} saved students</span>
            {latestSubmission && (
              <span className="rounded-full bg-white px-3 py-2 text-slate-700">
                Last submitted {formatDateTime(latestSubmission)}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={actionBusy || !hasSession || !form.classId || !form.subjectId || !hasEditableRows}
              className="rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Saving scores...' : hasUnsavedChanges ? 'Save result records' : 'Save current scores'}
            </button>
            <button
              type="button"
              onClick={handleSubmitToAdmin}
              disabled={actionBusy || !hasSession || !form.classId || !form.subjectId || !hasSubmittableRows}
              className="rounded-2xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit to Admin'}
            </button>
            <button
              type="button"
              onClick={handleClearDrafts}
              disabled={actionBusy || !hasSession || !form.classId || !form.subjectId || !hasSubmittableRows}
              className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {clearing ? 'Clearing...' : 'Clear Drafts'}
            </button>
            <button
              type="button"
              onClick={handleClearPublished}
              disabled={actionBusy || !hasSession || !form.classId || !form.subjectId || !hasClearablePublishedRows}
              className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {clearingPublished ? 'Clearing...' : 'Clear Approved'}
            </button>
          </div>
        </div>

        <div className="mt-5 overflow-x-auto rounded-[24px] border border-slate-200">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            <span>Scoring roster</span>
            <button
              type="button"
              onClick={() => setShowRosterRows((prev) => !prev)}
              className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
            >
              {showRosterRows ? 'Hide rows' : 'Show rows'}
            </button>
          </div>
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold text-slate-600">Student</th>
                <th className="px-4 py-3 font-semibold text-slate-600">CA / 40</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Exam / 60</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Total / 100</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Grade</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Status</th>
              </tr>
            </thead>
            <tbody>
              {!showRosterRows && (
                <tr>
                  <td className="px-4 py-10 text-center text-slate-500" colSpan={6}>
                    Rows are hidden. Click “Show rows” to display students.
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td className="px-4 py-10 text-center text-slate-500" colSpan={6}>
                    Loading class roster and saved results...
                  </td>
                </tr>
              )}

              {showRosterRows && !loading && !visibleRows.length && (
                <tr>
                  <td className="px-4 py-10 text-center text-slate-500" colSpan={6}>
                    No students match this class and search scope.
                  </td>
                </tr>
              )}

              {showRosterRows && !loading &&
                visibleRows.map((row) => {
                  const total = Number(row.ca || 0) + Number(row.exam || 0);
                  const baseline = baselineMap.get(row.studentId);
                  const status = rowStatus(row, baseline);
                  const isDirty = baseline && (baseline.ca !== row.ca || baseline.exam !== row.exam);
                  const rowLocked = row.published || row.submittedAt;
                  const statusDetail = row.approvedAt
                    ? `${row.approvedByName ? `Approved by ${row.approvedByName} • ` : ''}${formatDateTime(row.approvedAt)}`
                    : row.submittedAt
                      ? `Submitted ${formatDateTime(row.submittedAt)}`
                      : formatDateTime(row.savedAt);

                  return (
                    <tr
                      key={row.studentId}
                      className={`border-t border-slate-100 ${isDirty ? 'bg-amber-50/60' : 'bg-white'}`}
                    >
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-800">{row.fullName}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {row.studentCode || buildStudentCode({ id: row.studentId, institution: options.institution })}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min="0"
                          max="40"
                          value={row.ca}
                          onChange={(event) => updateScore(row.studentId, 'ca', event.target.value)}
                          disabled={rowLocked}
                          className="w-24 rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min="0"
                          max="60"
                          value={row.exam}
                          onChange={(event) => updateScore(row.studentId, 'exam', event.target.value)}
                          disabled={rowLocked}
                          className="w-24 rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                        />
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{total}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-primary">
                          {gradeFromTotal(total)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-700">{status}</div>
                        <div className="mt-1 text-xs text-slate-500">{statusDetail}</div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </form>

      <section className="mt-8 rounded-[28px] border border-emerald-900/10 bg-white/95 p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-heading text-2xl text-primary">Promotion Recommendations</h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                Lead teachers can flag each student to repeat or move forward. Admin reviews the list before final promotion.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Session</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">
                {options.activeSession?.sessionName || 'Active Session'}
              </p>
              <p className="text-xs text-slate-500">{selectedClassLabel}</p>
            </div>
          </div>

          {!canRecommendPromotion && (
            <p className="mt-4 text-sm text-slate-600">
              Only the lead teacher for this class can submit promotion recommendations.
            </p>
          )}

          {canRecommendPromotion && (
            <>
              {promotionStatus.error && (
                <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {promotionStatus.error}
                </p>
              )}
              {promotionStatus.success && (
                <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {promotionStatus.success}
                </p>
              )}

              <div className="mt-4 overflow-x-auto rounded-[24px] border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  <span>Promotion table</span>
                  <button
                    type="button"
                    onClick={() => setShowPromotionRows((prev) => !prev)}
                    className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                  >
                    {showPromotionRows ? 'Hide rows' : 'Show rows'}
                  </button>
                </div>
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-slate-600">Student</th>
                      <th className="px-4 py-3 font-semibold text-slate-600">Decision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!showPromotionRows && (
                      <tr>
                        <td colSpan={2} className="px-4 py-6 text-center text-slate-500">
                          Rows are hidden. Click “Show rows” to display students.
                        </td>
                      </tr>
                    )}
                    {showPromotionRows && classStudents.map((student) => (
                      <tr key={student.id} className="border-t border-slate-100">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-800">{student.fullName}</div>
                          <div className="mt-1 text-xs text-slate-500">{buildStudentCode(student)}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-3 text-xs text-slate-700">
                            <label className="inline-flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={(promotionDecisions[student.id] || 'promote') === 'promote'}
                                onChange={() =>
                                  setPromotionDecisions((prev) => ({ ...prev, [student.id]: 'promote' }))
                                }
                              />
                              Promote
                            </label>
                            <label className="inline-flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={promotionDecisions[student.id] === 'repeat'}
                                onChange={() =>
                                  setPromotionDecisions((prev) => ({ ...prev, [student.id]: 'repeat' }))
                                }
                              />
                              Repeat
                            </label>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {showPromotionRows && !classStudents.length && (
                      <tr>
                        <td colSpan={2} className="px-4 py-6 text-center text-slate-500">
                          No enrolled students found for this class.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={handleSubmitPromotion}
                  disabled={actionBusy || !hasSession || !classStudents.length}
                  className="rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {promotionSaving ? 'Sending...' : `Send ${nextPromotionLabel(form.term)} Recommendations`}
                </button>
              </div>
            </>
          )}
        </section>

      <section className="mt-8 rounded-[28px] border border-emerald-900/10 bg-white/95 p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-2xl text-primary">Saved student result records</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Each student appears once. Expand a row to review every saved subject record under that student for the
              selected class and term.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Current view</p>
            <p className="mt-1 text-sm font-semibold text-slate-800">{selectedClassLabel}</p>
            <p className="text-xs text-slate-500">{form.term}</p>
          </div>
        </div>

        <div className="mt-5 overflow-x-auto rounded-[24px] border border-slate-200">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            <span>Saved results</span>
            <button
              type="button"
              onClick={() => setShowSavedRows((prev) => !prev)}
              className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
            >
              {showSavedRows ? 'Hide rows' : 'Show rows'}
            </button>
          </div>
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold text-slate-600">Student</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Class</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Subjects</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Average</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Approved</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Last update</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!showSavedRows && (
                <tr>
                  <td className="px-4 py-10 text-center text-slate-500" colSpan={7}>
                    Rows are hidden. Click “Show rows” to display saved records.
                  </td>
                </tr>
              )}
              {showSavedRows && !groupedRecords.length && (
                <tr>
                  <td className="px-4 py-10 text-center text-slate-500" colSpan={7}>
                    No saved result records in this scope yet.
                  </td>
                </tr>
              )}

              {showSavedRows && groupedRecords.map((group) => {
                const open = Boolean(expandedStudents[group.studentId]);

                return (
                  <Fragment key={group.studentId}>
                    <tr key={group.studentId} className="border-t border-slate-100 bg-white">
                      <td className="px-4 py-4">
                        <div className="font-semibold text-slate-800">{group.studentName}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {group.studentCode || buildStudentCode({ id: group.studentId, institution: options.institution })}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-slate-700">{group.classLabel}</td>
                      <td className="px-4 py-4 text-slate-700">{group.subjectCount}</td>
                      <td className="px-4 py-4 font-semibold text-slate-900">{group.averageTotal}</td>
                      <td className="px-4 py-4 text-slate-700">
                        {group.publishedCount}/{group.subjectCount}
                      </td>
                      <td className="px-4 py-4 text-slate-700">{formatDateTime(group.updatedAt)}</td>
                      <td className="px-4 py-4">
                        <button
                          type="button"
                          onClick={() => toggleStudentExpansion(group.studentId)}
                          className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700 transition hover:border-primary hover:text-primary"
                        >
                          {open ? 'Hide' : 'Expand'}
                        </button>
                      </td>
                    </tr>
                    {open && (
                      <tr key={`${group.studentId}-details`} className="border-t border-slate-100 bg-slate-50/80">
                        <td className="px-4 py-4" colSpan={7}>
                          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                            <table className="min-w-full text-sm">
                              <thead className="bg-slate-50 text-left">
                                <tr>
                                  <th className="px-4 py-3 font-semibold text-slate-600">Subject</th>
                                  <th className="px-4 py-3 font-semibold text-slate-600">Term</th>
                                  <th className="px-4 py-3 font-semibold text-slate-600">CA</th>
                                <th className="px-4 py-3 font-semibold text-slate-600">Exam</th>
                                <th className="px-4 py-3 font-semibold text-slate-600">Total</th>
                                <th className="px-4 py-3 font-semibold text-slate-600">Grade</th>
                                <th className="px-4 py-3 font-semibold text-slate-600">Approval</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.subjects.map((subject) => (
                                <tr key={subject.id} className="border-t border-slate-100">
                                    <td className="px-4 py-3 text-slate-800">{subject.subjectName}</td>
                                    <td className="px-4 py-3 text-slate-700">{subject.term}</td>
                                    <td className="px-4 py-3 text-slate-700">{subject.ca}</td>
                                  <td className="px-4 py-3 text-slate-700">{subject.exam}</td>
                                  <td className="px-4 py-3 font-semibold text-slate-900">{subject.total}</td>
                                  <td className="px-4 py-3 text-slate-700">{subject.grade}</td>
                                  <td className="px-4 py-3 text-slate-700">
                                    {subject.published ? 'Approved' : 'Pending'}
                                    {subject.approvedAt && (
                                      <div className="mt-1 text-[11px] text-slate-500">
                                        {subject.approvedByName ? `${subject.approvedByName} • ` : ''}
                                        {formatDateTime(subject.approvedAt)}
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </PortalLayout>
  );
}

export default TeacherResults;
