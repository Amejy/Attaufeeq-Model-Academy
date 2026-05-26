import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import PortalLayout from '../../components/PortalLayout';

const TERM_OPTIONS = ['First Term', 'Second Term', 'Third Term'];
const ATTENDANCE_STATUS_OPTIONS = ['present', 'late', 'absent'];
const BEHAVIOR_FIELDS = [
  ['discipline', 'Discipline'],
  ['responsibility', 'Responsibility'],
  ['cooperation', 'Cooperation'],
  ['respect', 'Respect'],
  ['initiative', 'Initiative']
];
const BEHAVIOR_RATINGS = ['A', 'B', 'C', 'D'];
const normalizeTerm = (value) => String(value || '').trim();

function statusLabel(value) {
  if (value === 'late') return 'Late';
  if (value === 'absent') return 'Absent';
  return 'Present';
}

function TeacherAttendance() {
  const { apiJson } = useAuth();
  const [options, setOptions] = useState({ classes: [], students: [] });
  const [records, setRecords] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [showRosterRows, setShowRosterRows] = useState(true);
  const [showRecordRows, setShowRecordRows] = useState(true);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    classId: '',
    term: 'First Term'
  });
  const [rows, setRows] = useState([]);
  const loadDataSeq = useRef(0);

  const loadData = useCallback(async (options = {}) => {
    const seq = ++loadDataSeq.current;
    const preserveSuccess = Boolean(options.preserveSuccess);
    setError('');
    if (!preserveSuccess) {
      setSuccess('');
    }
    setOptions({ classes: [], students: [] });
    setRecords([]);
    setSessions([]);
    setRows([]);
    try {
      const sessionsData = await apiJson('/results/sessions');
      if (seq !== loadDataSeq.current) return;
      const sessionRows = sessionsData.sessions || [];
      const activeSession = sessionsData.activeSession || sessionRows.find((item) => item.isActive) || sessionRows[0] || null;
      const effectiveSessionId = sessionId && sessionRows.some((item) => item.id === sessionId)
        ? sessionId
        : activeSession?.id || '';

      const [optionsData, recordsData] = await Promise.all([
        apiJson(`/attendance/teacher/options${effectiveSessionId ? `?sessionId=${encodeURIComponent(effectiveSessionId)}` : ''}`),
        apiJson(`/attendance/teacher/records${effectiveSessionId ? `?sessionId=${encodeURIComponent(effectiveSessionId)}` : ''}`)
      ]);
      if (seq !== loadDataSeq.current) return;

      setSessions(sessionRows);
      setOptions(optionsData);
      setRecords(recordsData.records || []);
      if (sessionId !== effectiveSessionId) {
        setSessionId(effectiveSessionId);
      }
      setForm((prev) => ({
        ...prev,
        ...(() => {
          const termAssignments = (optionsData.assignments || []).filter(
            (item) => normalizeTerm(item.term) === normalizeTerm(prev.term)
          );
          const termClassIds = new Set(
            termAssignments
              .filter((item) => item.assignmentRole === 'Lead Teacher')
              .map((item) => item.classId)
          );
          const termClasses = (optionsData.classes || []).filter((item) => termClassIds.has(item.id));
          const nextClassId =
            prev.classId && termClasses.some((item) => item.id === prev.classId)
              ? prev.classId
              : termClasses[0]?.id || '';

          return {
            classId: nextClassId
          };
        })()
      }));
    } catch (err) {
      if (seq !== loadDataSeq.current) return;
      setError(err.message || 'Unable to load attendance module.');
    }
  }, [apiJson, sessionId]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadData({ preserveSuccess: true });
    });
  }, [loadData]);

  const classStudents = useMemo(
    () => options.students.filter((item) => item.classId === form.classId),
    [options.students, form.classId]
  );

  const termAssignments = useMemo(
    () =>
      (options.assignments || []).filter(
        (item) => normalizeTerm(item.term) === normalizeTerm(form.term)
      ),
    [form.term, options.assignments]
  );

  const termClasses = useMemo(() => {
    const classIds = new Set(
      termAssignments
        .filter((item) => item.assignmentRole === 'Lead Teacher')
        .map((item) => item.classId)
    );

    return options.classes.filter((item) => classIds.has(item.id));
  }, [options.classes, termAssignments]);

  useEffect(() => {
    if (!termClasses.length) {
      setForm((prev) => (prev.classId ? { ...prev, classId: '' } : prev));
      return;
    }

    if (!termClasses.some((item) => item.id === form.classId)) {
      setForm((prev) => ({ ...prev, classId: termClasses[0]?.id || '' }));
    }
  }, [form.classId, termClasses]);

  const filteredRecords = useMemo(
    () =>
      records.filter((record) => {
        if (sessionId && record.sessionId && record.sessionId !== sessionId) return false;
        if (normalizeTerm(record.term) !== normalizeTerm(form.term)) return false;
        if (form.classId && record.classId !== form.classId) return false;
        return true;
      }),
    [form.classId, form.term, records, sessionId]
  );
  const hasClassOptions = Boolean(termClasses.length);
  const canSaveAttendance = Boolean(form.classId && rows.length);

  useEffect(() => {
    queueMicrotask(() => {
      setRows(
        classStudents.map((student) => ({
          studentId: student.id,
          fullName: student.fullName,
          status: 'present',
          present: true,
          behavior: {
            discipline: 'A',
            responsibility: 'A',
            cooperation: 'A',
            respect: 'A',
            initiative: 'A'
          },
          remark: ''
        }))
      );
    });
  }, [classStudents]);

  function updateRow(studentId, key, value) {
    setRows((prev) => prev.map((row) => (row.studentId === studentId ? { ...row, [key]: value } : row)));
  }

  function updateBehavior(studentId, key, value) {
    setRows((prev) =>
      prev.map((row) =>
        row.studentId === studentId
          ? { ...row, behavior: { ...(row.behavior || {}), [key]: value } }
          : row
      )
    );
  }

  async function submitAttendance(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);

    try {
      const data = await apiJson('/attendance/teacher/mark', {
        method: 'POST',
        body: {
          ...form,
          sessionId,
          rows: rows.map((row) => ({
            ...row,
            present: row.status !== 'absent'
          }))
        }
      });
      setSuccess(`${data.savedCount || 0} attendance records saved.`);
      void loadData();
    } catch (err) {
      setError(err.message || 'Unable to save attendance.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <PortalLayout
      role="teacher"
      title="Attendance Register"
      subtitle="Mark daily attendance for assigned classes."
    >
      <form onSubmit={submitAttendance} className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-5">
          <input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} className="rounded-md border border-slate-300 px-3 py-2 text-sm" required />
          <select value={sessionId} onChange={(e) => setSessionId(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" required>
            {!sessions.length && <option value="">No sessions available</option>}
            {sessions.map((item) => <option key={item.id} value={item.id}>{item.sessionName} {item.isActive ? '(Active)' : ''}</option>)}
          </select>
          {hasClassOptions ? (
            <select value={form.classId} onChange={(e) => setForm((p) => ({ ...p, classId: e.target.value }))} className="rounded-md border border-slate-300 px-3 py-2 text-sm" required>
              {termClasses.map((item) => <option key={item.id} value={item.id}>{item.name} {item.arm}</option>)}
            </select>
          ) : (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              No assigned classes are available for this term yet.
            </p>
          )}
          <select value={form.term} onChange={(e) => setForm((p) => ({ ...p, term: e.target.value }))} className="rounded-md border border-slate-300 px-3 py-2 text-sm" required>
            {TERM_OPTIONS.map((term) => <option key={term} value={term}>{term}</option>)}
          </select>
          <button
            type="submit"
            disabled={saving || !canSaveAttendance}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Saving Attendance...' : 'Save Attendance'}
          </button>
        </div>

        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            <span>Attendance roster</span>
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
                <th className="px-3 py-2">Student</th>
                <th className="px-3 py-2">Status</th>
                {BEHAVIOR_FIELDS.map(([, label]) => (
                  <th key={label} className="px-3 py-2">{label}</th>
                ))}
                <th className="px-3 py-2">Remark</th>
              </tr>
            </thead>
            <tbody>
              {!showRosterRows && (
                <tr>
                  <td colSpan={8} className="px-3 py-4 text-sm text-slate-600 text-center">
                    Rows are hidden. Click “Show rows” to display the roster.
                  </td>
                </tr>
              )}
              {showRosterRows && rows.map((row) => (
                <tr key={row.studentId} className="border-t border-slate-100">
                  <td className="px-3 py-2">{row.fullName}</td>
                  <td className="px-3 py-2">
                    <select
                      value={row.status || 'present'}
                      onChange={(e) => updateRow(row.studentId, 'status', e.target.value)}
                      className="rounded-md border border-slate-300 px-2 py-1"
                    >
                      {ATTENDANCE_STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>{statusLabel(status)}</option>
                      ))}
                    </select>
                  </td>
                  {BEHAVIOR_FIELDS.map(([key]) => (
                    <td key={key} className="px-3 py-2">
                      <select
                        value={row.behavior?.[key] || 'A'}
                        onChange={(e) => updateBehavior(row.studentId, key, e.target.value)}
                        className="rounded-md border border-slate-300 px-2 py-1"
                      >
                        {BEHAVIOR_RATINGS.map((rating) => (
                          <option key={rating} value={rating}>{rating}</option>
                        ))}
                      </select>
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <input value={row.remark} onChange={(e) => updateRow(row.studentId, 'remark', e.target.value)} className="w-full rounded-md border border-slate-300 px-2 py-1" placeholder="Optional remark" />
                  </td>
                </tr>
              ))}
              {showRosterRows && !rows.length && (
                <tr>
                  <td colSpan={8} className="px-3 py-4 text-sm text-slate-600">
                    No enrolled students are available for the selected class.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </form>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {success && <p className="mt-3 text-sm text-emerald-700">{success}</p>}

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-heading text-2xl text-primary">Recent Attendance Records</h2>
        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            <span>Recent attendance</span>
            <button
              type="button"
              onClick={() => setShowRecordRows((prev) => !prev)}
              className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
            >
              {showRecordRows ? 'Hide rows' : 'Show rows'}
            </button>
          </div>
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Class</th>
                <th className="px-3 py-2">Subject</th>
                <th className="px-3 py-2">Student</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Behaviour</th>
                <th className="px-3 py-2">Remark</th>
              </tr>
            </thead>
            <tbody>
              {!showRecordRows && (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-sm text-slate-600 text-center">
                    Rows are hidden. Click “Show rows” to display attendance records.
                  </td>
                </tr>
              )}
              {showRecordRows && filteredRecords.slice(0, 50).map((record) => (
                <tr key={record.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{record.date}</td>
                  <td className="px-3 py-2">{record.classLabel}</td>
                  <td className="px-3 py-2">{record.subjectName}</td>
                  <td className="px-3 py-2">{record.studentName}</td>
                  <td className="px-3 py-2">{statusLabel(record.status || (record.present ? 'present' : 'absent'))}</td>
                  <td className="px-3 py-2">
                    {BEHAVIOR_FIELDS.map(([key, label]) => `${label}: ${record.behavior?.[key] || '—'}`).join(' • ')}
                  </td>
                  <td className="px-3 py-2">{record.remark || '—'}</td>
                </tr>
              ))}
              {showRecordRows && !filteredRecords.length && (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-sm text-slate-600">
                    No attendance records match the selected term, class, and subject yet.
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

export default TeacherAttendance;
