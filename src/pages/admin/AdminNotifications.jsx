import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import PortalLayout from '../../components/PortalLayout';

function AdminNotifications() {
  const { apiJson } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [targetsLoading, setTargetsLoading] = useState(true);
  const [targetsError, setTargetsError] = useState('');
  const [form, setForm] = useState({
    title: '',
    message: '',
    roleTarget: 'all',
    classId: '',
    teacherId: '',
    recipientEmail: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('recent');
  const [showRows, setShowRows] = useState(true);
  const hasDirectRecipient = Boolean(String(form.recipientEmail || '').trim());
  const hasValidDirectRecipient = !hasDirectRecipient || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(form.recipientEmail || '').trim());
  const teacherTargetsReady = form.roleTarget !== 'teacher' || (!targetsLoading && !targetsError);
  const classHasAssignedTeachers = !form.classId || assignments.some((item) => item.classId === form.classId);
  const canSendNotification = Boolean(String(form.title || '').trim() && String(form.message || '').trim() && form.roleTarget) && hasValidDirectRecipient && teacherTargetsReady && classHasAssignedTeachers && !sending;

  const loadNotifications = useCallback(async () => {
    let isCurrent = true;
    setError('');
    setSuccess('');
    setNotifications([]);

    (async () => {
      try {
        const data = await apiJson('/notifications/admin');
        if (!isCurrent) return;
        setNotifications(data.notifications || []);
      } catch (err) {
        if (!isCurrent) return;
        setError(err.message || 'Unable to load notifications.');
      }
    })();

    return () => {
      isCurrent = false;
    };
  }, [apiJson]);

  useEffect(() => {
    const cleanup = loadNotifications();
    return typeof cleanup === 'function' ? cleanup : undefined;
  }, [loadNotifications]);

  useEffect(() => {
    let isCurrent = true;

    async function loadTargets() {
      setTargetsLoading(true);
      setTargetsError('');
      setClasses([]);
      setTeachers([]);
      setAssignments([]);
      try {
        const [classesData, teachersData, assignmentsData] = await Promise.all([
          apiJson('/admin/classes'),
          apiJson('/admin/teachers'),
          apiJson('/admin/teacher-assignments')
        ]);
        if (!isCurrent) return;
        setClasses(classesData.classes || []);
        setTeachers(teachersData.teachers || []);
        setAssignments(assignmentsData.assignments || []);
      } catch (err) {
        if (!isCurrent) return;
        setTargetsError(err.message || 'Unable to load teacher notification targets.');
      } finally {
        if (isCurrent) {
          setTargetsLoading(false);
        }
      }
    }

    void loadTargets();
    return () => {
      isCurrent = false;
    };
  }, [apiJson]);

  useEffect(() => {
    if (form.roleTarget !== 'teacher') return;

    const hasClass = !form.classId || classes.some((item) => item.id === form.classId);
    const hasTeacher = !form.teacherId || teachers.some((item) => item.id === form.teacherId);

    if (hasClass && hasTeacher) return;

    setForm((prev) => ({
      ...prev,
      classId: hasClass ? prev.classId : '',
      teacherId: hasTeacher ? prev.teacherId : ''
    }));
  }, [classes, form.classId, form.roleTarget, form.teacherId, teachers]);

  useEffect(() => {
    if (form.roleTarget !== 'teacher' || !form.classId) return;
    if (assignments.some((item) => item.classId === form.classId)) return;

    setForm((prev) => ({ ...prev, classId: '' }));
  }, [assignments, form.classId, form.roleTarget]);

  async function sendNotification(event) {
    event.preventDefault();
    setError('');
    setSuccess('');

    try {
      setSending(true);
      const data = await apiJson('/notifications/admin', {
        method: 'POST',
        body: {
          title: form.title.trim(),
          message: form.message.trim(),
          roleTarget: form.roleTarget,
          classId: form.classId || '',
          teacherId: form.teacherId || '',
          recipientEmail: form.recipientEmail.trim()
        }
      });

      const delivery = data.delivery || {};
      const sentCount = Number(delivery.sent || 0);
      const attemptedCount = Number(delivery.attempted || 0);
      const failedCount = Number(delivery.failed || 0);

      setSuccess(
        attemptedCount
          ? `Notification sent. ${sentCount} email${sentCount === 1 ? '' : 's'} delivered, ${failedCount} failed.`
          : 'Notification saved in the portal notification center.'
      );
      setForm({
        title: '',
        message: '',
        roleTarget: 'all',
        classId: '',
        teacherId: '',
        recipientEmail: ''
      });
      setNotifications((prev) => [data.notification, ...prev]);
    } catch (err) {
      setError(err.message || 'Unable to send notification.');
    } finally {
      setSending(false);
    }
  }

  async function deleteNotification(id) {
    if (!window.confirm('Delete this notification?')) return;
    setError('');
    setSuccess('');
    try {
      setDeletingId(id);
      await apiJson(`/notifications/admin/${id}`, { method: 'DELETE' });
      setNotifications((prev) => prev.filter((item) => item.id !== id));
      setSuccess('Notification deleted.');
    } catch (err) {
      setError(err.message || 'Unable to delete notification.');
    } finally {
      setDeletingId((prev) => (prev === id ? '' : prev));
    }
  }

  const classLabel = (classId) => {
    const found = classes.find((item) => item.id === classId);
    return found ? `${found.name} ${found.arm}` : classId;
  };
  const teacherLabel = (teacherId) => {
    const found = teachers.find((item) => item.id === teacherId);
    return found ? found.fullName : teacherId;
  };

  const filteredNotifications = useMemo(() => {
    const query = search.trim().toLowerCase();
    return notifications
      .filter((item) => {
        if (roleFilter === 'all') return true;
        if (roleFilter === 'direct') return Boolean(item.recipientEmail);
        return item.roleTarget === roleFilter;
      })
      .filter((item) => {
        if (!query) return true;
        const summary = [
          item.title,
          item.message,
          item.recipientEmail,
          item.roleTarget,
          item.classId ? classLabel(item.classId) : '',
          item.teacherId ? teacherLabel(item.teacherId) : ''
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return summary.includes(query);
      })
      .sort((a, b) => {
        if (sortOrder === 'title') return String(a.title || '').localeCompare(String(b.title || ''));
        const aTime = new Date(a.createdAt || a.updatedAt || 0).getTime();
        const bTime = new Date(b.createdAt || b.updatedAt || 0).getTime();
        if (sortOrder === 'oldest') return aTime - bTime;
        return bTime - aTime;
      });
  }, [classLabel, notifications, roleFilter, search, sortOrder, teacherLabel]);

  return (
    <PortalLayout
      role="admin"
      title="Notifications"
      subtitle="Send announcements to specific portal roles."
    >

      <form onSubmit={sendNotification} className="mt-6 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-4">
        <input value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} placeholder="Title" className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2" required />
        <select
          value={form.roleTarget}
          onChange={(e) => {
            const nextRole = e.target.value;
            setForm((prev) => ({
              ...prev,
              roleTarget: nextRole,
              classId: nextRole === 'teacher' ? prev.classId : '',
              teacherId: nextRole === 'teacher' ? prev.teacherId : ''
            }));
          }}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {['all', 'admin', 'teacher', 'student', 'parent'].map((target) => <option key={target} value={target}>{target}</option>)}
        </select>
        <button
          type="submit"
          disabled={!canSendNotification}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {sending ? 'Sending...' : 'Send'}
        </button>
        {form.roleTarget === 'teacher' && (
          <>
            <select
              value={form.classId}
              onChange={(e) => setForm((prev) => ({ ...prev, classId: e.target.value, teacherId: '' }))}
              disabled={hasDirectRecipient}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
            >
              <option value="">All classes</option>
              {classes.map((item) => (
                <option key={item.id} value={item.id}>{item.name} {item.arm}</option>
              ))}
            </select>
            <select
              value={form.teacherId}
              onChange={(e) => setForm((prev) => ({ ...prev, teacherId: e.target.value, classId: '' }))}
              disabled={hasDirectRecipient}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
            >
              <option value="">All teachers</option>
              {teachers.map((item) => (
                <option key={item.id} value={item.id}>{item.fullName}</option>
              ))}
            </select>
          </>
        )}
        <input
          value={form.recipientEmail}
          onChange={(e) =>
            setForm((prev) => ({
              ...prev,
              recipientEmail: e.target.value,
              classId: e.target.value.trim() ? '' : prev.classId,
              teacherId: e.target.value.trim() ? '' : prev.teacherId
            }))
          }
          placeholder="Specific email (optional)"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-4"
        />
        {hasDirectRecipient && !hasValidDirectRecipient && (
          <p className="text-sm text-amber-700 sm:col-span-4">
            Enter a valid email address to send a direct notification.
          </p>
        )}
        {!hasDirectRecipient && form.roleTarget === 'teacher' && form.classId && !classHasAssignedTeachers && (
          <p className="text-sm text-amber-700 sm:col-span-4">
            The selected class has no teacher assignments yet, so this notification would reach nobody.
          </p>
        )}
        <textarea value={form.message} onChange={(e) => setForm((prev) => ({ ...prev, message: e.target.value }))} placeholder="Message" className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-4" rows="4" required />
      </form>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {success && <p className="mt-4 text-sm text-emerald-700">{success}</p>}
      {form.roleTarget === 'teacher' && targetsError && (
        <p className="mt-4 text-sm text-amber-700">{targetsError}</p>
      )}

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notifications"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="all">All recipients</option>
            <option value="admin">Admin</option>
            <option value="teacher">Teacher</option>
            <option value="student">Student</option>
            <option value="parent">Parent</option>
            <option value="direct">Direct email</option>
          </select>
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="recent">Most recent</option>
            <option value="oldest">Oldest</option>
            <option value="title">Title A-Z</option>
          </select>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setRoleFilter('all');
              setSortOrder('recent');
            }}
            className="rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600"
          >
            Clear filters
          </button>
          <span className="rounded-full border border-slate-200 px-3 py-2 text-xs text-slate-600">
            {filteredNotifications.length} visible
          </span>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          <span>Notifications list</span>
          <button
            type="button"
            onClick={() => setShowRows((prev) => !prev)}
            className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
          >
            {showRows ? 'Hide rows' : 'Show rows'}
          </button>
        </div>
        {!showRows && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 text-center">
            Rows are hidden. Click “Show rows” to display notifications.
          </div>
        )}
        {showRows && filteredNotifications.map((item) => (
          <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase text-slate-500">
              {item.recipientEmail
                ? `Direct: ${item.recipientEmail}`
                : item.teacherId
                  ? `Teacher: ${teacherLabel(item.teacherId)}`
                  : item.classId
                    ? `Class Teachers: ${classLabel(item.classId)}`
                    : item.roleTarget}
            </p>
            <h3 className="mt-1 font-semibold text-primary">{item.title}</h3>
            <p className="mt-1 text-sm text-slate-700">{item.message}</p>
            <div className="mt-3">
              <button
                type="button"
                disabled={deletingId === item.id}
                onClick={() => deleteNotification(item.id)}
                className="rounded-md border border-red-300 px-3 py-1 text-xs text-red-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletingId === item.id ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </article>
        ))}
        {showRows && !filteredNotifications.length && (
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            No notifications match the current filters.
          </p>
        )}
      </div>
    </PortalLayout>
  );
}

export default AdminNotifications;
