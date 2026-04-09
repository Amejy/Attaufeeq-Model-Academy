import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import PortalLayout from '../../components/PortalLayout';
import { ADMIN_INSTITUTIONS } from '../../utils/adminInstitution';

function AdminAttendanceOverview() {
  const { apiJson } = useAuth();
  const [records, setRecords] = useState([]);
  const [classes, setClasses] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showRows, setShowRows] = useState(true);
  const loadSeq = useRef(0);
  const [filters, setFilters] = useState({
    institution: '',
    date: '',
    classId: '',
    term: ''
  });

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setError('');
    setLoading(true);
    setRecords([]);
    setClasses([]);
    setSummary(null);
    try {
      const classesData = await apiJson(
        `/admin/classes${filters.institution ? `?institution=${encodeURIComponent(filters.institution)}` : ''}`
      );
      if (seq !== loadSeq.current) return;
      const classRows = classesData.classes || [];
      const effectiveClassId = filters.classId && classRows.some((item) => item.id === filters.classId)
        ? filters.classId
        : '';

      const params = new URLSearchParams();
      if (filters.institution) params.set('institution', filters.institution);
      if (filters.date) params.set('date', filters.date);
      if (effectiveClassId) params.set('classId', effectiveClassId);
      if (filters.term) params.set('term', filters.term);

      const recordsData = await apiJson(`/attendance/admin/records?${params.toString()}`);
      if (seq !== loadSeq.current) return;

      setRecords(recordsData.records || []);
      setSummary(recordsData.summary || null);
      setClasses(classRows);
      if (filters.classId && !effectiveClassId) {
        setFilters((prev) => ({ ...prev, classId: '' }));
      }
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setError(err.message || 'Unable to load attendance overview.');
    } finally {
      if (seq === loadSeq.current) {
        setLoading(false);
      }
    }
  }, [apiJson, filters.classId, filters.date, filters.institution, filters.term]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  return (
    <PortalLayout
      role="admin"
      title="Attendance Overview"
      subtitle="Monitor class attendance records across institutions, with term-aware filtering."
      actions={
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Refresh
        </button>
      }
    >
      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 xl:grid-cols-5">
        <select value={filters.institution} onChange={(e) => setFilters((p) => ({ ...p, institution: e.target.value, classId: '' }))} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value="">All Institutions</option>
          {ADMIN_INSTITUTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select value={filters.term} onChange={(e) => setFilters((p) => ({ ...p, term: e.target.value }))} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value="">All Terms</option>
          {['First Term', 'Second Term', 'Third Term'].map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <input type="date" value={filters.date} onChange={(e) => setFilters((p) => ({ ...p, date: e.target.value }))} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <select value={filters.classId} onChange={(e) => setFilters((p) => ({ ...p, classId: e.target.value }))} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value="">All Classes</option>
          {classes.map((item) => <option key={item.id} value={item.id}>{item.name} {item.arm}{filters.institution ? '' : ` • ${item.institution}`}</option>)}
        </select>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          Apply Filters
        </button>
      </div>

      {loading && <p className="mt-3 text-sm text-slate-600">Loading attendance overview...</p>}

      {summary && (
        <div className="mt-4 grid gap-4 sm:grid-cols-4">
          <article className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs uppercase text-slate-500">Total</p><p className="mt-2 text-2xl font-bold text-primary">{summary.total}</p></article>
          <article className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs uppercase text-slate-500">Present</p><p className="mt-2 text-2xl font-bold text-primary">{summary.present}</p></article>
          <article className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs uppercase text-slate-500">Absent</p><p className="mt-2 text-2xl font-bold text-primary">{summary.absent}</p></article>
          <article className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs uppercase text-slate-500">Rate</p><p className="mt-2 text-2xl font-bold text-primary">{summary.attendanceRate}%</p></article>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          <span>Attendance table</span>
          <button
            type="button"
            onClick={() => setShowRows((prev) => !prev)}
            className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
          >
            {showRows ? 'Hide rows' : 'Show rows'}
          </button>
        </div>
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Class</th>
              <th className="px-3 py-2">Institution</th>
              <th className="px-3 py-2">Subject</th>
              <th className="px-3 py-2">Teacher</th>
              <th className="px-3 py-2">Student</th>
              <th className="px-3 py-2">Present</th>
              <th className="px-3 py-2">Remark</th>
            </tr>
          </thead>
          <tbody>
            {!showRows && (
              <tr>
                <td colSpan={8} className="px-3 py-3 text-slate-600 text-center">
                  Rows are hidden. Click “Show rows” to display attendance records.
                </td>
              </tr>
            )}
            {showRows && records.map((record) => (
              <tr key={record.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{record.date}</td>
                <td className="px-3 py-2">{record.classLabel}</td>
                <td className="px-3 py-2">{record.institution || '-'}</td>
                <td className="px-3 py-2">{record.subjectName}</td>
                <td className="px-3 py-2">{record.teacherName}</td>
                <td className="px-3 py-2">{record.studentName}</td>
                <td className="px-3 py-2">{record.present ? 'Yes' : 'No'}</td>
                <td className="px-3 py-2">{record.remark || '-'}</td>
              </tr>
            ))}
            {showRows && !records.length && (
              <tr><td colSpan={8} className="px-3 py-3 text-slate-600">{loading ? 'Loading attendance overview...' : 'No attendance records found.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </PortalLayout>
  );
}

export default AdminAttendanceOverview;
