import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import PortalLayout from '../../components/PortalLayout';
import ChildScopePanel from '../../components/ChildScopePanel';
import useParentChildSelection from '../../hooks/useParentChildSelection';
import useDebouncedValue from '../../hooks/useDebouncedValue';

function RoleAttendance({ role }) {
  const { apiJson, user } = useAuth();
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState(null);
  const [name, setName] = useState('');
  const [children, setChildren] = useState([]);
  const [selectedChildId, setSelectedChildId] = useParentChildSelection(role, user);
  const [term, setTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showRows, setShowRows] = useState(true);
  const debouncedSearch = useDebouncedValue(search.trim(), 300);

  useEffect(() => {
    if (role === 'parent') {
      setTerm('');
    }
  }, [role, selectedChildId]);

  useEffect(() => {
    let isCurrent = true;

    async function load() {
      setLoading(true);
      setError('');
      setRecords([]);
      setSummary(null);
      setName('');
      setChildren([]);
      try {
        const params = new URLSearchParams();
        if (role === 'parent' && selectedChildId) params.set('childId', selectedChildId);
        if (term) params.set('term', term);
        const query = params.toString() ? `?${params.toString()}` : '';
        const data = await apiJson(`/attendance/${role}${query}`);
        if (!isCurrent) return;

        setRecords(data.records || []);
        setSummary(data.summary || null);
        setName(data.student?.fullName || data.child?.fullName || '');
        setChildren(data.children || []);
        if (role === 'parent' && data.child?.id && data.child.id !== selectedChildId) {
          setSelectedChildId(data.child.id);
        }
      } catch (err) {
        if (!isCurrent) return;
        setError(err.message || 'Unable to load attendance.');
      } finally {
        if (isCurrent) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      isCurrent = false;
    };
  }, [role, apiJson, selectedChildId, term, setSelectedChildId]);

  const filteredRecords = useMemo(() => {
    const query = debouncedSearch.toLowerCase();
    if (!query) return records;
    return records.filter((record) => {
      const searchable = `${record.date} ${record.classLabel || ''} ${record.subjectName || ''} ${record.teacherName || ''} ${record.remark || ''}`.toLowerCase();
      return searchable.includes(query);
    });
  }, [debouncedSearch, records]);

  return (
    <PortalLayout
      role={role}
      title={role === 'student' ? 'My Attendance' : 'Child Attendance'}
      subtitle="Track attendance history and overall attendance rate."
    >
      {role === 'parent' && (
        <ChildScopePanel
          children={children}
          activeChildId={selectedChildId}
          onChange={setSelectedChildId}
          heading="Attendance Scope"
          description="The attendance ledger below is now locked to the child you selected."
        />
      )}
      {loading && <p className="mt-3 text-sm text-slate-600">Loading attendance...</p>}
      {name && <p className="text-sm text-slate-600">Profile: {name}</p>}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        <select
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All Terms</option>
          {['First Term', 'Second Term', 'Third Term'].map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search class, subject, or teacher"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      {summary && (
        <div className="mt-4 grid gap-4 sm:grid-cols-4">
          <article className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs uppercase text-slate-500">Total</p><p className="mt-2 text-2xl font-bold text-primary">{summary.total}</p></article>
          <article className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs uppercase text-slate-500">Present</p><p className="mt-2 text-2xl font-bold text-primary">{summary.present}</p></article>
          <article className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs uppercase text-slate-500">Absent</p><p className="mt-2 text-2xl font-bold text-primary">{summary.absent}</p></article>
          <article className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs uppercase text-slate-500">Rate</p><p className="mt-2 text-2xl font-bold text-primary">{summary.attendanceRate}%</p></article>
        </div>
      )}

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
              <th className="px-3 py-2">Subject</th>
              <th className="px-3 py-2">Teacher</th>
              <th className="px-3 py-2">Present</th>
              <th className="px-3 py-2">Remark</th>
            </tr>
          </thead>
          <tbody>
            {!showRows && (
              <tr>
                <td colSpan={6} className="px-3 py-3 text-slate-600 text-center">
                  Rows are hidden. Click “Show rows” to display attendance records.
                </td>
              </tr>
            )}
            {showRows && filteredRecords.map((record) => (
              <tr key={record.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{record.date}</td>
                <td className="px-3 py-2">{record.classLabel}</td>
                <td className="px-3 py-2">{record.subjectName}</td>
                <td className="px-3 py-2">{record.teacherName}</td>
                <td className="px-3 py-2">{record.present ? 'Yes' : 'No'}</td>
                <td className="px-3 py-2">{record.remark || '-'}</td>
              </tr>
            ))}
            {showRows && !filteredRecords.length && (
              <tr><td colSpan={6} className="px-3 py-3 text-slate-600">{loading ? 'Loading attendance...' : 'No attendance records found.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </PortalLayout>
  );
}

export default RoleAttendance;
