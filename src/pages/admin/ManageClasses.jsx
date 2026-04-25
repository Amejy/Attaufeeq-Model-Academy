import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import ErrorState from '../../components/ErrorState';
import PortalLayout from '../../components/PortalLayout';
import { ADMIN_INSTITUTIONS, canonicalInstitution, institutionAccent } from '../../utils/adminInstitution';

function ManageClasses() {
  const { apiJson } = useAuth();
  const defaultInstitution = ADMIN_INSTITUTIONS[0];
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [creatingClass, setCreatingClass] = useState(false);
  const [savingClassId, setSavingClassId] = useState('');
  const [showRowsByInstitution, setShowRowsByInstitution] = useState(() => ({}));
  const resolveShowRows = (institution) => showRowsByInstitution[institution] !== false;
  const [form, setForm] = useState({ name: '', arm: '', institution: defaultInstitution, progressionOrder: '' });
  const [editingId, setEditingId] = useState('');
  const [editForm, setEditForm] = useState({ name: '', arm: '', institution: defaultInstitution, progressionOrder: '' });

  const loadClasses = useCallback(async () => {
    setLoading(true);
    setError('');
    setClasses([]);
    setEditingId('');

    try {
      const data = await apiJson('/admin/classes');
      setClasses(data.classes || []);
    } catch (err) {
      setError(err.message || 'Unable to fetch classes.');
    } finally {
      setLoading(false);
    }
  }, [apiJson]);

  useEffect(() => {
    loadClasses();
  }, [loadClasses]);

  const groupedClasses = useMemo(
    () =>
      ADMIN_INSTITUTIONS.map((institution) => ({
        institution,
        rows: classes
          .filter((item) => canonicalInstitution(item.institution) === canonicalInstitution(institution))
          .sort((a, b) => {
            const leftOrder = Number.isFinite(a.progressionOrder) ? a.progressionOrder : Number.POSITIVE_INFINITY;
            const rightOrder = Number.isFinite(b.progressionOrder) ? b.progressionOrder : Number.POSITIVE_INFINITY;
            return leftOrder - rightOrder || `${a.name} ${a.arm}`.localeCompare(`${b.name} ${b.arm}`);
          })
      })),
    [classes]
  );
  const canCreateClass = Boolean(form.name.trim() && form.arm.trim() && form.institution);
  const canSaveClass = Boolean(editForm.name.trim() && editForm.arm.trim() && editForm.institution);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setCreatingClass(true);

    try {
      const payload = {
        ...form,
        name: form.name.trim(),
        arm: form.arm.trim()
      };
      const data = await apiJson('/admin/classes', {
        method: 'POST',
        body: payload
      });

      setForm({ name: '', arm: '', institution: form.institution, progressionOrder: '' });
      setClasses((prev) => [data.class, ...prev]);
    } catch (err) {
      setError(err.message || 'Unable to create class.');
    } finally {
      setCreatingClass(false);
    }
  }

  function startEdit(classItem) {
    setEditingId(classItem.id);
    setEditForm({
      name: classItem.name,
      arm: classItem.arm,
      institution: classItem.institution,
      progressionOrder: classItem.progressionOrder ?? ''
    });
  }

  function cancelEdit() {
    setEditingId('');
  }

  async function handleUpdate(classId) {
    setError('');
    setSavingClassId(classId);

    try {
      const payload = {
        ...editForm,
        name: editForm.name.trim(),
        arm: editForm.arm.trim()
      };
      const data = await apiJson(`/admin/classes/${classId}`, {
        method: 'PUT',
        body: payload
      });

      setClasses((prev) => prev.map((item) => (item.id === classId ? data.class : item)));
      setEditingId('');
    } catch (err) {
      setError(err.message || 'Unable to update class.');
    } finally {
      setSavingClassId('');
    }
  }

  async function handleDelete(classId) {
    setError('');

    try {
      setDeletingId(classId);
      await apiJson(`/admin/classes/${classId}`, { method: 'DELETE' });

      setClasses((prev) => prev.filter((item) => item.id !== classId));
      if (editingId === classId) setEditingId('');
    } catch (err) {
      setError(err.message || 'Unable to delete class.');
    } finally {
      setDeletingId((prev) => (prev === classId ? '' : prev));
    }
  }

  return (
    <PortalLayout
      role="admin"
      title="Class Structure"
      subtitle="ATTAUFEEQ Model Academy, Madrastul ATTAUFEEQ, and Quran Memorization run as separate academic sections with class-level student counts."
    >
      <div className="grid gap-4 lg:grid-cols-3">
        {groupedClasses.map((group) => (
          <article key={group.institution} className="dashboard-tile">
            <p className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${institutionAccent(group.institution)}`}>
              {group.institution}
            </p>
            <p className="mt-4 text-3xl font-bold text-slate-900">{group.rows.length}</p>
            <p className="mt-2 text-sm text-slate-600">Configured classes in this institution.</p>
          </article>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="admin-surface mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <label className="field-shell">
          <span className="field-label">Class name</span>
          <input
            required
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Class name"
            className="form-field"
          />
        </label>
        <label className="field-shell">
          <span className="field-label">Arm</span>
          <input
            required
            value={form.arm}
            onChange={(e) => setForm((prev) => ({ ...prev, arm: e.target.value }))}
            placeholder="Arm"
            className="form-field"
          />
        </label>
        <label className="field-shell">
          <span className="field-label">Progression order</span>
          <input
            type="number"
            value={form.progressionOrder}
            onChange={(e) => setForm((prev) => ({ ...prev, progressionOrder: e.target.value }))}
            placeholder="Progression order"
            className="form-field"
          />
        </label>
        <label className="field-shell">
          <span className="field-label">Institution</span>
          <select
            value={form.institution}
            onChange={(e) => setForm((prev) => ({ ...prev, institution: e.target.value }))}
            className="form-select"
          >
            {ADMIN_INSTITUTIONS.map((institution) => (
              <option key={institution}>{institution}</option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={creatingClass || !canCreateClass}
          className="interactive-button self-end"
        >
          {creatingClass ? 'Adding...' : 'Add Class'}
        </button>
      </form>

      {loading && <div className="status-banner mt-4">Loading classes...</div>}
      {error && <ErrorState compact title="Unable to manage classes" message={error} className="mt-4" onRetry={loadClasses} />}

      <div className="mt-8 space-y-6">
        {groupedClasses.map((group) => (
          <section key={group.institution} className="admin-surface">
            <div className="admin-toolbar">
              <div>
                <h2 className="font-heading text-2xl text-primary">{group.institution}</h2>
                <p className="mt-2 text-sm text-slate-600">Classes stay isolated here and show live student counts.</p>
              </div>
              <span className={`rounded-full border px-3 py-2 text-xs font-semibold ${institutionAccent(group.institution)}`}>
                {group.rows.length} classes
              </span>
            </div>

            <div className="mt-5 overflow-x-auto rounded-3xl border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                <span>Classes table</span>
                <button
                  type="button"
                  onClick={() => {
                    const nextValue = !resolveShowRows(group.institution);
                    setShowRowsByInstitution((prev) => ({ ...prev, [group.institution]: nextValue }));
                  }}
                  className="interactive-button"
                >
                  {resolveShowRows(group.institution) ? 'Hide rows' : 'Show rows'}
                </button>
              </div>
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="px-4 py-3">Class</th>
                    <th className="px-4 py-3">Arm</th>
                    <th className="px-4 py-3">Order</th>
                    <th className="px-4 py-3">Students</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {!resolveShowRows(group.institution) && (
                    <tr>
                      <td className="px-4 py-6 text-center text-slate-500" colSpan={5}>
                        Rows are hidden. Click “Show rows” to display classes.
                      </td>
                    </tr>
                  )}
                  {resolveShowRows(group.institution) && group.rows.map((classItem) => (
                    <tr key={classItem.id} className="border-t border-slate-100">
                      <td className="px-4 py-3">
                        {editingId === classItem.id ? (
                          <input
                            value={editForm.name}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                            className="form-field w-full"
                          />
                        ) : (
                          classItem.name
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {editingId === classItem.id ? (
                          <input
                            value={editForm.arm}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, arm: e.target.value }))}
                            className="form-field w-full"
                          />
                        ) : (
                          classItem.arm
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {editingId === classItem.id ? (
                          <input
                            type="number"
                            value={editForm.progressionOrder}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, progressionOrder: e.target.value }))}
                            className="form-field w-full"
                          />
                        ) : (
                          classItem.progressionOrder ?? '—'
                        )}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-800">{classItem.studentCount || 0}</td>
                      <td className="px-4 py-3">
                        {editingId === classItem.id ? (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleUpdate(classItem.id)}
                              disabled={savingClassId === classItem.id || !canSaveClass}
                              className="interactive-button"
                            >
                              {savingClassId === classItem.id ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              disabled={savingClassId === classItem.id}
                              className="interactive-button"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => startEdit(classItem)}
                              className="interactive-button"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(classItem.id)}
                              disabled={deletingId === classItem.id}
                              className="interactive-button border-red-300 text-red-600"
                            >
                              {deletingId === classItem.id ? 'Deleting...' : 'Delete'}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {resolveShowRows(group.institution) && !group.rows.length && (
                    <tr>
                      <td className="px-4 py-8 text-center text-slate-500" colSpan={4}>
                        No classes configured for this institution yet.
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

export default ManageClasses;
