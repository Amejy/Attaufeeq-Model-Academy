import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import PortalLayout from '../../components/PortalLayout';
import ProvisioningPanel from '../../components/ProvisioningPanel';
import { ADMIN_INSTITUTIONS, canonicalInstitution } from '../../utils/adminInstitution';
import useDebouncedValue from '../../hooks/useDebouncedValue';

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function highlightMatch(text, query) {
  const safeText = String(text || '');
  const safeQuery = String(query || '').trim();
  if (!safeQuery) return safeText;
  const lower = safeText.toLowerCase();
  const index = lower.indexOf(safeQuery.toLowerCase());
  if (index === -1) return safeText;
  const before = safeText.slice(0, index);
  const match = safeText.slice(index, index + safeQuery.length);
  const after = safeText.slice(index + safeQuery.length);
  return (
    <span>
      {before}
      <span className="rounded bg-amber-100 px-1 text-amber-900">{match}</span>
      {after}
    </span>
  );
}

function ManageTeachers() {
  const { apiJson } = useAuth();
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [lastCredentials, setLastCredentials] = useState([]);
  const [form, setForm] = useState({ fullName: '', email: '', institution: ADMIN_INSTITUTIONS[0] });
  const [editingId, setEditingId] = useState('');
  const [editForm, setEditForm] = useState({ fullName: '', email: '', institution: ADMIN_INSTITUTIONS[0] });
  const [search, setSearch] = useState('');
  const [institutionFilter, setInstitutionFilter] = useState('all');
  const [sortBy, setSortBy] = useState('name-asc');
  const [page, setPage] = useState(1);
  const [deletingId, setDeletingId] = useState('');
  const [creatingTeacher, setCreatingTeacher] = useState(false);
  const [savingTeacherId, setSavingTeacherId] = useState('');
  const [showRows, setShowRows] = useState(true);
  const loadTeachersSeq = useRef(0);
  const fetchSeq = useRef(0);
  const pageSize = 10;
  const debouncedSearch = useDebouncedValue(search.trim(), 300);

  const loadTeachers = useCallback(async () => {
    const seq = ++loadTeachersSeq.current;
    setLoading(true);
    setError('');
    setSuccess('');
    setTeachers([]);
    setLastCredentials([]);
    setEditingId('');

    try {
      const data = await apiJson('/admin/teachers');
      if (seq !== loadTeachersSeq.current) return;
      setTeachers(data.teachers || []);
    } catch (err) {
      if (seq !== loadTeachersSeq.current) return;
      setError(err.message || 'Unable to fetch teachers.');
    } finally {
      if (seq === loadTeachersSeq.current) {
        setLoading(false);
      }
    }
  }, [apiJson]);

  useEffect(() => {
    loadTeachers();
  }, [loadTeachers]);

  useEffect(() => {
    let active = true;
    const seq = ++fetchSeq.current;
    const params = new URLSearchParams();
    if (institutionFilter !== 'all') params.set('institution', institutionFilter);
    if (debouncedSearch) params.set('q', debouncedSearch);
    if (sortBy === 'created-desc') params.set('sort', 'created_desc');
    if (sortBy === 'created-asc') params.set('sort', 'created_asc');
    if (sortBy === 'name-asc') params.set('sort', 'name_asc');
    if (sortBy === 'name-desc') params.set('sort', 'name_desc');

    async function refreshTeachers() {
      try {
        const query = params.toString();
        const data = await apiJson(`/admin/teachers${query ? `?${query}` : ''}`);
        if (!active || seq !== fetchSeq.current) return;
        setTeachers(data.teachers || []);
      } catch {
        // keep last loaded list on transient errors
      }
    }

    refreshTeachers();
    return () => {
      active = false;
    };
  }, [apiJson, debouncedSearch, institutionFilter, sortBy]);

  const filteredTeachers = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();
    return teachers
      .filter((item) => {
        const byInstitution =
          institutionFilter === 'all'
            ? true
            : canonicalInstitution(item.institution) === canonicalInstitution(institutionFilter);
        const bySearch =
          !query || `${item.fullName} ${item.email}`.toLowerCase().includes(query);
        return byInstitution && bySearch;
      })
      .sort((a, b) => {
        if (sortBy === 'created-desc') {
          return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        }
        if (sortBy === 'created-asc') {
          return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
        }
        return a.fullName.localeCompare(b.fullName);
      });
  }, [debouncedSearch, institutionFilter, sortBy, teachers]);

  const totalPages = Math.max(1, Math.ceil(filteredTeachers.length / pageSize));
  const pagedTeachers = filteredTeachers.slice((page - 1) * pageSize, page * pageSize);
  const canCreateTeacher = Boolean(
    form.fullName.trim() &&
    isValidEmail(form.email) &&
    form.institution
  );
  const canSaveTeacher = Boolean(
    editForm.fullName.trim() &&
    isValidEmail(editForm.email) &&
    editForm.institution
  );

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setCreatingTeacher(true);

    try {
      const data = await apiJson('/admin/teachers', {
        method: 'POST',
        body: form
      });

      setForm({ fullName: '', email: '', institution: ADMIN_INSTITUTIONS[0] });
      setTeachers((prev) => [data.teacher, ...prev]);
      setLastCredentials(data.credentials ? [data.credentials] : []);
      setSuccess('Teacher record created and portal access was provisioned.');
    } catch (err) {
      setError(err.message || 'Unable to create teacher.');
    } finally {
      setCreatingTeacher(false);
    }
  }

  function startEdit(teacher) {
    setEditingId(teacher.id);
    setEditForm({
      fullName: teacher.fullName,
      email: teacher.email,
      institution: teacher.institution
    });
  }

  function cancelEdit() {
    setEditingId('');
  }

  async function handleUpdate(teacherId) {
    setError('');
    setSuccess('');
    setSavingTeacherId(teacherId);

    try {
      const data = await apiJson(`/admin/teachers/${teacherId}`, {
        method: 'PUT',
        body: editForm
      });

      setTeachers((prev) => prev.map((item) => (item.id === teacherId ? data.teacher : item)));
      setEditingId('');
      setSuccess('Teacher record updated successfully.');
    } catch (err) {
      setError(err.message || 'Unable to update teacher.');
    } finally {
      setSavingTeacherId('');
    }
  }

  async function handleDelete(teacherId) {
    setError('');
    setSuccess('');

    try {
      setDeletingId(teacherId);
      await apiJson(`/admin/teachers/${teacherId}`, { method: 'DELETE' });

      setTeachers((prev) => prev.filter((item) => item.id !== teacherId));
      if (editingId === teacherId) setEditingId('');
      setSuccess('Teacher record deleted successfully.');
    } catch (err) {
      setError(err.message || 'Unable to delete teacher.');
    } finally {
      setDeletingId((prev) => (prev === teacherId ? '' : prev));
    }
  }

  return (
    <PortalLayout role="admin" title="Manage Teachers" subtitle="Create and manage teacher records.">

      {success && <p className="mt-4 text-sm text-emerald-700">{success}</p>}
      <ProvisioningPanel
        title="Teacher login issued"
        description="Share these credentials securely. If SMTP is enabled later, the same flow can email them automatically."
        records={lastCredentials}
      />

      <form onSubmit={handleSubmit} className="mt-6 grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-4">
        <input
          required
          value={form.fullName}
          onChange={(e) => setForm((prev) => ({ ...prev, fullName: e.target.value }))}
          placeholder="Full name"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          type="email"
          required
          value={form.email}
          onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
          placeholder="Email"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <select
          value={form.institution}
          onChange={(e) => setForm((prev) => ({ ...prev, institution: e.target.value }))}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {ADMIN_INSTITUTIONS.map((institution) => (
            <option key={institution} value={institution}>{institution}</option>
          ))}
        </select>
        <button
          type="submit"
          disabled={creatingTeacher || !canCreateTeacher}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {creatingTeacher ? 'Adding...' : 'Add Teacher'}
        </button>
      </form>

      <div className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search name or email"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <select
          value={institutionFilter}
          onChange={(e) => {
            setInstitutionFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="all">All Institutions</option>
          {ADMIN_INSTITUTIONS.map((institution) => (
            <option key={institution} value={institution}>{institution}</option>
          ))}
        </select>
        <select
          value={sortBy}
          onChange={(e) => {
            setSortBy(e.target.value);
            setPage(1);
          }}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="name-asc">Sort by name</option>
          <option value="created-desc">Newest added</option>
          <option value="created-asc">Oldest added</option>
        </select>
      </div>

      {loading && <p className="mt-4 text-sm text-slate-600">Loading...</p>}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          <span>Teachers table</span>
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
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Institution</th>
              <th className="px-4 py-3">Portal Access</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {!showRows && (
              <tr>
                <td className="px-4 py-6 text-center text-slate-500" colSpan={5}>
                  Rows are hidden. Click “Show rows” to display teacher records.
                </td>
              </tr>
            )}
            {showRows && pagedTeachers.map((teacher) => (
              <tr key={teacher.id} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  {editingId === teacher.id ? (
                    <input
                      value={editForm.fullName}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, fullName: e.target.value }))}
                      className="w-full rounded-md border border-slate-300 px-2 py-1"
                    />
                  ) : (
                    highlightMatch(teacher.fullName, debouncedSearch)
                  )}
                </td>
                <td className="px-4 py-3">
                  {editingId === teacher.id ? (
                    <input
                      type="email"
                      value={editForm.email}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))}
                      className="w-full rounded-md border border-slate-300 px-2 py-1"
                    />
                  ) : (
                    highlightMatch(teacher.email, debouncedSearch)
                  )}
                </td>
                <td className="px-4 py-3">
                  {editingId === teacher.id ? (
                    <select
                      value={editForm.institution}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, institution: e.target.value }))}
                      className="w-full rounded-md border border-slate-300 px-2 py-1"
                    >
                      {ADMIN_INSTITUTIONS.map((institution) => (
                        <option key={institution} value={institution}>{institution}</option>
                      ))}
                    </select>
                  ) : (
                    teacher.institution
                  )}
                </td>
                <td className="px-4 py-3">
                  <div>
                    <p className="font-medium text-slate-800">{teacher.portalEmail || teacher.email}</p>
                    <p className="mt-1 text-xs text-slate-500">{teacher.accountStatus === 'provisioned' ? 'Forced password change on first login' : 'Portal account pending'}</p>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {editingId === teacher.id ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleUpdate(teacher.id)}
                        disabled={savingTeacherId === teacher.id || !canSaveTeacher}
                        className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {savingTeacherId === teacher.id ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        disabled={savingTeacherId === teacher.id}
                        className="rounded-md border border-slate-300 px-3 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(teacher)}
                        className="rounded-md border border-slate-300 px-3 py-1 text-xs"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(teacher.id)}
                        disabled={deletingId === teacher.id}
                        className="rounded-md border border-red-300 px-3 py-1 text-xs text-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {deletingId === teacher.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {showRows && !pagedTeachers.length && (
              <tr>
                <td className="px-4 py-3 text-slate-600" colSpan={5}>No teachers found for current filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 text-sm text-slate-600">
        <p>Showing {pagedTeachers.length} of {filteredTeachers.length} teachers</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            className="rounded-md border border-slate-300 px-3 py-1 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Prev
          </button>
          <span>Page {page} / {totalPages}</span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            className="rounded-md border border-slate-300 px-3 py-1 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </PortalLayout>
  );
}

export default ManageTeachers;
