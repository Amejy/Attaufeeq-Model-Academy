import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import PortalLayout from '../../components/PortalLayout';

const TERM_OPTIONS = ['First Term', 'Second Term', 'Third Term'];
const normalizeTerm = (value) => String(value || '').trim();

function TeacherAttendance() {
  const { apiJson } = useAuth();
  const [options, setOptions] = useState({ classes: [], students: [] });
  const [records, setRecords] = useState([]);
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
    setRows([]);
    try {
      const [optionsData, recordsData] = await Promise.all([
        apiJson('/attendance/teacher/options'),
        apiJson('/attendance/teacher/records')
      ]);
      if (seq !== loadDataSeq.current) return;

      setOptions(optionsData);
      setRecords(recordsData.records || []);
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
  }, [apiJson]);

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
        if (normalizeTerm(record.term) !== normalizeTerm(form.term)) return false;
        if (form.classId && record.classId !== form.classId) return false;
        return true;
      }),
    [form.classId, form.term, records]
  );
  const hasClassOptions = Boolean(termClasses.length);
  const canSaveAttendance = Boolean(form.classId && rows.length);

  useEffect(() => {
    queueMicrotask(() => {
      setRows(
        classStudents.map((student) => ({
          studentId: student.id,
          fullName: student.fullName,
          present: true,
          remark: ''
        }))
      );
    });
  }, [classStudents]);

  function updateRow(studentId, key, value) {
    setRows((prev) => prev.map((row) => (row.studentId === studentId ? { ...row, [key]: value } : row)));
  }

  async function submitAttendance(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);

    try {
      const data = await apiJson('/attendance/teacher/mark', {
        method: 'POST',
        body: { ...form, rows }
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
        <div className="grid gap-3 sm:grid-cols-4">
          <input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} className="rounded-md border border-slate-300 px-3 py-2 text-sm" required />
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
                <th className="px-3 py-2">Present</th>
                <th className="px-3 py-2">Remark</th>
              </tr>
            </thead>
            <tbody>
              {!showRosterRows && (
                <tr>
                  <td colSpan={3} className="px-3 py-4 text-sm text-slate-600 text-center">
                    Rows are hidden. Click “Show rows” to display the roster.
                  </td>
                </tr>
              )}
              {showRosterRows && rows.map((row) => (
                <tr key={row.studentId} className="border-t border-slate-100">
                  <td className="px-3 py-2">{row.fullName}</td>
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={row.present} onChange={(e) => updateRow(row.studentId, 'present', e.target.checked)} />
                  </td>
                  <td className="px-3 py-2">
                    <input value={row.remark} onChange={(e) => updateRow(row.studentId, 'remark', e.target.value)} className="w-full rounded-md border border-slate-300 px-2 py-1" placeholder="Optional remark" />
                  </td>
                </tr>
              ))}
              {showRosterRows && !rows.length && (
                <tr>
                  <td colSpan={3} className="px-3 py-4 text-sm text-slate-600">
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
                <th className="px-3 py-2">Present</th>
              </tr>
            </thead>
            <tbody>
              {!showRecordRows && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-sm text-slate-600 text-center">
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
                  <td className="px-3 py-2">{record.present ? 'Yes' : 'No'}</td>
                </tr>
              ))}
              {showRecordRows && !filteredRecords.length && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-sm text-slate-600">
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
