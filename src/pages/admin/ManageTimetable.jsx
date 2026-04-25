import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import ErrorState from '../../components/ErrorState';
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
      <form onSubmit={createEntry} className="admin-surface grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <label className="field-shell">
          <span className="field-label">Institution</span>
          <select value={institutionFilter} onChange={(e) => setInstitutionFilter(e.target.value)} className="form-select" required>
            {ADMIN_INSTITUTIONS.map((institution) => <option key={institution}>{institution}</option>)}
          </select>
        </label>
        <label className="field-shell">
          <span className="field-label">Class</span>
          <select value={form.classId} onChange={(e) => setForm((p) => ({ ...p, classId: e.target.value }))} className="form-select" required>
            {scopedClasses.map((item) => <option key={item.id} value={item.id}>{item.name} {item.arm}</option>)}
          </select>
        </label>
        <label className="field-shell">
          <span className="field-label">Subject</span>
          <select value={form.subjectId} onChange={(e) => setForm((p) => ({ ...p, subjectId: e.target.value }))} className="form-select" required>
            {availableSubjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="field-shell">
          <span className="field-label">Teacher</span>
          <select value={form.teacherId} onChange={(e) => setForm((p) => ({ ...p, teacherId: e.target.value }))} className="form-select" required>
            {availableTeachers.map((item) => <option key={item.id} value={item.id}>{item.fullName}</option>)}
          </select>
        </label>
        <label className="field-shell">
          <span className="field-label">Day</span>
          <select value={form.dayOfWeek} onChange={(e) => setForm((p) => ({ ...p, dayOfWeek: e.target.value }))} className="form-select" required>
            {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map((day) => <option key={day}>{day}</option>)}
          </select>
        </label>
        <label className="field-shell">
          <span className="field-label">Start time</span>
          <input type="time" value={form.startTime} onChange={(e) => setForm((p) => ({ ...p, startTime: e.target.value }))} className="form-field" required />
        </label>
        <label className="field-shell">
          <span className="field-label">End time</span>
          <input type="time" value={form.endTime} onChange={(e) => setForm((p) => ({ ...p, endTime: e.target.value }))} className="form-field" required />
        </label>
        <label className="field-shell">
          <span className="field-label">Term</span>
          <select value={form.term} onChange={(e) => setForm((p) => ({ ...p, term: e.target.value }))} className="form-select" required>
            {['First Term', 'Second Term', 'Third Term'].map((term) => <option key={term}>{term}</option>)}
          </select>
        </label>
        <label className="field-shell">
          <span className="field-label">Room</span>
          <input value={form.room} onChange={(e) => setForm((p) => ({ ...p, room: e.target.value }))} placeholder="Room" className="form-field" />
        </label>
        <button
          type="submit"
          disabled={!form.classId || !form.subjectId || !form.teacherId}
          className="interactive-button self-end"
        >
          Add Entry
        </button>
      </form>

      {error && <ErrorState compact title="Unable to manage timetable" message={error} className="mt-3" onRetry={() => loadData({ preserveSuccess: true })} />}
      {success && <div className="status-banner mt-3">{success}</div>}
      {!availableSubjects.length && form.classId && (
        <p className="status-banner status-banner--warning mt-3">No teacher assignment exists yet for this class and term. Create the assignment first before adding timetable entries.</p>
      )}
      {availableSubjects.length > 0 && !availableTeachers.length && form.classId && form.subjectId && (
        <p className="status-banner status-banner--warning mt-3">No teacher is assigned to this class-subject pair for the selected term.</p>
      )}

      <div className="admin-surface mt-6">
        <div className="admin-toolbar">
          <label className="field-shell min-w-[14rem]">
            <span className="field-label">Class filter</span>
            <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="form-select">
              <option value="">All Classes</option>
              {scopedClasses.map((item) => <option key={item.id} value={item.id}>{item.name} {item.arm}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="data-table-shell mt-6">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          <span>Timetable table</span>
          <button
            type="button"
            onClick={() => setShowRows((prev) => !prev)}
            className="interactive-button"
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
                  <button type="button" disabled={deletingId === item.id} onClick={() => removeEntry(item.id)} className="interactive-button border-red-300 text-red-600">{deletingId === item.id ? 'Deleting...' : 'Delete'}</button>
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
