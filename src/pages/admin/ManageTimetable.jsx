import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import PortalLayout from '../../components/PortalLayout';
import { ADMIN_INSTITUTIONS, canonicalInstitution } from '../../utils/adminInstitution';

function ManageTimetable() {
  const { apiJson } = useAuth();
  const defaultInstitution = ADMIN_INSTITUTIONS[0];
  const [entries, setEntries] = useState([]);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [showRows, setShowRows] = useState(true);
  const [institutionFilter, setInstitutionFilter] = useState(defaultInstitution);
  const [classFilter, setClassFilter] = useState('');
  const [form, setForm] = useState({
    classId: '',
    subjectId: '',
    teacherId: '',
    dayOfWeek: 'Monday',
    startTime: '09:00',
    endTime: '09:50',
    term: 'First Term',
    institution: defaultInstitution,
    room: ''
  });
  const loadDataSeq = useRef(0);

  const loadData = useCallback(async (options = {}) => {
    const seq = ++loadDataSeq.current;
    const preserveSuccess = Boolean(options.preserveSuccess);
    setError('');
    if (!preserveSuccess) {
      setSuccess('');
    }
    setEntries([]);
    setClasses([]);
    setSubjects([]);
    setTeachers([]);
    setAssignments([]);
    try {
      const [entriesData, classesData, subjectsData, teachersData, assignmentsData] = await Promise.all([
        apiJson('/timetable/admin'),
        apiJson('/admin/classes'),
        apiJson('/admin/subjects'),
        apiJson('/admin/teachers'),
        apiJson('/admin/teacher-assignments')
      ]);
      if (seq !== loadDataSeq.current) return;

      setEntries(entriesData.entries || []);
      setClasses(classesData.classes || []);
      setSubjects(subjectsData.subjects || []);
      setTeachers(teachersData.teachers || []);
      setAssignments(assignmentsData.assignments || []);
    } catch (err) {
      if (seq !== loadDataSeq.current) return;
      setError(err.message || 'Unable to load timetable module.');
    }
  }, [apiJson]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadData({ preserveSuccess: true });
    });
  }, [loadData]);

  const scopedClasses = useMemo(
    () => classes.filter((item) => canonicalInstitution(item.institution) === canonicalInstitution(institutionFilter)),
    [classes, institutionFilter]
  );
  const scopedSubjects = useMemo(
    () => subjects.filter((item) => canonicalInstitution(item.institution) === canonicalInstitution(institutionFilter)),
    [institutionFilter, subjects]
  );
  const scopedTeachers = useMemo(
    () => teachers.filter((item) => canonicalInstitution(item.institution) === canonicalInstitution(institutionFilter)),
    [institutionFilter, teachers]
  );
  const scopedAssignments = useMemo(
    () =>
      assignments.filter((item) => (
        canonicalInstitution(item.institution) === canonicalInstitution(institutionFilter) &&
        item.term === form.term
      )),
    [assignments, form.term, institutionFilter]
  );
  const availableSubjectIds = useMemo(
    () => new Set(
      scopedAssignments
        .filter((item) => item.classId === form.classId)
        .map((item) => item.subjectId)
    ),
    [form.classId, scopedAssignments]
  );
  const availableTeacherIds = useMemo(
    () => new Set(
      scopedAssignments
        .filter((item) => item.classId === form.classId && item.subjectId === form.subjectId)
        .map((item) => item.teacherId)
    ),
    [form.classId, form.subjectId, scopedAssignments]
  );
  const availableSubjects = useMemo(
    () => scopedSubjects.filter((item) => availableSubjectIds.has(item.id)),
    [availableSubjectIds, scopedSubjects]
  );
  const availableTeachers = useMemo(
    () => scopedTeachers.filter((item) => availableTeacherIds.has(item.id)),
    [availableTeacherIds, scopedTeachers]
  );
  const filteredEntries = useMemo(
    () =>
      entries
        .filter((item) => canonicalInstitution(item.institution) === canonicalInstitution(institutionFilter))
        .filter((item) => (classFilter ? item.classId === classFilter : true)),
    [classFilter, entries, institutionFilter]
  );

  useEffect(() => {
    queueMicrotask(() => {
      setForm((prev) => ({
        ...prev,
        institution: institutionFilter,
        classId: scopedClasses.some((item) => item.id === prev.classId) ? prev.classId : scopedClasses[0]?.id || '',
        subjectId: '',
        teacherId: ''
      }));

      if (classFilter && !scopedClasses.some((item) => item.id === classFilter)) {
        setClassFilter('');
      }
    });
  }, [classFilter, institutionFilter, scopedClasses]);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      subjectId: availableSubjects.some((item) => item.id === prev.subjectId) ? prev.subjectId : availableSubjects[0]?.id || ''
    }));
  }, [availableSubjects]);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      teacherId: availableTeachers.some((item) => item.id === prev.teacherId) ? prev.teacherId : availableTeachers[0]?.id || ''
    }));
  }, [availableTeachers]);

  async function createEntry(event) {
    event.preventDefault();
    setError('');
    setSuccess('');

    try {
      await apiJson('/timetable/admin', {
        method: 'POST',
        body: form
      });

      setSuccess('Timetable entry created.');
      void loadData();
    } catch (err) {
      setError(err.message || 'Unable to create timetable entry.');
    }
  }

  async function removeEntry(id) {
    setError('');
    setSuccess('');

    try {
      setDeletingId(id);
      await apiJson(`/timetable/admin/${id}`, { method: 'DELETE' });

      setSuccess('Timetable entry deleted.');
      setEntries((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      setError(err.message || 'Unable to delete timetable entry.');
    } finally {
      setDeletingId((prev) => (prev === id ? '' : prev));
    }
  }

  return (
    <PortalLayout
      role="admin"
      title="Timetable Management"
      subtitle="Filter by institution and class so opening JSS 1 now shows only the JSS 1 timetable."
    >
      <form onSubmit={createEntry} className="grid gap-3 rounded-[28px] border border-slate-200 bg-white p-5 sm:grid-cols-2 lg:grid-cols-5">
        <select value={institutionFilter} onChange={(e) => setInstitutionFilter(e.target.value)} className="rounded-2xl border border-slate-300 px-4 py-3 text-sm" required>
          {ADMIN_INSTITUTIONS.map((institution) => <option key={institution}>{institution}</option>)}
        </select>
        <select value={form.classId} onChange={(e) => setForm((p) => ({ ...p, classId: e.target.value }))} className="rounded-2xl border border-slate-300 px-4 py-3 text-sm" required>
          {scopedClasses.map((item) => <option key={item.id} value={item.id}>{item.name} {item.arm}</option>)}
        </select>
        <select value={form.subjectId} onChange={(e) => setForm((p) => ({ ...p, subjectId: e.target.value }))} className="rounded-2xl border border-slate-300 px-4 py-3 text-sm" required>
          {availableSubjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <select value={form.teacherId} onChange={(e) => setForm((p) => ({ ...p, teacherId: e.target.value }))} className="rounded-2xl border border-slate-300 px-4 py-3 text-sm" required>
          {availableTeachers.map((item) => <option key={item.id} value={item.id}>{item.fullName}</option>)}
        </select>
        <select value={form.dayOfWeek} onChange={(e) => setForm((p) => ({ ...p, dayOfWeek: e.target.value }))} className="rounded-2xl border border-slate-300 px-4 py-3 text-sm" required>
          {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map((day) => <option key={day}>{day}</option>)}
        </select>
        <input type="time" value={form.startTime} onChange={(e) => setForm((p) => ({ ...p, startTime: e.target.value }))} className="rounded-2xl border border-slate-300 px-4 py-3 text-sm" required />
        <input type="time" value={form.endTime} onChange={(e) => setForm((p) => ({ ...p, endTime: e.target.value }))} className="rounded-2xl border border-slate-300 px-4 py-3 text-sm" required />
        <select value={form.term} onChange={(e) => setForm((p) => ({ ...p, term: e.target.value }))} className="rounded-2xl border border-slate-300 px-4 py-3 text-sm" required>
          {['First Term', 'Second Term', 'Third Term'].map((term) => <option key={term}>{term}</option>)}
        </select>
        <input value={form.room} onChange={(e) => setForm((p) => ({ ...p, room: e.target.value }))} placeholder="Room" className="rounded-2xl border border-slate-300 px-4 py-3 text-sm" />
        <button
          type="submit"
          disabled={!form.classId || !form.subjectId || !form.teacherId}
          className="rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          Add Entry
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {success && <p className="mt-3 text-sm text-emerald-700">{success}</p>}
      {!availableSubjects.length && form.classId && (
        <p className="mt-3 text-sm text-amber-700">No teacher assignment exists yet for this class and term. Create the assignment first before adding timetable entries.</p>
      )}
      {availableSubjects.length > 0 && !availableTeachers.length && form.classId && form.subjectId && (
        <p className="mt-3 text-sm text-amber-700">No teacher is assigned to this class-subject pair for the selected term.</p>
      )}

      <div className="mt-6 flex flex-wrap gap-3 rounded-[28px] border border-slate-200 bg-white p-5">
        <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="rounded-2xl border border-slate-300 px-4 py-3 text-sm">
          <option value="">All Classes</option>
          {scopedClasses.map((item) => <option key={item.id} value={item.id}>{item.name} {item.arm}</option>)}
        </select>
      </div>

      <div className="mt-6 overflow-x-auto rounded-[28px] border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          <span>Timetable table</span>
          <button
            type="button"
            onClick={() => setShowRows((prev) => !prev)}
            className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
          >
            {showRows ? 'Hide rows' : 'Show rows'}
          </button>
        </div>
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-4 py-3">Day</th>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Class</th>
              <th className="px-4 py-3">Subject</th>
              <th className="px-4 py-3">Teacher</th>
              <th className="px-4 py-3">Room</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {!showRows && (
              <tr>
                <td className="px-4 py-8 text-center text-slate-500" colSpan={7}>
                  Rows are hidden. Click “Show rows” to display timetable entries.
                </td>
              </tr>
            )}
            {showRows && filteredEntries.map((item) => (
              <tr key={item.id} className="border-t border-slate-100">
                <td className="px-4 py-3">{item.dayOfWeek}</td>
                <td className="px-4 py-3">{item.startTime} - {item.endTime}</td>
                <td className="px-4 py-3">{item.classLabel || item.classId}</td>
                <td className="px-4 py-3">{item.subjectName}</td>
                <td className="px-4 py-3">{item.teacherName}</td>
                <td className="px-4 py-3">{item.room || '-'}</td>
                <td className="px-4 py-3">
                  <button type="button" disabled={deletingId === item.id} onClick={() => removeEntry(item.id)} className="rounded-xl border border-red-300 px-3 py-2 text-xs text-red-600 disabled:cursor-not-allowed disabled:opacity-60">{deletingId === item.id ? 'Deleting...' : 'Delete'}</button>
                </td>
              </tr>
            ))}
            {showRows && !filteredEntries.length && (
              <tr>
                <td className="px-4 py-8 text-center text-slate-500" colSpan={7}>No timetable entries for the current class filter.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </PortalLayout>
  );
}

export default ManageTimetable;
