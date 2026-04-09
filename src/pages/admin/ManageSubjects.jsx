import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import PortalLayout from '../../components/PortalLayout';
import { ADMIN_INSTITUTIONS, canonicalInstitution, institutionAccent } from '../../utils/adminInstitution';

function ManageSubjects() {
  const { apiJson } = useAuth();
  const defaultInstitution = ADMIN_INSTITUTIONS[0];
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [creatingSubject, setCreatingSubject] = useState(false);
  const [savingSubjectId, setSavingSubjectId] = useState('');
  const [form, setForm] = useState({ name: '', institution: defaultInstitution });
  const [editingId, setEditingId] = useState('');
  const [editForm, setEditForm] = useState({ name: '', institution: defaultInstitution });
  const [showRowsByInstitution, setShowRowsByInstitution] = useState(() => ({}));
  const resolveShowRows = (institution) => showRowsByInstitution[institution] !== false;

  const loadSubjects = useCallback(async () => {
    setLoading(true);
    setError('');
    setSubjects([]);
    setEditingId('');

    try {
      const data = await apiJson('/admin/subjects');
      setSubjects(data.subjects || []);
    } catch (err) {
      setError(err.message || 'Unable to fetch subjects.');
    } finally {
      setLoading(false);
    }
  }, [apiJson]);

  useEffect(() => {
    loadSubjects();
  }, [loadSubjects]);

  const groupedSubjects = useMemo(
    () =>
      ADMIN_INSTITUTIONS.map((institution) => ({
        institution,
        rows: subjects
          .filter((item) => canonicalInstitution(item.institution) === canonicalInstitution(institution))
          .sort((a, b) => a.name.localeCompare(b.name))
      })),
    [subjects]
  );
  const canCreateSubject = Boolean(form.name.trim() && form.institution);
  const canSaveSubject = Boolean(editForm.name.trim() && editForm.institution);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setCreatingSubject(true);

    try {
      const payload = {
        ...form,
        name: form.name.trim()
      };
      const data = await apiJson('/admin/subjects', {
        method: 'POST',
        body: payload
      });

      setForm({ name: '', institution: form.institution });
      setSubjects((prev) => [data.subject, ...prev]);
    } catch (err) {
      setError(err.message || 'Unable to create subject.');
    } finally {
      setCreatingSubject(false);
    }
  }

  function startEdit(subject) {
    setEditingId(subject.id);
    setEditForm({
      name: subject.name,
      institution: subject.institution
    });
  }

  function cancelEdit() {
    setEditingId('');
  }

  async function handleUpdate(subjectId) {
    setError('');
    setSavingSubjectId(subjectId);

    try {
      const payload = {
        ...editForm,
        name: editForm.name.trim()
      };
      const data = await apiJson(`/admin/subjects/${subjectId}`, {
        method: 'PUT',
        body: payload
      });

      setSubjects((prev) => prev.map((item) => (item.id === subjectId ? data.subject : item)));
      setEditingId('');
    } catch (err) {
      setError(err.message || 'Unable to update subject.');
    } finally {
      setSavingSubjectId('');
    }
  }

  async function handleDelete(subjectId) {
    setError('');

    try {
      setDeletingId(subjectId);
      await apiJson(`/admin/subjects/${subjectId}`, { method: 'DELETE' });

      setSubjects((prev) => prev.filter((item) => item.id !== subjectId));
      if (editingId === subjectId) setEditingId('');
    } catch (err) {
      setError(err.message || 'Unable to delete subject.');
    } finally {
      setDeletingId((prev) => (prev === subjectId ? '' : prev));
    }
  }

  return (
    <PortalLayout
      role="admin"
      title="Subject Structure"
      subtitle="Subjects are grouped by institution so ATTAUFEEQ Model Academy, Madrastul ATTAUFEEQ, and Quran Memorization stay cleanly separated."
    >
      <form onSubmit={handleSubmit} className="mt-6 grid gap-3 rounded-3xl border border-slate-200 bg-white p-5 sm:grid-cols-3">
        <input
          required
          value={form.name}
          onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
          placeholder="Subject name"
          className="rounded-2xl border border-slate-300 px-4 py-3 text-sm"
        />
        <select
          value={form.institution}
          onChange={(e) => setForm((prev) => ({ ...prev, institution: e.target.value }))}
          className="rounded-2xl border border-slate-300 px-4 py-3 text-sm"
        >
          {ADMIN_INSTITUTIONS.map((institution) => (
            <option key={institution}>{institution}</option>
          ))}
        </select>
        <button
          type="submit"
          disabled={creatingSubject || !canCreateSubject}
          className="rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {creatingSubject ? 'Adding...' : 'Add Subject'}
        </button>
      </form>

      {loading && <p className="mt-4 text-sm text-slate-600">Loading subjects...</p>}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-8 space-y-6">
        {groupedSubjects.map((group) => (
          <section key={group.institution} className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-heading text-2xl text-primary">{group.institution}</h2>
                <p className="mt-2 text-sm text-slate-600">Only subjects for this institution are listed here.</p>
              </div>
              <span className={`rounded-full border px-3 py-2 text-xs font-semibold ${institutionAccent(group.institution)}`}>
                {group.rows.length} subjects
              </span>
            </div>

            <div className="mt-5 overflow-x-auto rounded-3xl border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                <span>Subjects table</span>
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
                    <th className="px-4 py-3">Subject</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {!resolveShowRows(group.institution) && (
                    <tr>
                      <td className="px-4 py-6 text-center text-slate-500" colSpan={2}>
                        Rows are hidden. Click “Show rows” to display subjects.
                      </td>
                    </tr>
                  )}
                  {resolveShowRows(group.institution) && group.rows.map((subject) => (
                    <tr key={subject.id} className="border-t border-slate-100">
                      <td className="px-4 py-3">
                        {editingId === subject.id ? (
                          <input
                            value={editForm.name}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                            className="w-full rounded-xl border border-slate-300 px-3 py-2"
                          />
                        ) : (
                          subject.name
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {editingId === subject.id ? (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleUpdate(subject.id)}
                              disabled={savingSubjectId === subject.id || !canSaveSubject}
                              className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {savingSubjectId === subject.id ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              disabled={savingSubjectId === subject.id}
                              className="rounded-xl border border-slate-300 px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => startEdit(subject)}
                              className="rounded-xl border border-slate-300 px-3 py-2 text-xs"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(subject.id)}
                              disabled={deletingId === subject.id}
                              className="rounded-xl border border-red-300 px-3 py-2 text-xs text-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {deletingId === subject.id ? 'Deleting...' : 'Delete'}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {resolveShowRows(group.institution) && !group.rows.length && (
                    <tr>
                      <td className="px-4 py-8 text-center text-slate-500" colSpan={2}>
                        No subjects configured for this institution yet.
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

export default ManageSubjects;
