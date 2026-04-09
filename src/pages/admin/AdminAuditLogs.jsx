import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import PortalLayout from '../../components/PortalLayout';
import ProvisioningPanel from '../../components/ProvisioningPanel';
import { buildStudentCode } from '../../utils/studentCode';

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function AdminAuditLogs() {
  const { apiJson } = useAuth();
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showRows, setShowRows] = useState(true);
  const [resetEmail, setResetEmail] = useState('');
  const [resetCredential, setResetCredential] = useState([]);
  const [handlers, setHandlers] = useState([]);
  const [handlerForm, setHandlerForm] = useState({ fullName: '', email: '' });
  const [handlerCredential, setHandlerCredential] = useState([]);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [creatingHandler, setCreatingHandler] = useState(false);
  const [deletingHandlerId, setDeletingHandlerId] = useState('');
  const [filters, setFilters] = useState({
    actorRole: '',
    method: '',
    statusCode: '',
    search: '',
    limit: 200
  });
  const loadLogsSeq = useRef(0);
  const loadHandlersSeq = useRef(0);
  const canCreateHandler = Boolean(handlerForm.fullName.trim() && isValidEmail(handlerForm.email));
  const canResetPassword = Boolean(isValidEmail(resetEmail));

  const loadLogs = useCallback(async (nextFilters = filters) => {
    const seq = ++loadLogsSeq.current;
    setError('');
    setLogs([]);
    try {
      const normalizedSearch = String(nextFilters.search || '').trim();
      const params = new URLSearchParams();
      if (nextFilters.actorRole) params.set('actorRole', nextFilters.actorRole);
      if (nextFilters.method) params.set('method', nextFilters.method);
      if (nextFilters.statusCode) params.set('statusCode', nextFilters.statusCode);
      if (normalizedSearch) params.set('search', normalizedSearch);
      if (nextFilters.limit) params.set('limit', String(nextFilters.limit));

      const data = await apiJson(`/admin/audit-logs?${params.toString()}`);
      if (seq !== loadLogsSeq.current) return;
      setLogs(data.logs || []);
    } catch (err) {
      if (seq !== loadLogsSeq.current) return;
      setError(err.message || 'Unable to load audit logs.');
    }
  }, [apiJson, filters]);

  const loadHandlers = useCallback(async () => {
    const seq = ++loadHandlersSeq.current;
    setHandlers([]);
    try {
      const data = await apiJson('/admin/users/admissions-handlers');
      if (seq !== loadHandlersSeq.current) return;
      setHandlers(data.handlers || []);
    } catch (err) {
      if (seq !== loadHandlersSeq.current) return;
      setError(err.message || 'Unable to load admissions handlers.');
    }
  }, [apiJson]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadLogs();
      void loadHandlers();
    });
  }, [loadHandlers, loadLogs]);

  async function resetPassword(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setResetCredential([]);
    setResettingPassword(true);

    try {
      const data = await apiJson('/admin/users/reset-password', {
        method: 'POST',
        body: { email: resetEmail }
      });
      setResetCredential(data.credential ? [data.credential] : []);
      setSuccess('Temporary password issued successfully.');
      setResetEmail('');
      void loadLogs();
    } catch (err) {
      setError(err.message || 'Unable to reset password.');
    } finally {
      setResettingPassword(false);
    }
  }

  async function createHandler(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setHandlerCredential([]);
    setCreatingHandler(true);

    try {
      const data = await apiJson('/admin/users/admissions-handlers', {
        method: 'POST',
        body: {
          fullName: handlerForm.fullName.trim(),
          email: handlerForm.email.trim()
        }
      });
      setHandlers((prev) => [data.handler, ...prev]);
      setHandlerCredential(data.credential ? [data.credential] : []);
      setHandlerForm({ fullName: '', email: '' });
      setSuccess('Admissions dashboard handler assigned successfully.');
      void loadLogs();
    } catch (err) {
      setError(err.message || 'Unable to create admissions handler.');
    } finally {
      setCreatingHandler(false);
    }
  }

  async function deleteHandler(handlerId) {
    setError('');
    setSuccess('');
    setDeletingHandlerId(handlerId);

    try {
      await apiJson(`/admin/users/admissions-handlers/${handlerId}`, { method: 'DELETE' });

      setHandlers((prev) => prev.filter((item) => item.id !== handlerId));
      setSuccess('Admissions dashboard handler removed.');
      void loadLogs();
    } catch (err) {
      setError(err.message || 'Unable to remove admissions handler.');
    } finally {
      setDeletingHandlerId('');
    }
  }

  function renderDetails(details) {
    if (!details || typeof details !== 'object') return '';

    const parts = [];
    if (details.studentId) {
      parts.push(`student=${buildStudentCode({ id: details.studentId, institution: details.institution })}`);
    }
    if (details.userId) parts.push(`user=${details.userId}`);
    if (details.parentUserId) parts.push(`parent=${details.parentUserId}`);
    if (details.accountStatus) parts.push(`status=${details.accountStatus}`);
    if (details.delivery?.status) parts.push(`delivery=${details.delivery.status}`);

    return parts.join(' | ');
  }

  return (
    <PortalLayout
      role="admin"
      title="Security & Access Control"
      subtitle="Assign admissions dashboard handlers, reset passwords, and track security-relevant API events."
      actions={
        <button
          type="button"
          onClick={() => loadLogs()}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
        >
          Refresh
        </button>
      }
    >
      <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 lg:grid-cols-[1.1fr,0.9fr]">
        <form onSubmit={createHandler} className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <p className="text-sm font-semibold text-slate-800">Assign Admissions Dashboard Handler</p>
            <p className="mt-1 text-xs text-slate-600">Admin controls who can log in to the admissions dashboard and handle approvals.</p>
          </div>
          <input
            value={handlerForm.fullName}
            onChange={(e) => setHandlerForm((prev) => ({ ...prev, fullName: e.target.value }))}
            placeholder="Full name"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            required
          />
          <input
            type="email"
            value={handlerForm.email}
            onChange={(e) => setHandlerForm((prev) => ({ ...prev, email: e.target.value }))}
            placeholder="Email"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            required
          />
          <button
            type="submit"
            disabled={creatingHandler || !canCreateHandler}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 sm:col-span-2"
          >
            {creatingHandler ? 'Assigning...' : 'Assign Handler'}
          </button>
        </form>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-800">Current Admissions Handlers</p>
          <div className="mt-3 space-y-3">
            {handlers.map((handler) => (
              <div key={handler.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{handler.fullName}</p>
                  <p className="mt-1 text-xs text-slate-500">{handler.email}</p>
                </div>
                <button
                  type="button"
                  onClick={() => deleteHandler(handler.id)}
                  disabled={deletingHandlerId === handler.id}
                  className="rounded-md border border-red-300 px-3 py-2 text-xs font-semibold text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {deletingHandlerId === handler.id ? 'Removing...' : 'Remove'}
                </button>
              </div>
            ))}
            {!handlers.length && <p className="text-sm text-slate-500">No admissions handlers assigned yet.</p>}
          </div>
        </div>
      </section>

      <ProvisioningPanel
        title="Admissions dashboard login issued"
        description="Share this access only with staff assigned to review and approve admissions."
        records={handlerCredential}
      />

      <form onSubmit={resetPassword} className="grid gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:grid-cols-4">
        <div className="sm:col-span-4">
          <p className="text-sm font-semibold text-slate-800">Admin Password Reset</p>
          <p className="mt-1 text-xs text-slate-600">Enter a portal email to issue a new temporary password and force a password change on next login.</p>
        </div>
        <input
          type="email"
          value={resetEmail}
          onChange={(e) => setResetEmail(e.target.value)}
          placeholder="portal email"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-3"
          required
        />
        <button
          type="submit"
          disabled={resettingPassword || !canResetPassword}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {resettingPassword ? 'Resetting...' : 'Reset Password'}
        </button>
      </form>

      {success && <p className="mt-3 text-sm text-emerald-700">{success}</p>}
      <ProvisioningPanel
        title="Latest temporary password"
        description="If SMTP is configured, this password is also sent to the linked recipient email. Otherwise, share it manually."
        records={resetCredential}
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setFilters((prev) => {
            const next = { ...prev, search: String(prev.search || '').trim() };
            void loadLogs(next);
            return next;
          });
        }}
        className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-6"
      >
        <select
          value={filters.actorRole}
          onChange={(e) => setFilters((prev) => ({ ...prev, actorRole: e.target.value }))}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All Roles</option>
          {['admin', 'admissions', 'teacher', 'student', 'parent', 'anonymous', 'system'].map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>

        <select
          value={filters.method}
          onChange={(e) => setFilters((prev) => ({ ...prev, method: e.target.value }))}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All Methods</option>
          {['POST', 'PUT', 'PATCH', 'DELETE', 'SYSTEM'].map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>

        <select
          value={filters.statusCode}
          onChange={(e) => setFilters((prev) => ({ ...prev, statusCode: e.target.value }))}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All Status</option>
          {[200, 201, 204, 400, 401, 403, 404, 409, 429, 500].map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>

        <input
          value={filters.search}
          onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
          placeholder="Search email/path/action"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm lg:col-span-2"
        />

        <select
          value={filters.limit}
          onChange={(e) => setFilters((prev) => ({ ...prev, limit: Number(e.target.value) }))}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {[50, 100, 200, 500].map((item) => (
            <option key={item} value={item}>Limit {item}</option>
          ))}
        </select>

        <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white sm:col-span-2 lg:col-span-1">
          Apply
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          <span>Security logs table</span>
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
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Actor</th>
              <th className="px-3 py-2">Method</th>
              <th className="px-3 py-2">Path</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">IP</th>
            </tr>
          </thead>
          <tbody>
            {!showRows && (
              <tr>
                <td colSpan={7} className="px-3 py-3 text-slate-600 text-center">
                  Rows are hidden. Click “Show rows” to display logs.
                </td>
              </tr>
            )}
            {showRows && logs.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{new Date(row.timestamp).toLocaleString()}</td>
                <td className="px-3 py-2">
                  <div>{row.action}</div>
                  {renderDetails(row.details) && (
                    <div className="mt-1 text-xs text-slate-500">{renderDetails(row.details)}</div>
                  )}
                </td>
                <td className="px-3 py-2">{row.actorRole} ({row.actorEmail})</td>
                <td className="px-3 py-2">{row.method}</td>
                <td className="px-3 py-2">{row.path}</td>
                <td className="px-3 py-2">{row.statusCode}</td>
                <td className="px-3 py-2">{row.ip}</td>
              </tr>
            ))}
            {showRows && !logs.length && (
              <tr>
                <td colSpan={7} className="px-3 py-3 text-slate-600">No audit logs found for this filter.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </PortalLayout>
  );
}

export default AdminAuditLogs;
