import { useCallback, useEffect, useMemo, useState } from 'react';
import PortalLayout from '../../components/PortalLayout';
import { useAuth } from '../../context/AuthContext';

const STATUS_OPTIONS = [
  { value: '', label: 'All Tokens' },
  { value: 'unused', label: 'Unused' },
  { value: 'used', label: 'Used' },
  { value: 'expired', label: 'Expired' }
];

function formatDate(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function StatusPill({ status }) {
  const styles = {
    unused: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    used: 'border-amber-200 bg-amber-50 text-amber-700',
    expired: 'border-slate-300 bg-slate-100 text-slate-600'
  };
  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${styles[status] || styles.unused}`}>
      {status}
    </span>
  );
}

function AdminResultTokens() {
  const { apiJson, apiFetch } = useAuth();
  const [tokens, setTokens] = useState([]);
  const [stats, setStats] = useState({ total: 0, used: 0, active: 0, expired: 0 });
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [quantity, setQuantity] = useState('10');
  const [tokenLength, setTokenLength] = useState('10');
  const [term, setTerm] = useState('First Term');
  const [expiresAt, setExpiresAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showRows, setShowRows] = useState(true);

  const loadTokens = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams();
      if (statusFilter) query.set('status', statusFilter);
      if (search.trim()) query.set('search', search.trim());
      const data = await apiJson(`/result-tokens/admin?${query.toString()}`);
      setTokens(data.tokens || []);
      setStats(data.stats || { total: 0, used: 0, active: 0, expired: 0 });
    } catch (err) {
      setError(err.message || 'Unable to load result tokens.');
    } finally {
      setLoading(false);
    }
  }, [apiJson, search, statusFilter]);

  useEffect(() => {
    loadTokens();
  }, [loadTokens]);

  async function generateTokens(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const data = await apiJson('/result-tokens/admin/generate', {
        method: 'POST',
        body: {
          quantity: Number(quantity || 0),
          length: Number(tokenLength || 10),
          term,
          expiresAt: expiresAt || ''
        }
      });
      setStats(data.stats || stats);
      setSuccess(`Generated ${data.tokens?.length || 0} tokens successfully.`);
      await loadTokens();
    } catch (err) {
      setError(err.message || 'Unable to generate tokens.');
    } finally {
      setSaving(false);
    }
  }

  async function exportTokens() {
    setError('');
    setSuccess('');
    try {
      const query = new URLSearchParams();
      if (statusFilter) query.set('status', statusFilter);
      if (search.trim()) query.set('search', search.trim());
      const response = await apiFetch(`/result-tokens/admin/export?${query.toString()}`, {
        method: 'GET'
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Unable to export tokens.');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'result-tokens.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setSuccess('Export ready. Downloading...');
    } catch (err) {
      setError(err.message || 'Unable to export tokens.');
    }
  }

  const hasTokens = tokens.length > 0;
  const summaryCards = useMemo(() => ([
    { label: 'Total Tokens', value: stats.total ?? 0 },
    { label: 'Used Tokens', value: stats.used ?? 0 },
    { label: 'Active Tokens', value: stats.active ?? 0 },
    { label: 'Expired Tokens', value: stats.expired ?? 0 }
  ]), [stats]);

  return (
    <PortalLayout
      role="admin"
      title="Result Token System"
      subtitle="Generate, track, and export term-specific result tokens (single-use)."
      actions={
        <button
          type="button"
          onClick={loadTokens}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
        >
          Refresh
        </button>
      }
    >
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <article key={card.label} className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{card.label}</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{card.value}</p>
          </article>
        ))}
      </section>

      <section className="mt-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-heading text-2xl text-primary">Generate Tokens</h2>
        <form onSubmit={generateTokens} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.1fr,1fr,1fr,1fr,1fr,auto]">
          <input
            type="number"
            min="1"
            max="5000"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="Quantity"
            className="rounded-2xl border border-slate-300 px-3 py-3 text-sm"
            required
          />
          <input
            type="number"
            min="8"
            max="16"
            value={tokenLength}
            onChange={(e) => setTokenLength(e.target.value)}
            placeholder="Token length"
            className="rounded-2xl border border-slate-300 px-3 py-3 text-sm"
            required
          />
          <select
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            className="rounded-2xl border border-slate-300 px-3 py-3 text-sm"
            required
          >
            {['First Term', 'Second Term', 'Third Term'].map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
          <input
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="rounded-2xl border border-slate-300 px-3 py-3 text-sm"
          />
          <button
            type="submit"
            disabled={saving}
            className="rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Generating...' : 'Generate Tokens'}
          </button>
        </form>
        <p className="mt-2 text-xs text-slate-500">Each token is valid for one student and one term only.</p>
      </section>

      <section className="mt-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-2xl text-primary">Token Inventory</h2>
            <p className="mt-2 text-sm text-slate-600">Search, filter, and export issued tokens.</p>
          </div>
          <button
            type="button"
            onClick={exportTokens}
            className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"
          >
            Export CSV
          </button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1.2fr,0.8fr]">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by token"
            className="rounded-2xl border border-slate-300 px-4 py-3 text-sm"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-2xl border border-slate-300 px-4 py-3 text-sm"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            <span>Token inventory table</span>
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
                <th className="px-4 py-3">Token</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Assigned</th>
                <th className="px-4 py-3">Term</th>
                <th className="px-4 py-3">Usage</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Expires</th>
              </tr>
            </thead>
            <tbody>
              {!showRows && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                    Rows are hidden. Click “Show rows” to display tokens.
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                    Loading tokens...
                  </td>
                </tr>
              )}
              {showRows && !loading && !hasTokens && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                    No tokens match this filter yet.
                  </td>
                </tr>
              )}
              {showRows && !loading && tokens.map((token) => (
                <tr key={token.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-semibold text-slate-800">{token.token}</td>
                  <td className="px-4 py-3"><StatusPill status={token.status} /></td>
                  <td className="px-4 py-3">{token.assignedStudentId || '—'}</td>
                  <td className="px-4 py-3">{token.term || '—'}</td>
                  <td className="px-4 py-3">{token.usedCount}/{token.maxUses} used</td>
                  <td className="px-4 py-3">{formatDate(token.createdAt)}</td>
                  <td className="px-4 py-3">{formatDate(token.expiresAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {success && <p className="mt-4 text-sm text-emerald-700">{success}</p>}
    </PortalLayout>
  );
}

export default AdminResultTokens;
