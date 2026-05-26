import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import PortalLayout from '../../components/PortalLayout';
import { ADMIN_INSTITUTIONS, institutionAccent } from '../../utils/adminInstitution';
import { buildStudentCode } from '../../utils/studentCode';
import ReportCardSheet from '../../components/ReportCardSheet';

const emptyCalendarForm = {
  termStartDate: '',
  termEndDate: '',
  examStartDate: '',
  examEndDate: '',
  holidayStartDate: '',
  holidayEndDate: '',
  resultPublishingDate: '',
  nextTermBegins: '',
  notes: ''
};

const emptyReportSettingsForm = {
  headName: '',
  headTitle: 'Head Teacher',
  signatureImage: '',
  parentAcknowledgementText: 'I have received and read this report.',
  footerNote: ''
};

const emptyReportOverride = {
  attendanceSummary: {
    totalSchoolDays: '',
    daysPresent: '',
    daysAbsent: '',
    lateComing: '',
    attendanceRemark: ''
  },
  behaviorRatings: {
    discipline: '',
    responsibility: '',
    cooperation: '',
    respect: '',
    initiative: ''
  }
};

const TERM_ORDER = ['First Term', 'Second Term', 'Third Term'];

function getNextTerm(term = '') {
  const index = TERM_ORDER.indexOf(term);
  return index >= 0 && index < TERM_ORDER.length - 1 ? TERM_ORDER[index + 1] : '';
}

function normalizeCalendarForm(entry = null) {
  return {
    termStartDate: entry?.termStartDate || '',
    termEndDate: entry?.termEndDate || '',
    examStartDate: entry?.examStartDate || '',
    examEndDate: entry?.examEndDate || '',
    holidayStartDate: entry?.holidayStartDate || '',
    holidayEndDate: entry?.holidayEndDate || '',
    resultPublishingDate: entry?.resultPublishingDate || '',
    nextTermBegins: entry?.nextTermBegins || '',
    notes: entry?.notes || ''
  };
}

function normalizeReportSettingsForm(settings = null) {
  return {
    headName: settings?.headName || '',
    headTitle: settings?.headTitle || 'Head Teacher',
    signatureImage: settings?.signatureImage || '',
    parentAcknowledgementText: settings?.parentAcknowledgementText || 'I have received and read this report.',
    footerNote: settings?.footerNote || ''
  };
}

function normalizeOverrideForm(override = null) {
  return {
    attendanceSummary: {
      totalSchoolDays: override?.attendanceSummary?.totalSchoolDays ?? '',
      daysPresent: override?.attendanceSummary?.daysPresent ?? '',
      daysAbsent: override?.attendanceSummary?.daysAbsent ?? '',
      lateComing: override?.attendanceSummary?.lateComing ?? '',
      attendanceRemark: override?.attendanceSummary?.attendanceRemark || ''
    },
    behaviorRatings: {
      discipline: override?.behaviorRatings?.discipline || '',
      responsibility: override?.behaviorRatings?.responsibility || '',
      cooperation: override?.behaviorRatings?.cooperation || '',
      respect: override?.behaviorRatings?.respect || '',
      initiative: override?.behaviorRatings?.initiative || ''
    }
  };
}

function AdminResultsPublish() {
  const { apiFetch, apiJson } = useAuth();
  const [results, setResults] = useState([]);
  const [classes, setClasses] = useState([]);
  const [institution, setInstitution] = useState(ADMIN_INSTITUTIONS[0]);
  const [term, setTerm] = useState('First Term');
  const [sessionId, setSessionId] = useState('');
  const [sessions, setSessions] = useState([]);
  const [classId, setClassId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [expandedStudents, setExpandedStudents] = useState({});
  const [reportCard, setReportCard] = useState(null);
  const [openClassIds, setOpenClassIds] = useState([]);
  const [accessBusy, setAccessBusy] = useState(false);
  const [termClosures, setTermClosures] = useState([]);
  const [termBusy, setTermBusy] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [reportLoadingStudentId, setReportLoadingStudentId] = useState('');
  const [blockedStudents, setBlockedStudents] = useState([]);
  const [pendingGroups, setPendingGroups] = useState([]);
  const [compiling, setCompiling] = useState(false);
  const [readiness, setReadiness] = useState(null);
  const [notifyingTeachers, setNotifyingTeachers] = useState(false);
  const [showRowsByInstitution, setShowRowsByInstitution] = useState(() => ({}));
  const [remarkRows, setRemarkRows] = useState([]);
  const [remarksSaving, setRemarksSaving] = useState(false);
  const [remarksGenerating, setRemarksGenerating] = useState(false);
  const [regeneratingStudentId, setRegeneratingStudentId] = useState('');
  const [remarksStatus, setRemarksStatus] = useState({ error: '', success: '' });
  const [academicCalendar, setAcademicCalendar] = useState([]);
  const [calendarForm, setCalendarForm] = useState(emptyCalendarForm);
  const [calendarSaving, setCalendarSaving] = useState(false);
  const [reportSettingsForm, setReportSettingsForm] = useState(emptyReportSettingsForm);
  const [reportSettingsSaving, setReportSettingsSaving] = useState(false);
  const [reportSignatureBusy, setReportSignatureBusy] = useState(false);
  const reportSignatureInputRef = useRef(null);
  const resolveShowRows = (value) => showRowsByInstitution[value] !== false;
  const loadDataSeq = useRef(0);
  const reportCardSeq = useRef(0);

  const loadData = useCallback(async (next = {}) => {
    const seq = ++loadDataSeq.current;
    setError('');
    setSuccess('');
    setLoading(true);
    setResults([]);
    setClasses([]);
    setSessions([]);
    setOpenClassIds([]);
    setTermClosures([]);
    setBlockedStudents([]);
    setReadiness(null);
    setRemarkRows([]);
    setRemarksStatus({ error: '', success: '' });
    setAcademicCalendar([]);
    setCalendarForm(emptyCalendarForm);
    setReportSettingsForm(emptyReportSettingsForm);

    const nextInstitution = next.institution ?? ADMIN_INSTITUTIONS[0];
    const nextTerm = next.term ?? 'First Term';
    const nextClassId = next.classId ?? '';
    const nextSessionId = next.sessionId ?? '';

    try {
      const remarksUrl = nextClassId && nextSessionId
        ? `/results/admin/remarks?classId=${encodeURIComponent(nextClassId)}&term=${encodeURIComponent(nextTerm)}&sessionId=${encodeURIComponent(nextSessionId)}`
        : null;
      const [resultsData, classesData, sessionsData, accessData, closuresData, pendingData, remarksData, calendarData, reportSettingsData] = await Promise.all([
        apiJson(
          `/results/admin/overview?term=${encodeURIComponent(nextTerm)}&institution=${encodeURIComponent(nextInstitution)}${nextClassId ? `&classId=${encodeURIComponent(nextClassId)}` : ''}${nextSessionId ? `&sessionId=${encodeURIComponent(nextSessionId)}` : ''}`
        ),
        apiJson(`/admin/classes?institution=${encodeURIComponent(nextInstitution)}`),
        apiJson('/admin/academic-sessions'),
        apiJson('/results/admin/access'),
        apiJson(`/admin/terms/closures${nextSessionId ? `?sessionId=${encodeURIComponent(nextSessionId)}` : ''}`),
        apiJson(`/results/admin/pending-subject-results?term=${encodeURIComponent(nextTerm)}${nextSessionId ? `&sessionId=${encodeURIComponent(nextSessionId)}` : ''}`),
        remarksUrl ? apiJson(remarksUrl) : Promise.resolve({ remarks: [] }),
        nextSessionId
          ? apiJson(`/admin/academic-calendar?sessionId=${encodeURIComponent(nextSessionId)}&term=${encodeURIComponent(nextTerm)}`)
          : Promise.resolve({ calendar: [], entry: null }),
        apiJson('/results/admin/report-settings')
      ]);
      if (seq !== loadDataSeq.current) return;

      const classRows = classesData.classes || [];
      setResults(resultsData.results || []);
      setReadiness(resultsData.readiness || null);
      setClasses(classRows);
      setOpenClassIds(accessData.openClassIds || []);
      const sessionRows = sessionsData.sessions || [];
      setSessions(sessionRows);
      setTermClosures(closuresData.termClosures || []);
      setRemarkRows((remarksData.remarks || []).map((row) => ({ ...row, override: normalizeOverrideForm(row.override) })));
      setAcademicCalendar(calendarData.calendar || []);
      setCalendarForm(normalizeCalendarForm(calendarData.entry));
      setReportSettingsForm(normalizeReportSettingsForm(reportSettingsData.settings));
      const active = sessionsData.activeSession || sessionRows.find((item) => item.isActive) || sessionRows[0] || null;
      setSessionId((prev) => {
        const candidate = nextSessionId || prev;
        return candidate && sessionRows.some((session) => session.id === candidate)
          ? candidate
          : active?.id || '';
      });
      setPendingGroups(pendingData.groups || []);

      if (nextClassId && !classRows.some((item) => item.id === nextClassId)) {
        setClassId('');
      }
    } catch (err) {
      if (seq !== loadDataSeq.current) return;
      setError(err.message || 'Unable to load result publishing data.');
      setPendingGroups([]);
    } finally {
      if (seq === loadDataSeq.current) {
        setLoading(false);
      }
    }
  }, [apiJson]);

  const termClosed = useMemo(
    () => termClosures.some((entry) => entry.term === term && entry.sessionId === sessionId),
    [termClosures, term, sessionId]
  );
  const actionBusy = publishing || accessBusy || termBusy || compiling || notifyingTeachers;
  const missingTeachers = readiness?.missingTeachers || [];
  const missingRows = readiness?.missing || [];

  useEffect(() => {
    void loadData({ institution, term, classId, sessionId });
  }, [classId, institution, loadData, sessionId, term]);

  useEffect(() => {
    setExpandedStudents({});
    setReportCard(null);
  }, [classId, institution, sessionId, term]);

  useEffect(() => {
    const selected = academicCalendar.find((entry) => entry.sessionId === sessionId && entry.term === term) || null;
    const nextTerm = getNextTerm(term);
    const nextEntry = academicCalendar.find((entry) => entry.sessionId === sessionId && entry.term === nextTerm) || null;
    const nextForm = normalizeCalendarForm(selected);
    if (!nextForm.nextTermBegins && nextEntry?.termStartDate) {
      nextForm.nextTermBegins = nextEntry.termStartDate;
    }
    setCalendarForm(nextForm);
  }, [academicCalendar, sessionId, term]);

  const groupedResults = useMemo(() => {
    const grouped = new Map();

    results.forEach((result) => {
      const existing = grouped.get(result.studentId) || {
        studentId: result.studentId,
        studentName: result.studentName,
        classLabel: result.classLabel,
        institution: result.institution,
        rows: [],
        publishedCount: 0
      };

      existing.rows.push(result);
      existing.publishedCount += result.published ? 1 : 0;
      grouped.set(result.studentId, existing);
    });

    return [...grouped.values()]
      .map((group) => ({
        ...group,
        subjectCount: group.rows.length,
        submittedCount: group.rows.filter((row) => Boolean(row.submittedAt)).length,
        averageTotal: Number(
          (group.rows.reduce((sum, row) => sum + Number(row.total || 0), 0) / group.rows.length).toFixed(1)
        ),
        rows: group.rows.sort((a, b) => a.subjectName.localeCompare(b.subjectName))
      }))
      .sort((a, b) => a.classLabel.localeCompare(b.classLabel) || a.studentName.localeCompare(b.studentName));
  }, [results]);

  async function compilePublishedResults() {
    setCompiling(true);
    setError('');
    setSuccess('');
    try {
      const data = await apiJson('/results/admin/compile-final-results', {
        method: 'POST',
        body: {
          term,
          classId,
          institution,
          sessionId
        }
      });
      setSuccess(`Compiled ${data.compiledCount || 0} final report cards.`);
      void loadData({ institution, term, classId, sessionId });
    } catch (err) {
      setError(err.message || 'Unable to compile final results.');
    } finally {
      setCompiling(false);
    }
  }
  const hasPublishableResults = useMemo(
    () => results.some((row) => (row.submittedAt || row.submittedByTeacherId) && !row.published),
    [results]
  );
  const summaryCards = useMemo(
    () => [
      {
        key: 'rows',
        label: 'Loaded Score Rows',
        value: results.length,
        tone: institutionAccent(institution)
      },
      {
        key: 'students',
        label: 'Students In Review',
        value: groupedResults.length,
        tone: 'border-slate-200 bg-slate-50 text-slate-700'
      },
      {
        key: 'publishable',
        label: 'Publishable Rows',
        value: results.filter((row) => (row.submittedAt || row.submittedByTeacherId) && !row.published).length,
        tone: hasPublishableResults ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'
      },
      {
        key: 'readiness',
        label: 'Compilation Readiness',
        value: readiness ? `${readiness.completionPercent}%` : '—',
        tone: readiness?.ready ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'
      }
    ],
    [groupedResults.length, hasPublishableResults, institution, readiness, results]
  );

  async function publishResults(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setBlockedStudents([]);

    try {
      setPublishing(true);
      const data = await apiJson('/results/admin/publish', {
        method: 'POST',
        body: { term, classId: classId || undefined, institution, sessionId }
      });

      const publishedCount = data.publishedCount || 0;
      const familySent = data.familyNotification?.sent || 0;
      setBlockedStudents(Array.isArray(data.blockedStudents) ? data.blockedStudents : []);
      setSuccess(
        `${publishedCount} result records published for ${institution}.${familySent ? ` ${familySent} family notification email(s) sent.` : ''}`
      );
      void loadData({ institution, term, classId, sessionId });
    } catch (err) {
      if (err?.payload?.readiness) {
        setReadiness(err.payload.readiness);
        setBlockedStudents(Array.isArray(err.payload.blockedStudents) ? err.payload.blockedStudents : []);
      }
      setError(err.message || 'Unable to publish results.');
    } finally {
      setPublishing(false);
    }
  }

  async function notifyMissingTeachers() {
    if (!missingTeachers.length) return;
    setNotifyingTeachers(true);
    setError('');
    setSuccess('');

    try {
      const deliverable = missingTeachers.filter((teacher) => teacher.teacherEmail);
      if (!deliverable.length) {
        setError('No email address is available for the teachers with missing submissions.');
        return;
      }

      const classLabel = classId
        ? classes.find((item) => item.id === classId)
          ? `${classes.find((item) => item.id === classId).name} ${classes.find((item) => item.id === classId).arm}`
          : 'selected class'
        : 'your assigned classes';

      const results = await Promise.allSettled(
        deliverable.map((teacher) =>
          apiJson('/notifications/admin', {
            method: 'POST',
            body: {
              title: `Result submission reminder: ${term}`,
              message: `Please submit the outstanding ${term} result assessments for ${classLabel}. Admin cannot publish until every assigned subject is complete. Missing rows linked to you: ${teacher.missingCount}.`,
              roleTarget: 'teacher',
              recipientEmail: teacher.teacherEmail
            }
          })
        )
      );

      const sent = results.filter((result) => result.status === 'fulfilled').length;
      const failed = results.length - sent;
      setSuccess(`${sent} teacher reminder(s) queued.${failed ? ` ${failed} failed.` : ''}`);
    } catch (err) {
      setError(err.message || 'Unable to notify teachers.');
    } finally {
      setNotifyingTeachers(false);
    }
  }

  const classAccessOpen = classId ? openClassIds.includes(classId) : false;

  async function toggleClassAccess() {
    if (!classId) return;
    setAccessBusy(true);
    setError('');
    setSuccess('');

    try {
      const data = await apiJson('/results/admin/access', {
        method: 'PUT',
        body: { classId, open: !classAccessOpen }
      });
      setOpenClassIds(data.openClassIds || []);
      setSuccess(classAccessOpen ? 'Results access closed for this class.' : 'Results access opened for this class.');
    } catch (err) {
      setError(err.message || 'Unable to update results access.');
    } finally {
      setAccessBusy(false);
    }
  }

  async function toggleTermClosed() {
    if (!term) return;
    setTermBusy(true);
    setError('');
    setSuccess('');

    try {
      const data = await apiJson('/admin/terms/closures', {
        method: 'PUT',
        body: { term, sessionId, closed: !termClosed }
      });
      setTermClosures(data.termClosures || []);
      setSuccess(termClosed ? 'Term reopened for this session.' : 'Term closed for this session.');
    } catch (err) {
      setError(err.message || 'Unable to update term status.');
    } finally {
      setTermBusy(false);
    }
  }

  function toggleExpanded(studentId) {
    setExpandedStudents((prev) => ({ ...prev, [studentId]: !prev[studentId] }));
  }

  async function loadReportSheet(studentId) {
    const seq = ++reportCardSeq.current;
    setError('');
    setReportCard(null);
    setReportLoadingStudentId(studentId);
    try {
      const params = new URLSearchParams();
      if (term) params.set('term', term);
      if (sessionId) params.set('sessionId', sessionId);
      const query = params.toString() ? `?${params.toString()}` : '';
      const data = await apiJson(`/results/admin/report-card/${studentId}${query}`);
      if (seq !== reportCardSeq.current) return;
      setReportCard(data.reportCard || null);
    } catch (err) {
      if (seq !== reportCardSeq.current) return;
      setError(err.message || 'Unable to load report sheet.');
    } finally {
      if (seq === reportCardSeq.current) {
        setReportLoadingStudentId('');
      }
    }
  }

  function updateHeadTeacherRemark(studentId, value) {
    setRemarkRows((prev) =>
      prev.map((row) => (row.studentId === studentId ? { ...row, headTeacherRemark: value } : row))
    );
  }

  function updateRemarkGuide(studentId, key, value) {
    setRemarkRows((prev) =>
      prev.map((row) => (row.studentId === studentId ? { ...row, [key]: value } : row))
    );
  }

  function updateOverrideField(studentId, section, key, value) {
    setRemarkRows((prev) =>
      prev.map((row) => (
        row.studentId === studentId
          ? {
              ...row,
              override: {
                ...normalizeOverrideForm(row.override),
                [section]: {
                  ...normalizeOverrideForm(row.override)[section],
                  [key]: value
                }
              }
            }
          : row
      ))
    );
  }

  async function saveHeadTeacherRemarks() {
    if (!classId || !term || !sessionId) return;
    setRemarksSaving(true);
    setRemarksStatus({ error: '', success: '' });

    try {
      const data = await apiJson('/results/admin/remarks', {
        method: 'POST',
        body: {
          classId,
          term,
          sessionId,
          rows: remarkRows
        }
      });
      setRemarkRows((data.remarks || []).map((row) => ({ ...row, override: normalizeOverrideForm(row.override) })));
      setRemarksStatus({ error: '', success: `${data.savedCount || 0} head teacher remark(s) saved.` });
    } catch (err) {
      setRemarksStatus({ error: err.message || 'Unable to save head teacher remarks.', success: '' });
    } finally {
      setRemarksSaving(false);
    }
  }

  async function generateHeadTeacherRemarks({ preserveExisting = true } = {}) {
    if (!classId || !term || !sessionId) return;
    setRemarksGenerating(true);
    setRemarksStatus({ error: '', success: '' });

    try {
      const data = await apiJson('/results/admin/remarks/generate', {
        method: 'POST',
        body: {
          classId,
          term,
          sessionId,
          preserveExisting
        }
      });
      setRemarkRows((data.remarks || []).map((row) => ({ ...row, override: normalizeOverrideForm(row.override) })));
      setRemarksStatus({
        error: '',
        success: preserveExisting
          ? `Blank head teacher drafts filled for ${data.remarks?.length || 0} student(s). Existing remarks were preserved.`
          : `Draft head teacher remarks generated for ${data.remarks?.length || 0} student(s). Review and edit before saving.`
      });
    } catch (err) {
      setRemarksStatus({ error: err.message || 'Unable to generate head teacher remarks.', success: '' });
    } finally {
      setRemarksGenerating(false);
    }
  }

  function confirmRegenerateAllHeadTeacherRemarks() {
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(
        'This will replace all current head teacher draft remarks for this class and term. Continue?'
      );
      if (!confirmed) return;
    }
    void generateHeadTeacherRemarks({ preserveExisting: false });
  }

  async function regenerateHeadTeacherRemark(studentId) {
    if (!classId || !term || !sessionId || !studentId) return;
    setRegeneratingStudentId(studentId);
    setRemarksStatus({ error: '', success: '' });

    try {
      const data = await apiJson('/results/admin/remarks/generate', {
        method: 'POST',
        body: {
          classId,
          term,
          sessionId,
          studentId
        }
      });
      const [generated] = data.remarks || [];
      if (generated) {
        setRemarkRows((prev) => prev.map((row) => (
          row.studentId === studentId
            ? { ...row, ...generated, override: normalizeOverrideForm(generated.override) }
            : row
        )));
        setRemarksStatus({ error: '', success: `Draft head teacher remark regenerated for ${generated.studentName}.` });
      }
    } catch (err) {
      setRemarksStatus({ error: err.message || 'Unable to regenerate head teacher remark.', success: '' });
    } finally {
      setRegeneratingStudentId('');
    }
  }

  function updateCalendarField(key, value) {
    setCalendarForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateReportSettingsField(key, value) {
    setReportSettingsForm((prev) => ({ ...prev, [key]: value }));
  }

  async function saveAcademicCalendar() {
    if (!sessionId || !term) return;
    setCalendarSaving(true);
    setError('');
    setSuccess('');

    try {
      const data = await apiJson('/admin/academic-calendar', {
        method: 'PUT',
        body: {
          sessionId,
          term,
          ...calendarForm
        }
      });
      setAcademicCalendar(data.calendar || []);
      setCalendarForm(normalizeCalendarForm(data.entry));
      setSuccess(`${term} academic calendar saved for the selected session.`);
    } catch (err) {
      setError(err.message || 'Unable to save academic calendar.');
    } finally {
      setCalendarSaving(false);
    }
  }

  async function saveReportSettings() {
    setReportSettingsSaving(true);
    setError('');
    setSuccess('');

    try {
      const data = await apiJson('/results/admin/report-settings', {
        method: 'PUT',
        body: reportSettingsForm
      });
      const normalized = normalizeReportSettingsForm(data.settings);
      setReportSettingsForm(normalized);
      setReportCard((prev) => (prev ? { ...prev, reportSettings: normalized } : prev));
      setSuccess('Report settings saved successfully.');
    } catch (err) {
      setError(err.message || 'Unable to save report settings.');
    } finally {
      setReportSettingsSaving(false);
    }
  }

  async function handleReportSignatureChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    setReportSignatureBusy(true);
    setError('');
    setSuccess('');

    try {
      const response = await apiFetch('/results/admin/report-settings/signature', {
        method: 'POST',
        body: formData
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Unable to upload report signature.');
      }
      const normalized = normalizeReportSettingsForm(data.settings);
      setReportSettingsForm(normalized);
      setReportCard((prev) => (prev ? { ...prev, reportSettings: normalized } : prev));
      setSuccess('Report signature uploaded successfully.');
    } catch (err) {
      setError(err.message || 'Unable to upload report signature.');
    } finally {
      setReportSignatureBusy(false);
      if (reportSignatureInputRef.current) {
        reportSignatureInputRef.current.value = '';
      }
    }
  }

  async function removeReportSignature() {
    setReportSignatureBusy(true);
    setError('');
    setSuccess('');

    try {
      const data = await apiJson('/results/admin/report-settings/signature', {
        method: 'DELETE'
      });
      const normalized = normalizeReportSettingsForm(data.settings);
      setReportSettingsForm(normalized);
      setReportCard((prev) => (prev ? { ...prev, reportSettings: normalized } : prev));
      setSuccess('Report signature removed successfully.');
    } catch (err) {
      setError(err.message || 'Unable to remove report signature.');
    } finally {
      setReportSignatureBusy(false);
      if (reportSignatureInputRef.current) {
        reportSignatureInputRef.current.value = '';
      }
    }
  }

  return (
    <PortalLayout
      role="admin"
      title="Result Approval and Publishing"
      subtitle="Teacher-uploaded scores now flow into an institution-scoped admin review before publication."
    >
      <div className="grid gap-4 lg:grid-cols-3">
        {summaryCards.map((card) => (
          <article key={card.key} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${card.tone}`}>
              {card.key === 'rows' ? institution : term}
            </p>
            <p className="mt-4 text-3xl font-bold text-slate-900">
              {card.value}
            </p>
            <p className="mt-2 text-sm text-slate-600">{card.label}</p>
          </article>
        ))}
      </div>

      <section className="mt-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-2xl text-primary">Result Compilation Readiness</h2>
            <p className="mt-2 text-sm text-slate-600">
              Publishing stays locked until every assigned teacher has submitted every assigned subject for every student in this scope.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${readiness?.ready ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
              {readiness?.ready ? 'Ready to publish' : 'Not ready'}
            </span>
            <button
              type="button"
              onClick={notifyMissingTeachers}
              disabled={!missingTeachers.length || notifyingTeachers}
              className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {notifyingTeachers ? 'Notifying...' : 'Notify missing teachers'}
            </button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          {[
            ['Expected rows', readiness?.expectedRows ?? 0],
            ['Submitted rows', readiness?.submittedRows ?? 0],
            ['Missing rows', readiness?.missingCount ?? 0],
            ['Teacher scopes', readiness?.assignmentCount ?? 0]
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
            </div>
          ))}
        </div>
        {!!missingTeachers.length && (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Teachers with outstanding submissions</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {missingTeachers.map((teacher) => (
                <span key={teacher.teacherId} className="rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-800">
                  {teacher.teacherName} • {teacher.missingCount} missing
                </span>
              ))}
            </div>
          </div>
        )}
        {!!missingRows.length && (
          <div className="mt-4 max-h-72 overflow-auto rounded-2xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">Class</th>
                  <th className="px-4 py-3">Subject</th>
                  <th className="px-4 py-3">Teacher</th>
                </tr>
              </thead>
              <tbody>
                {missingRows.slice(0, 80).map((row) => (
                  <tr key={`${row.studentId}-${row.subjectId}-${row.term}`} className="border-t border-slate-100">
                    <td className="px-4 py-3">{row.studentName}</td>
                    <td className="px-4 py-3">{row.classLabel}</td>
                    <td className="px-4 py-3">{row.subjectName}</td>
                    <td className="px-4 py-3">{row.teacherNames?.join(', ') || 'Assigned teacher'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <form onSubmit={publishResults} className="mt-6 grid gap-3 rounded-[28px] border border-slate-200 bg-white p-5 sm:grid-cols-6">
        <select
          value={institution}
          onChange={(e) => {
            setInstitution(e.target.value);
            setClassId('');
          }}
          className="rounded-2xl border border-slate-300 px-4 py-3 text-sm"
        >
          {ADMIN_INSTITUTIONS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select value={term} onChange={(e) => setTerm(e.target.value)} className="rounded-2xl border border-slate-300 px-4 py-3 text-sm">
          {['First Term', 'Second Term', 'Third Term'].map((termOption) => (
            <option key={termOption} value={termOption}>
              {termOption}
            </option>
          ))}
        </select>
        <select
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
          className="rounded-2xl border border-slate-300 px-4 py-3 text-sm"
        >
          {!sessions.length && <option value="">No sessions available</option>}
          {sessions.map((session) => (
            <option key={session.id} value={session.id}>
              {session.sessionName} {session.isActive ? '(Active)' : ''}
            </option>
          ))}
        </select>
        <select
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          className="rounded-2xl border border-slate-300 px-4 py-3 text-sm"
        >
          <option value="">All Classes</option>
          {classes.map((classItem) => (
            <option key={classItem.id} value={classItem.id}>
              {classItem.name} {classItem.arm}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={loading || actionBusy || !sessionId || !hasPublishableResults || !readiness?.ready}
          className="interactive-button rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {publishing ? 'Publishing...' : 'Publish Approved Results'}
        </button>
        <button
          type="button"
          onClick={compilePublishedResults}
          disabled={loading || actionBusy || !sessionId}
          className="interactive-button rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {compiling ? 'Compiling...' : 'Compile Final Report Cards'}
        </button>
        <button
          type="button"
          onClick={toggleClassAccess}
          disabled={loading || actionBusy || !classId}
          className="interactive-button rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {accessBusy ? 'Updating Access...' : classAccessOpen ? 'Close Results Access' : 'Open Results Access'}
        </button>
        <button
          type="button"
          onClick={toggleTermClosed}
          disabled={loading || actionBusy || !term || !sessionId}
          className="interactive-button rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {termBusy ? 'Updating Term...' : termClosed ? 'Reopen Term' : 'Close Term'}
        </button>
      </form>

      <section className="mt-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Batch 6</p>
            <h2 className="mt-2 font-heading text-2xl text-primary">Academic calendar and next term begins</h2>
            <p className="mt-2 text-sm text-slate-600">
              Manage the term calendar here so report sheets can show the correct next resumption date instead of the placeholder.
            </p>
          </div>
          <button
            type="button"
            onClick={saveAcademicCalendar}
            disabled={!sessionId || !term || calendarSaving}
            className="interactive-button rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {calendarSaving ? 'Saving Calendar...' : 'Save Academic Calendar'}
          </button>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label className="grid gap-2 text-sm text-slate-700">
            <span className="font-semibold text-slate-800">Term starts</span>
            <input type="date" value={calendarForm.termStartDate} onChange={(e) => updateCalendarField('termStartDate', e.target.value)} className="rounded-2xl border border-slate-300 px-3 py-3" />
          </label>
          <label className="grid gap-2 text-sm text-slate-700">
            <span className="font-semibold text-slate-800">Term ends</span>
            <input type="date" value={calendarForm.termEndDate} onChange={(e) => updateCalendarField('termEndDate', e.target.value)} className="rounded-2xl border border-slate-300 px-3 py-3" />
          </label>
          <label className="grid gap-2 text-sm text-slate-700">
            <span className="font-semibold text-slate-800">Next term begins</span>
            <input type="date" value={calendarForm.nextTermBegins} onChange={(e) => updateCalendarField('nextTermBegins', e.target.value)} className="rounded-2xl border border-slate-300 px-3 py-3" />
          </label>
          <label className="grid gap-2 text-sm text-slate-700">
            <span className="font-semibold text-slate-800">Exam starts</span>
            <input type="date" value={calendarForm.examStartDate} onChange={(e) => updateCalendarField('examStartDate', e.target.value)} className="rounded-2xl border border-slate-300 px-3 py-3" />
          </label>
          <label className="grid gap-2 text-sm text-slate-700">
            <span className="font-semibold text-slate-800">Exam ends</span>
            <input type="date" value={calendarForm.examEndDate} onChange={(e) => updateCalendarField('examEndDate', e.target.value)} className="rounded-2xl border border-slate-300 px-3 py-3" />
          </label>
          <label className="grid gap-2 text-sm text-slate-700">
            <span className="font-semibold text-slate-800">Publishing date</span>
            <input type="date" value={calendarForm.resultPublishingDate} onChange={(e) => updateCalendarField('resultPublishingDate', e.target.value)} className="rounded-2xl border border-slate-300 px-3 py-3" />
          </label>
          <label className="grid gap-2 text-sm text-slate-700">
            <span className="font-semibold text-slate-800">Holiday starts</span>
            <input type="date" value={calendarForm.holidayStartDate} onChange={(e) => updateCalendarField('holidayStartDate', e.target.value)} className="rounded-2xl border border-slate-300 px-3 py-3" />
          </label>
          <label className="grid gap-2 text-sm text-slate-700">
            <span className="font-semibold text-slate-800">Holiday ends</span>
            <input type="date" value={calendarForm.holidayEndDate} onChange={(e) => updateCalendarField('holidayEndDate', e.target.value)} className="rounded-2xl border border-slate-300 px-3 py-3" />
          </label>
        </div>
        <label className="mt-4 grid gap-2 text-sm text-slate-700">
          <span className="font-semibold text-slate-800">Notes</span>
          <textarea
            value={calendarForm.notes}
            onChange={(e) => updateCalendarField('notes', e.target.value)}
            rows={3}
            className="rounded-2xl border border-slate-300 px-3 py-3"
            placeholder="Optional term note, for example special closure or exam context."
          />
        </label>
      </section>

      <section className="mt-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Report Settings</p>
            <h2 className="mt-2 font-heading text-2xl text-primary">Head signature and report metadata</h2>
            <p className="mt-2 text-sm text-slate-600">
              Keep report approval details here so official report sheets are managed separately from the public website content.
            </p>
          </div>
          <button
            type="button"
            onClick={saveReportSettings}
            disabled={reportSettingsSaving}
            className="interactive-button rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {reportSettingsSaving ? 'Saving Settings...' : 'Save Report Settings'}
          </button>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[220px,minmax(0,1fr)]">
          <div className="space-y-3">
            <div className="flex h-44 items-center justify-center overflow-hidden rounded-[24px] border border-slate-200 bg-slate-50 p-4 shadow-sm">
              {reportSettingsForm.signatureImage ? (
                <img src={reportSettingsForm.signatureImage} alt="Report signature preview" className="max-h-full w-full object-contain" />
              ) : (
                <span className="text-center text-sm font-semibold text-slate-500">No head signature uploaded</span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => reportSignatureInputRef.current?.click()}
                disabled={reportSignatureBusy}
                className="interactive-button w-full"
              >
                {reportSignatureBusy ? 'Uploading...' : reportSettingsForm.signatureImage ? 'Change Signature' : 'Upload Signature'}
              </button>
              <button
                type="button"
                onClick={removeReportSignature}
                disabled={reportSignatureBusy || !reportSettingsForm.signatureImage}
                className="interactive-button w-full border-red-200 text-red-700"
              >
                Remove Signature
              </button>
              <input
                ref={reportSignatureInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleReportSignatureChange}
                className="hidden"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm text-slate-700">
              <span className="font-semibold text-slate-800">Head teacher name</span>
              <input
                value={reportSettingsForm.headName}
                onChange={(e) => updateReportSettingsField('headName', e.target.value)}
                className="rounded-2xl border border-slate-300 px-3 py-3"
                placeholder="e.g. Mrs. Amina Yusuf"
              />
            </label>
            <label className="grid gap-2 text-sm text-slate-700">
              <span className="font-semibold text-slate-800">Head teacher title</span>
              <input
                value={reportSettingsForm.headTitle}
                onChange={(e) => updateReportSettingsField('headTitle', e.target.value)}
                className="rounded-2xl border border-slate-300 px-3 py-3"
                placeholder="Head Teacher"
              />
            </label>
            <label className="grid gap-2 text-sm text-slate-700 md:col-span-2">
              <span className="font-semibold text-slate-800">Parent acknowledgement text</span>
              <textarea
                value={reportSettingsForm.parentAcknowledgementText}
                onChange={(e) => updateReportSettingsField('parentAcknowledgementText', e.target.value)}
                rows={3}
                className="rounded-2xl border border-slate-300 px-3 py-3"
              />
            </label>
            <label className="grid gap-2 text-sm text-slate-700 md:col-span-2">
              <span className="font-semibold text-slate-800">Footer note</span>
              <textarea
                value={reportSettingsForm.footerNote}
                onChange={(e) => updateReportSettingsField('footerNote', e.target.value)}
                rows={2}
                className="rounded-2xl border border-slate-300 px-3 py-3"
                placeholder="Optional report footer note for official printouts."
              />
            </label>
          </div>
        </div>
      </section>

      {classId && (
        <section className="mt-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Report Remarks</p>
              <h2 className="mt-2 font-heading text-2xl text-primary">Head teacher remarks</h2>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <button
                  type="button"
                  onClick={() => generateHeadTeacherRemarks({ preserveExisting: true })}
                  disabled={remarksGenerating || !remarkRows.length}
                  className="interactive-button rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {remarksGenerating ? 'Generating Drafts...' : 'Generate Blank Remarks'}
                </button>
                <button
                  type="button"
                  onClick={confirmRegenerateAllHeadTeacherRemarks}
                  disabled={remarksGenerating || !remarkRows.length}
                  className="interactive-button rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {remarksGenerating ? 'Generating Drafts...' : 'Regenerate All Drafts'}
                </button>
                <button
                  type="button"
                  onClick={saveHeadTeacherRemarks}
                  disabled={remarksSaving || !remarkRows.length}
                  className="interactive-button rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {remarksSaving ? 'Saving Remarks...' : 'Save Head Remarks'}
                </button>
            </div>
          </div>
          {remarksStatus.error && <p className="mt-3 text-sm text-red-600">{remarksStatus.error}</p>}
          {remarksStatus.success && <p className="mt-3 text-sm text-emerald-700">{remarksStatus.success}</p>}
          <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">Insight</th>
                  <th className="px-4 py-3">Strengths / Weaknesses</th>
                  <th className="px-4 py-3">Manual Attendance Override</th>
                  <th className="px-4 py-3">Behaviour Override</th>
                  <th className="px-4 py-3">Class Teacher&apos;s Remark</th>
                  <th className="px-4 py-3">Head Teacher&apos;s Remark</th>
                </tr>
              </thead>
              <tbody>
                {remarkRows.map((row) => (
                  <tr key={row.studentId} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-semibold text-slate-800">{row.studentName}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      <div className="space-y-1">
                        <p>Avg: {row.insight?.averageScore || 0} • Grade: {row.insight?.overallGrade || '—'} • Attendance: {row.insight?.attendanceRate || 0}%</p>
                        <p>
                          Strong: {row.insight?.strengths?.length ? row.insight.strengths.join(', ') : '—'}
                          {' '}• Focus: {row.insight?.weaknesses?.length ? row.insight.weaknesses.join(', ') : '—'}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="grid gap-2">
                        <input
                          value={row.strengths || ''}
                          onChange={(event) => updateRemarkGuide(row.studentId, 'strengths', event.target.value)}
                          className="w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                          placeholder="Editable strengths, comma separated"
                        />
                        <input
                          value={row.weaknesses || ''}
                          onChange={(event) => updateRemarkGuide(row.studentId, 'weaknesses', event.target.value)}
                          className="w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                          placeholder="Editable weaknesses, comma separated"
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="grid gap-2 md:grid-cols-2">
                        <input
                          type="number"
                          min="0"
                          value={row.override?.attendanceSummary?.totalSchoolDays ?? ''}
                          onChange={(event) => updateOverrideField(row.studentId, 'attendanceSummary', 'totalSchoolDays', event.target.value)}
                          className="w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm"
                          placeholder="Total days"
                        />
                        <input
                          type="number"
                          min="0"
                          value={row.override?.attendanceSummary?.daysPresent ?? ''}
                          onChange={(event) => updateOverrideField(row.studentId, 'attendanceSummary', 'daysPresent', event.target.value)}
                          className="w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm"
                          placeholder="Present"
                        />
                        <input
                          type="number"
                          min="0"
                          value={row.override?.attendanceSummary?.daysAbsent ?? ''}
                          onChange={(event) => updateOverrideField(row.studentId, 'attendanceSummary', 'daysAbsent', event.target.value)}
                          className="w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm"
                          placeholder="Absent"
                        />
                        <input
                          type="number"
                          min="0"
                          value={row.override?.attendanceSummary?.lateComing ?? ''}
                          onChange={(event) => updateOverrideField(row.studentId, 'attendanceSummary', 'lateComing', event.target.value)}
                          className="w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm"
                          placeholder="Late"
                        />
                        <textarea
                          value={row.override?.attendanceSummary?.attendanceRemark || ''}
                          onChange={(event) => updateOverrideField(row.studentId, 'attendanceSummary', 'attendanceRemark', event.target.value)}
                          rows={2}
                          className="w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm md:col-span-2"
                          placeholder="Optional attendance remark"
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="grid gap-2 md:grid-cols-2">
                        {['discipline', 'responsibility', 'cooperation', 'respect', 'initiative'].map((field) => (
                          <label key={field} className="grid gap-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                            <span>{field}</span>
                            <select
                              value={row.override?.behaviorRatings?.[field] || ''}
                              onChange={(event) => updateOverrideField(row.studentId, 'behaviorRatings', field, event.target.value)}
                              className="rounded-2xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
                            >
                              <option value="">Auto</option>
                              {['A', 'B', 'C', 'D'].map((grade) => (
                                <option key={grade} value={grade}>{grade}</option>
                              ))}
                            </select>
                          </label>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{row.classTeacherRemark || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="mb-2 flex justify-end">
                        <button
                          type="button"
                          onClick={() => regenerateHeadTeacherRemark(row.studentId)}
                          disabled={regeneratingStudentId === row.studentId}
                          className="interactive-button rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {regeneratingStudentId === row.studentId ? 'Regenerating...' : 'Regenerate'}
                        </button>
                      </div>
                      <textarea
                        value={row.headTeacherRemark || ''}
                        onChange={(event) => updateHeadTeacherRemark(row.studentId, event.target.value)}
                        rows={2}
                        className="w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                        placeholder="Enter head teacher remark"
                      />
                    </td>
                  </tr>
                ))}
                {!remarkRows.length && (
                  <tr>
                    <td className="px-4 py-6 text-center text-slate-500" colSpan={7}>
                      Select a class with students to manage head teacher remarks.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {loading && <p className="mt-4 text-sm text-slate-600">Loading result review data...</p>}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {success && <p className="mt-4 text-sm text-emerald-700">{success}</p>}
      {!!blockedStudents.length && (
        <section className="mt-4 rounded-[24px] border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Publishing Hold</p>
          <p className="mt-2 text-sm text-amber-900">
            These rows are still missing teacher submissions, so publishing stays locked for this class scope.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {blockedStudents.map((student) => (
              <span key={student.studentId} className="rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-800">
                {student.studentName} {student.classLabel ? `• ${student.classLabel}` : ''} {student.subjectName ? `• ${student.subjectName}` : ''}
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="mt-8 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-2xl text-primary">{institution} Result Review</h2>
            <p className="mt-2 text-sm text-slate-600">
              Filter by class when needed. Selecting `JSS 1` will now only show `JSS 1` records.
            </p>
          </div>
          <span className={`rounded-full border px-3 py-2 text-xs font-semibold ${institutionAccent(institution)}`}>
            {groupedResults.length} students in review
          </span>
        </div>

        <div className="mt-5 overflow-x-auto rounded-3xl border border-slate-200">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            <span>Results table</span>
            <button
              type="button"
              onClick={() => {
                const nextValue = !resolveShowRows(institution);
                setShowRowsByInstitution((prev) => ({ ...prev, [institution]: nextValue }));
              }}
              className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
            >
              {resolveShowRows(institution) ? 'Hide rows' : 'Show rows'}
            </button>
          </div>
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Class</th>
                <th className="px-4 py-3">Subjects</th>
                <th className="px-4 py-3">Average</th>
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3">Published</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!resolveShowRows(institution) && (
                <tr>
                  <td className="px-4 py-6 text-center text-slate-500" colSpan={7}>
                    Rows are hidden. Click “Show rows” to display results.
                  </td>
                </tr>
              )}
              {resolveShowRows(institution) && groupedResults.map((group) => {
                const open = Boolean(expandedStudents[group.studentId]);

                return (
                  <Fragment key={group.studentId}>
                    <tr className="border-t border-slate-100">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800">{group.studentName}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {buildStudentCode({ id: group.studentId, institution })}
                        </p>
                      </td>
                      <td className="px-4 py-3">{group.classLabel}</td>
                      <td className="px-4 py-3">{group.subjectCount}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{group.averageTotal}</td>
                      <td className="px-4 py-3">{group.submittedCount}/{group.subjectCount}</td>
                      <td className="px-4 py-3">{group.publishedCount}/{group.subjectCount}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button type="button" onClick={() => toggleExpanded(group.studentId)} className="rounded-xl border border-slate-300 px-3 py-2 text-xs">
                            {open ? 'Hide' : 'Open'}
                          </button>
                          <button type="button" disabled={reportLoadingStudentId === group.studentId} onClick={() => loadReportSheet(group.studentId)} className="rounded-xl border border-primary px-3 py-2 text-xs font-semibold text-primary disabled:cursor-not-allowed disabled:opacity-60">
                            {reportLoadingStudentId === group.studentId ? 'Loading Sheet...' : 'Preview Sheet'}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {open && (
                      <tr className="border-t border-slate-100 bg-slate-50/70">
                        <td className="px-4 py-4" colSpan={7}>
                          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                            <table className="min-w-full text-sm">
                              <thead className="bg-slate-50 text-left">
                                <tr>
                                  <th className="px-4 py-3">Subject</th>
                                  <th className="px-4 py-3">Test 1</th>
                                  <th className="px-4 py-3">Test 2</th>
                                  <th className="px-4 py-3">CA</th>
                                  <th className="px-4 py-3">Exam</th>
                                  <th className="px-4 py-3">Total</th>
                                  <th className="px-4 py-3">Grade</th>
                                  <th className="px-4 py-3">Teacher</th>
                                  <th className="px-4 py-3">Notes</th>
                                  <th className="px-4 py-3">Published</th>
                                </tr>
                              </thead>
                              <tbody>
                                {group.rows.map((row) => (
                                  <tr key={row.id} className="border-t border-slate-100">
                                    <td className="px-4 py-3">{row.subjectName}</td>
                                    <td className="px-4 py-3">{row.test1 ?? '—'}</td>
                                    <td className="px-4 py-3">{row.test2 ?? '—'}</td>
                                    <td className="px-4 py-3">{row.ca}</td>
                                    <td className="px-4 py-3">{row.exam}</td>
                                    <td className="px-4 py-3 font-semibold text-slate-900">{row.total}</td>
                                    <td className="px-4 py-3">{row.grade}</td>
                                    <td className="px-4 py-3">{row.teacherName || '—'}</td>
                                    <td className="px-4 py-3">
                                      {[row.caNote && `CA: ${row.caNote}`, row.examNote && `Exam: ${row.examNote}`].filter(Boolean).join(' • ') || '—'}
                                    </td>
                                    <td className="px-4 py-3">{row.published ? 'Yes' : 'No'}</td>
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
              {resolveShowRows(institution) && !groupedResults.length && (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={7}>
                    {loading ? 'Loading result review data...' : 'No results found for this institution, term, and class scope.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {reportCard && (
        <section className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-heading text-2xl text-primary">Admin Report Sheet Preview</h2>
              <p className="mt-1 text-sm text-slate-600">
                Review this approved sheet design before publishing or printing.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  document.body.classList.add('print-mode');
                  setTimeout(() => {
                    window.print();
                    setTimeout(() => document.body.classList.remove('print-mode'), 500);
                  }, 100);
                }}
                className="rounded-2xl border border-primary px-4 py-3 text-sm font-semibold text-primary"
              >
                Print / Save as PDF
              </button>
              <button
                type="button"
                onClick={() => setReportCard(null)}
                className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700"
              >
                Close Preview
              </button>
            </div>
          </div>
          <ReportCardSheet reportCard={reportCard} />
        </section>
      )}
    </PortalLayout>
  );
}

export default AdminResultsPublish;
