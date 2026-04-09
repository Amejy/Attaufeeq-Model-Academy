import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import PortalLayout from '../../components/PortalLayout';
import { ADMIN_INSTITUTIONS, canonicalInstitution, institutionAccent } from '../../utils/adminInstitution';

const TERM_OPTIONS = ['First Term', 'Second Term', 'Third Term'];

function ManageTeacherAssignments() {
  const { apiJson } = useAuth();
const defaultInstitution = ADMIN_INSTITUTIONS[0];
  const [teachers, setTeachers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [savingId, setSavingId] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [institutionScope, setInstitutionScope] = useState(defaultInstitution);
  const [showRowsByInstitution, setShowRowsByInstitution] = useState(() => ({}));
  const resolveShowRows = (institution) => showRowsByInstitution[institution] !== false;
  const [form, setForm] = useState({
    teacherIds: [],
    classId: '',
    subjectId: '',
    term: 'First Term',
    assignmentRole: 'Subject Teacher',
    note: ''
  });
  const [editingId, setEditingId] = useState('');
  const [editForm, setEditForm] = useState({
    teacherId: '',
    classId: '',
    subjectId: '',
    term: 'First Term',
    assignmentRole: 'Subject Teacher',
    note: ''
  });

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    setTeachers([]);
    setClasses([]);
    setSubjects([]);
    setAssignments([]);
    setEditingId('');

    try {
      const [teachersData, classesData, subjectsData, assignmentsData] = await Promise.all([
        apiJson('/admin/teachers'),
        apiJson('/admin/classes'),
        apiJson('/admin/subjects'),
        apiJson('/admin/teacher-assignments')
      ]);

      setTeachers(teachersData.teachers || []);
      setClasses(classesData.classes || []);
      setSubjects(subjectsData.subjects || []);
      setAssignments(assignmentsData.assignments || []);
    } catch (err) {
      setError(err.message || 'Unable to fetch assignment data.');
    } finally {
      setLoading(false);
    }
  }, [apiJson]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const scopedTeachers = useMemo(
    () => teachers.filter((item) => canonicalInstitution(item.institution) === canonicalInstitution(institutionScope)),
    [institutionScope, teachers]
  );
  const scopedClasses = useMemo(
    () => classes.filter((item) => canonicalInstitution(item.institution) === canonicalInstitution(institutionScope)),
    [classes, institutionScope]
  );
  const scopedSubjects = useMemo(
    () => subjects.filter((item) => canonicalInstitution(item.institution) === canonicalInstitution(institutionScope)),
    [institutionScope, subjects]
  );

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      teacherIds: prev.teacherIds.filter((id) => scopedTeachers.some((teacher) => teacher.id === id)),
      classId: scopedClasses.some((item) => item.id === prev.classId) ? prev.classId : scopedClasses[0]?.id || '',
      subjectId: scopedSubjects.some((item) => item.id === prev.subjectId) ? prev.subjectId : scopedSubjects[0]?.id || ''
    }));
  }, [institutionScope, scopedClasses, scopedSubjects, scopedTeachers]);

  const activeEditingAssignment = useMemo(
    () => assignments.find((item) => item.id === editingId) || null,
    [assignments, editingId]
  );
  const editTeachers = useMemo(
    () => (activeEditingAssignment
      ? teachers.filter((item) => canonicalInstitution(item.institution) === canonicalInstitution(activeEditingAssignment.institution))
      : []),
    [activeEditingAssignment, teachers]
  );
  const editClasses = useMemo(
    () => (activeEditingAssignment
      ? classes.filter((item) => canonicalInstitution(item.institution) === canonicalInstitution(activeEditingAssignment.institution))
      : []),
    [activeEditingAssignment, classes]
  );
  const editSubjects = useMemo(
    () => (activeEditingAssignment
      ? subjects.filter((item) => canonicalInstitution(item.institution) === canonicalInstitution(activeEditingAssignment.institution))
      : []),
    [activeEditingAssignment, subjects]
  );

  useEffect(() => {
    if (!editingId) {
      return;
    }

    if (!activeEditingAssignment) {
      setEditingId('');
      return;
    }

    setEditForm((prev) => ({
      ...prev,
      teacherId: editTeachers.some((item) => item.id === prev.teacherId) ? prev.teacherId : editTeachers[0]?.id || '',
      classId: editClasses.some((item) => item.id === prev.classId) ? prev.classId : editClasses[0]?.id || '',
      subjectId: editSubjects.some((item) => item.id === prev.subjectId) ? prev.subjectId : editSubjects[0]?.id || ''
    }));
  }, [activeEditingAssignment, editClasses, editSubjects, editTeachers, editingId]);

  const canCreateAssignment = Boolean(
    form.teacherIds.length && form.classId && form.subjectId && scopedTeachers.length && scopedClasses.length && scopedSubjects.length
  );
  const canSaveEditAssignment = Boolean(
    editForm.teacherId && editForm.classId && editForm.subjectId && editTeachers.length && editClasses.length && editSubjects.length
  );

  const groupedAssignments = useMemo(
    () =>
      ADMIN_INSTITUTIONS.map((institution) => ({
        institution,
        rows: assignments
          .filter((item) => canonicalInstitution(item.institution) === canonicalInstitution(institution))
          .sort((a, b) => a.classLabel.localeCompare(b.classLabel) || a.subjectName.localeCompare(b.subjectName))
      })),
    [assignments]
  );

  function toggleTeacherSelection(teacherId) {
    setForm((prev) => {
      const exists = prev.teacherIds.includes(teacherId);
      return {
        ...prev,
        teacherIds: exists ? prev.teacherIds.filter((id) => id !== teacherId) : [...prev.teacherIds, teacherId]
      };
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!form.teacherIds.length) {
      setError('Select at least one teacher to assign.');
      return;
    }

    setSubmitting(true);
    try {
      const data = await apiJson('/admin/teacher-assignments', {
        method: 'POST',
        body: form
      });

      setAssignments((prev) => [...(data.assignments || []), ...prev]);
      setSuccess(`${data.createdCount || 0} teacher assignment(s) created for ${institutionScope}.`);
      setForm((prev) => ({ ...prev, teacherIds: [], note: '' }));
    } catch (err) {
      setError(err.message || 'Unable to create assignment.');
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(assignment) {
    setEditingId(assignment.id);
    setEditForm({
      teacherId: assignment.teacherId,
      classId: assignment.classId,
      subjectId: assignment.subjectId,
      term: assignment.term,
      assignmentRole: assignment.assignmentRole || 'Subject Teacher',
      note: assignment.note || ''
    });
  }

  function cancelEdit() {
    setEditingId('');
  }

  async function handleUpdate(assignmentId) {
    setError('');
    setSavingId(assignmentId);

    try {
      const data = await apiJson(`/admin/teacher-assignments/${assignmentId}`, {
        method: 'PUT',
        body: editForm
      });

      setAssignments((prev) => prev.map((item) => (item.id === assignmentId ? data.assignment : item)));
      setEditingId('');
    } catch (err) {
      setError(err.message || 'Unable to update assignment.');
    } finally {
      setSavingId('');
    }
  }

  async function handleDelete(assignmentId) {
    setError('');
    setDeletingId(assignmentId);

    try {
      await apiJson(`/admin/teacher-assignments/${assignmentId}`, { method: 'DELETE' });

      setAssignments((prev) => prev.filter((item) => item.id !== assignmentId));
      if (editingId === assignmentId) setEditingId('');
    } catch (err) {
      setError(err.message || 'Unable to delete assignment.');
    } finally {
      setDeletingId('');
    }
  }

  return (
    <PortalLayout
      role="admin"
      title="Teacher Assignment Control"
      subtitle="Teachers, classes, and subjects stay scoped by institution so assignments never bleed across school tracks."
    >
      <div className="grid gap-4 lg:grid-cols-3">
        {groupedAssignments.map((group) => (
          <article key={group.institution} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${institutionAccent(group.institution)}`}>
              {group.institution}
            </p>
            <p className="mt-4 text-3xl font-bold text-slate-900">{group.rows.length}</p>
            <p className="mt-2 text-sm text-slate-600">Live teacher assignments in this section.</p>
          </article>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="mt-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-6">
          <select
            value={institutionScope}
            onChange={(e) => setInstitutionScope(e.target.value)}
            className="rounded-2xl border border-slate-300 px-4 py-3 text-sm"
          >
            {ADMIN_INSTITUTIONS.map((institution) => (
              <option key={institution}>{institution}</option>
            ))}
          </select>
          <select
            required
            value={form.classId}
            onChange={(e) => setForm((prev) => ({ ...prev, classId: e.target.value }))}
            className="rounded-2xl border border-slate-300 px-4 py-3 text-sm"
          >
            {scopedClasses.length ? (
              scopedClasses.map((classItem) => (
                <option key={classItem.id} value={classItem.id}>
                  {classItem.name} {classItem.arm}
                </option>
              ))
            ) : (
              <option value="">No classes available</option>
            )}
          </select>
          <select
            required
            value={form.subjectId}
            onChange={(e) => setForm((prev) => ({ ...prev, subjectId: e.target.value }))}
            className="rounded-2xl border border-slate-300 px-4 py-3 text-sm"
          >
            {scopedSubjects.length ? (
              scopedSubjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))
            ) : (
              <option value="">No subjects available</option>
            )}
          </select>
          <select
            required
            value={form.term}
            onChange={(e) => setForm((prev) => ({ ...prev, term: e.target.value }))}
            className="rounded-2xl border border-slate-300 px-4 py-3 text-sm"
          >
            {TERM_OPTIONS.map((term) => (
              <option key={term} value={term}>
                {term}
              </option>
            ))}
          </select>
          <select
            value={form.assignmentRole}
            onChange={(e) => setForm((prev) => ({ ...prev, assignmentRole: e.target.value }))}
            className="rounded-2xl border border-slate-300 px-4 py-3 text-sm"
          >
            {['Subject Teacher', 'Lead Teacher', 'Co-Teacher', 'Assistant Teacher'].map((roleOption) => (
              <option key={roleOption} value={roleOption}>
                {roleOption}
              </option>
            ))}
          </select>
          <input
            value={form.note}
            onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
            placeholder="Operational note"
            className="rounded-2xl border border-slate-300 px-4 py-3 text-sm"
          />
        </div>

        <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Teachers in {institutionScope}</p>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {scopedTeachers.map((teacher) => (
              <label key={teacher.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.teacherIds.includes(teacher.id)}
                  onChange={() => toggleTeacherSelection(teacher.id)}
                />
                <div>
                  <p className="font-semibold text-slate-800">{teacher.fullName}</p>
                  <p className="text-xs text-slate-500">{teacher.email}</p>
                </div>
              </label>
            ))}
            {!scopedTeachers.length && <p className="text-sm text-slate-500">No teachers found for this institution.</p>}
          </div>
          {!scopedClasses.length && <p className="mt-3 text-sm text-amber-700">Add a class in this institution before creating teacher assignments.</p>}
          {!scopedSubjects.length && <p className="mt-3 text-sm text-amber-700">Add a subject in this institution before creating teacher assignments.</p>}
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="submit"
            disabled={submitting || !canCreateAssignment}
            className="rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Assigning...' : 'Assign Selected Teachers'}
          </button>
        </div>
      </form>

      {loading && <p className="mt-4 text-sm text-slate-600">Loading assignments...</p>}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {success && <p className="mt-4 text-sm text-emerald-700">{success}</p>}

      <div className="mt-8 space-y-6">
        {groupedAssignments.map((group) => (
          <section key={group.institution} className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-heading text-2xl text-primary">{group.institution}</h2>
                <p className="mt-2 text-sm text-slate-600">Assignments stay separate by institution.</p>
              </div>
              <span className={`rounded-full border px-3 py-2 text-xs font-semibold ${institutionAccent(group.institution)}`}>
                {group.rows.length} assignments
              </span>
            </div>

            <div className="mt-5 overflow-x-auto rounded-3xl border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                <span>Assignments table</span>
                <button
                  type="button"
                  onClick={() => {
                    const nextValue = !resolveShowRows(group.institution);
                    setShowRowsByInstitution((prev) => ({ ...prev, [group.institution]: nextValue }));
                  }}
                  className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                >
                  {resolveShowRows(group.institution) ? 'Hide rows' : 'Show rows'}
                </button>
              </div>
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="px-4 py-3">Teacher</th>
                    <th className="px-4 py-3">Class</th>
                    <th className="px-4 py-3">Subject</th>
                    <th className="px-4 py-3">Term</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Note</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {!resolveShowRows(group.institution) && (
                    <tr>
                      <td className="px-4 py-6 text-center text-slate-500" colSpan={7}>
                        Rows are hidden. Click “Show rows” to display assignments.
                      </td>
                    </tr>
                  )}
                  {resolveShowRows(group.institution) && group.rows.map((assignment) => {
                    return (
                      <tr key={assignment.id} className="border-t border-slate-100">
                        <td className="px-4 py-3">
                          {editingId === assignment.id ? (
                            <select
                              value={editForm.teacherId}
                              onChange={(e) => setEditForm((prev) => ({ ...prev, teacherId: e.target.value }))}
                              className="w-full rounded-xl border border-slate-300 px-3 py-2"
                            >
                              {editTeachers.map((teacher) => (
                                <option key={teacher.id} value={teacher.id}>
                                  {teacher.fullName}
                                </option>
                              ))}
                            </select>
                          ) : (
                            assignment.teacherName
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {editingId === assignment.id ? (
                            <select
                              value={editForm.classId}
                              onChange={(e) => setEditForm((prev) => ({ ...prev, classId: e.target.value }))}
                              className="w-full rounded-xl border border-slate-300 px-3 py-2"
                            >
                              {editClasses.map((classItem) => (
                                <option key={classItem.id} value={classItem.id}>
                                  {classItem.name} {classItem.arm}
                                </option>
                              ))}
                            </select>
                          ) : (
                            assignment.classLabel
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {editingId === assignment.id ? (
                            <select
                              value={editForm.subjectId}
                              onChange={(e) => setEditForm((prev) => ({ ...prev, subjectId: e.target.value }))}
                              className="w-full rounded-xl border border-slate-300 px-3 py-2"
                            >
                              {editSubjects.map((subject) => (
                                <option key={subject.id} value={subject.id}>
                                  {subject.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            assignment.subjectName
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {editingId === assignment.id ? (
                            <select
                              value={editForm.term}
                              onChange={(e) => setEditForm((prev) => ({ ...prev, term: e.target.value }))}
                              className="w-full rounded-xl border border-slate-300 px-3 py-2"
                            >
                              {TERM_OPTIONS.map((term) => (
                                <option key={term} value={term}>
                                  {term}
                                </option>
                              ))}
                            </select>
                          ) : (
                            assignment.term
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {editingId === assignment.id ? (
                            <input
                              value={editForm.assignmentRole}
                              onChange={(e) => setEditForm((prev) => ({ ...prev, assignmentRole: e.target.value }))}
                              className="w-full rounded-xl border border-slate-300 px-3 py-2"
                            />
                          ) : (
                            assignment.assignmentRole || 'Subject Teacher'
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {editingId === assignment.id ? (
                            <input
                              value={editForm.note}
                              onChange={(e) => setEditForm((prev) => ({ ...prev, note: e.target.value }))}
                              className="w-full rounded-xl border border-slate-300 px-3 py-2"
                            />
                          ) : (
                            assignment.note || '-'
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {editingId === assignment.id ? (
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => handleUpdate(assignment.id)}
                                disabled={savingId === assignment.id || !canSaveEditAssignment}
                                className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {savingId === assignment.id ? 'Saving...' : 'Save'}
                              </button>
                              <button
                                type="button"
                                onClick={cancelEdit}
                                disabled={savingId === assignment.id}
                                className="rounded-xl border border-slate-300 px-3 py-2 text-xs"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => startEdit(assignment)}
                                disabled={deletingId === assignment.id}
                                className="rounded-xl border border-slate-300 px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(assignment.id)}
                                disabled={deletingId === assignment.id}
                                className="rounded-xl border border-red-300 px-3 py-2 text-xs text-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {deletingId === assignment.id ? 'Deleting...' : 'Delete'}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {resolveShowRows(group.institution) && !group.rows.length && (
                    <tr>
                      <td className="px-4 py-8 text-center text-slate-500" colSpan={7}>
                        No assignments recorded for this institution yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </PortalLayout>
  );
}

export default ManageTeacherAssignments;
