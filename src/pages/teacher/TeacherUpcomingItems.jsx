import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PortalLayout from '../../components/PortalLayout';
import { useAuth } from '../../context/AuthContext';

function formatDate(value) {
  if (!value) return 'No due date';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'No due date';
  return parsed.toLocaleDateString();
}

function toDateInputValue(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function TeacherUpcomingItems() {
  const { apiJson, user } = useAuth();
  const [items, setItems] = useState([]);
  const [classes, setClasses] = useState([]);
  const [form, setForm] = useState({ classId: '', title: '', details: '', dueDate: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingId, setEditingId] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [showRowsByClass, setShowRowsByClass] = useState(() => ({}));
  const resolveShowRows = (key) => showRowsByClass[key] !== false;
  const currentTeacherId = user?.profile?.id || '';
  const loadDataSeq = useRef(0);

  function resetForm(nextClassId = '') {
    setEditingId('');
    setForm({
      classId: nextClassId,
      title: '',
      details: '',
      dueDate: ''
    });
  }

  const loadData = useCallback(async () => {
    const seq = ++loadDataSeq.current;
    setLoading(true);
    setError('');
    setItems([]);
    setClasses([]);
    setEditingId('');
    try {
      const data = await apiJson('/upcoming/teacher');
      if (seq !== loadDataSeq.current) return;
      setItems(data.items || []);
      setClasses(data.classes || []);
      setForm((prev) => {
        const fallbackClassId = data.classes?.[0]?.id || '';
        const nextClassId = data.classes?.some((item) => item.id === prev.classId) ? prev.classId : fallbackClassId;
        return {
          ...prev,
          classId: nextClassId
        };
      });
    } catch (err) {
      if (seq !== loadDataSeq.current) return;
      setError(err.message || 'Unable to load upcoming items.');
    } finally {
      if (seq === loadDataSeq.current) {
        setLoading(false);
      }
    }
  }, [apiJson]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function createItem(event) {
    event.preventDefault();
    if (editingId) {
      return updateItem();
    }
    setError('');
    setSuccess('');
    try {
      const data = await apiJson('/upcoming/teacher', {
        method: 'POST',
        body: {
          classId: form.classId,
          title: form.title,
          details: form.details,
          dueDate: form.dueDate
        }
      });
      setItems((prev) => [data.item, ...prev]);
      setForm((prev) => ({ ...prev, title: '', details: '', dueDate: '' }));
      setSuccess('Upcoming item posted to the class.');
    } catch (err) {
      setError(err.message || 'Unable to post upcoming item.');
    }
  }

  async function updateItem() {
    setError('');
    setSuccess('');
    try {
      const data = await apiJson(`/upcoming/teacher/${editingId}`, {
        method: 'PUT',
        body: {
          classId: form.classId,
          title: form.title,
          details: form.details,
          dueDate: form.dueDate
        }
      });
      setItems((prev) => prev.map((item) => (item.id === editingId ? data.item : item)));
      resetForm(data.item?.classId || classes[0]?.id || '');
      setSuccess('Upcoming item updated.');
    } catch (err) {
      setError(err.message || 'Unable to update upcoming item.');
    }
  }

  function startEdit(item) {
    if (item.teacherId !== currentTeacherId) {
      setError('You can only edit items you posted.');
      setSuccess('');
      return;
    }
    setEditingId(item.id);
    setForm({
      classId: item.classId || '',
      title: item.title || '',
      details: item.details || '',
      dueDate: toDateInputValue(item.dueDate)
    });
  }

  function cancelEdit() {
    resetForm(classes.some((item) => item.id === form.classId) ? form.classId : classes[0]?.id || '');
  }

  async function deleteItem(itemId) {
    if (!window.confirm('Remove this upcoming item?')) return;
    setError('');
    setSuccess('');
    try {
      setDeletingId(itemId);
      await apiJson(`/upcoming/teacher/${itemId}`, { method: 'DELETE' });
      setItems((prev) => prev.filter((item) => item.id !== itemId));
      if (itemId === editingId) {
        resetForm(classes.some((item) => item.id === form.classId) ? form.classId : classes[0]?.id || '');
      }
      setSuccess('Upcoming item removed.');
    } catch (err) {
      setError(err.message || 'Unable to delete upcoming item.');
    } finally {
      setDeletingId((prev) => (prev === itemId ? '' : prev));
    }
  }

  const groupedItems = useMemo(() => {
    const grouped = new Map();
    items.forEach((item) => {
      const key = item.classId || 'unknown';
      if (!grouped.has(key)) {
        grouped.set(key, { classLabel: item.classLabel || 'Unassigned class', rows: [] });
      }
      grouped.get(key).rows.push(item);
    });
    return Array.from(grouped.values());
  }, [items]);
  const hasClasses = classes.length > 0;
  const hasValidTitle = Boolean(form.title.trim());
  const canSubmit = hasClasses && hasValidTitle && Boolean(form.classId);

  return (
    <PortalLayout
      role="teacher"
      title="Upcoming Items"
      subtitle="Post class reminders, tests, and assignments so students see them immediately on their dashboard."
    >
      <div className="space-y-5">
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-heading text-xl text-primary">Post a new item</h2>
          <p className="mt-2 text-sm text-slate-600">Share upcoming tests, homework, or reminders with the selected class.</p>

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          {success && <p className="mt-3 text-sm text-emerald-700">{success}</p>}
          {loading && <p className="mt-3 text-sm text-slate-600">Loading class options...</p>}

          <form onSubmit={createItem} className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="lg:col-span-1">
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Class</label>
              <select
                value={form.classId}
                onChange={(e) => setForm((prev) => ({ ...prev, classId: e.target.value }))}
                className="mt-2 w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm"
                required
              >
                {classes.length === 0 && <option value="">No assigned classes</option>}
                {classes.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            </div>

            <div className="lg:col-span-1">
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Due date</label>
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm((prev) => ({ ...prev, dueDate: e.target.value }))}
                className="mt-2 w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Title</label>
              <input
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Mathematics test, Chapter 4 homework, Group revision..."
                className="mt-2 w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm"
                required
              />
            </div>

            <div className="lg:col-span-2">
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Details</label>
              <textarea
                value={form.details}
                onChange={(e) => setForm((prev) => ({ ...prev, details: e.target.value }))}
                placeholder="Optional notes for the class."
                className="mt-2 w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm"
                rows={3}
              />
            </div>

            <div className="lg:col-span-2 flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={!canSubmit}
                className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {editingId ? 'Update item' : 'Post upcoming item'}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
                >
                  Cancel edit
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-heading text-xl text-primary">Posted items</h2>
          <p className="mt-2 text-sm text-slate-600">Students see these inside the “Upcoming Items” focus card.</p>

          {!items.length && !loading && (
            <p className="mt-4 text-sm text-slate-600">No upcoming items yet. Post one above to notify your class.</p>
          )}

          <div className="mt-5 space-y-5">
            {groupedItems.map((group) => (
              <div key={group.classLabel} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">{group.classLabel}</h3>
                <div className="mt-3 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  <span>Items</span>
                  <button
                    type="button"
                    onClick={() => {
                      const nextValue = !resolveShowRows(group.classLabel);
                      setShowRowsByClass((prev) => ({ ...prev, [group.classLabel]: nextValue }));
                    }}
                    className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                  >
                    {resolveShowRows(group.classLabel) ? 'Hide rows' : 'Show rows'}
                  </button>
                </div>
                <div className="mt-4 space-y-3">
                  {!resolveShowRows(group.classLabel) && (
                    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 text-center">
                      Rows are hidden. Click “Show rows” to display items.
                    </div>
                  )}
                  {resolveShowRows(group.classLabel) && group.rows.map((item) => (
                    <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            Due: {formatDate(item.dueDate)} • Posted {new Date(item.createdAt).toLocaleDateString()}
                          </p>
                          {item.teacherName && item.teacherId !== currentTeacherId && (
                            <p className="mt-1 text-xs text-slate-500">Posted by {item.teacherName}</p>
                          )}
                          {item.details && <p className="mt-2 text-sm text-slate-600">{item.details}</p>}
                        </div>
                        {item.teacherId === currentTeacherId ? (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => startEdit(item)}
                              className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteItem(item.id)}
                              disabled={deletingId === item.id}
                              className="rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {deletingId === item.id ? 'Deleting...' : 'Delete'}
                            </button>
                          </div>
                        ) : (
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Shared item</p>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </PortalLayout>
  );
}

export default TeacherUpcomingItems;
