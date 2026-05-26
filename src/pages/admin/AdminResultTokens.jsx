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
    return new Intl.DateTimeFormat('en-NG', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(new Date(value));
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
    <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${styles[status] || styles.unused}`}>
      {status}
    </span>
  );
}

function AdminResultTokens() {
  const { apiJson, apiFetch } = useAuth();
  const [tokens, setTokens] = useState([]);
  const [stats, setStats] = useState({ total: 0, used: 0, active: 0, expired: 0 });
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [quantity, setQuantity] = useState('10');
  const [tokenLength, setTokenLength] = useState('10');
  const [term, setTerm] = useState('First Term');
  const [expiresAt, setExpiresAt] = useState('');
  const [tokenSalesControl, setTokenSalesControl] = useState({ term: 'First Term', enabled: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingTokenSales, setUpdatingTokenSales] = useState(false);
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
      const sessionQuery = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}&term=${encodeURIComponent(term)}` : `?term=${encodeURIComponent(term)}`;
      const [tokenData, sessionData, controlData] = await Promise.all([
        apiJson(`/result-tokens/admin?${query.toString()}`),
        apiJson('/results/sessions'),
        apiJson(`/fees/admin/token-sales-control${sessionQuery}`)
      ]);
      setTokens(tokenData.tokens || []);
      setStats(tokenData.stats || { total: 0, used: 0, active: 0, expired: 0 });
      const sessionRows = sessionData.sessions || [];
      const activeSession = sessionData.activeSession || sessionRows.find((item) => item.isActive) || sessionRows[0] || null;
      setSessions(sessionRows);
      setSessionId((prev) =>
        prev && sessionRows.some((session) => session.id === prev)
          ? prev
          : activeSession?.id || ''
      );
      setTokenSalesControl(controlData.tokenSalesControl || { term, enabled: false });
    } catch (err) {
      setError(err.message || 'Unable to load result tokens.');
    } finally {
      setLoading(false);
    }
  }, [apiJson, search, sessionId, statusFilter, term]);

  useEffect(() => {
    loadTokens();
  }, [loadTokens]);

  async function updateTokenSalesControl(enabled) {
    setUpdatingTokenSales(true);
    setError('');
    setSuccess('');
    try {
      const data = await apiJson('/fees/admin/token-sales-control', {
        method: 'PUT',
        body: {
          sessionId,
          term,
          enabled
        }
      });
      setTokenSalesControl(data.tokenSalesControl || { term, enabled });
      setSuccess(enabled ? 'Token sales opened for this term.' : 'Token sales closed for this term.');
    } catch (err) {
      setError(err.message || 'Unable to update token sales control.');
    } finally {
      setUpdatingTokenSales(false);
    }
  }

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

  function printTokens() {
    const printableTokens = tokens.filter((token) => token.status !== 'used');
    if (!printableTokens.length) {
      setError('No printable tokens are available in this list yet.');
      setSuccess('');
      return;
    }

    const printWindow = window.open('', '_blank', 'width=960,height=720');
    if (!printWindow) {
      setError('Allow pop-ups to print token slips from this page.');
      setSuccess('');
      return;
    }

    const cards = printableTokens.map((token) => `
      <article class="card">
        <div class="card__top">
          <div class="card__brand">
            <img src="/images/logo.png" alt="ATTAUFEEQ Model Academy logo" class="card__logo" />
            <div>
            <p class="card__title">ATTAUFEEQ RESULT TOKEN</p>
            <p class="card__school">ATTAUFEEQ MODEL ACADEMY</p>
            </div>
          </div>
          <div class="card__secure">
            <p class="card__secure-title">Secure Token</p>
            <p class="card__secure-note">Keep this card safe</p>
          </div>
        </div>
        <div class="card__body">
          <p class="card__meta"><strong>Term:</strong> ${token.term || 'Any term'}</p>
          <p class="card__meta"><strong>Status:</strong> ${token.status}</p>
        </div>
        <div class="card__token-shell">
          <p class="card__hint">Scratch gently to reveal code</p>
          <p class="card__token">${token.token || token.tokenPreview || 'Token'}</p>
        </div>
        <div class="card__footer">
          <span>This is a secure token. Do not share it with anyone.</span>
        </div>
      </article>
    `).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Result Tokens</title>
          <style>
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; margin: 24px; color: #0f172a; background: #ffffff; }
            .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 18px; }
            .card {
              overflow: hidden;
              border-radius: 24px;
              border: 1px solid rgba(37, 99, 235, 0.18);
              background:
                radial-gradient(circle at 86% 26%, rgba(191, 219, 254, 0.24), transparent 25%),
                radial-gradient(circle at 18% 72%, rgba(226, 232, 240, 0.46), transparent 31%),
                linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.96));
              box-shadow: 0 20px 40px rgba(15, 23, 42, 0.12);
            }
            .card__top,
            .card__body,
            .card__token-shell,
            .card__footer {
              position: relative;
              z-index: 1;
            }
            .card__top {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              gap: 12px;
              padding: 18px 18px 0;
            }
            .card__brand {
              display: flex;
              align-items: center;
              gap: 14px;
              min-width: 0;
            }
            .card__logo {
              width: 56px;
              height: 56px;
              object-fit: contain;
              flex-shrink: 0;
            }
            .card__title {
              margin: 0;
              color: #0f2b5b;
              font-size: 24px;
              font-weight: 800;
              line-height: 1.05;
            }
            .card__school {
              margin: 8px 0 0;
              color: #5a7fb8;
              font-size: 12px;
              letter-spacing: 0.24em;
              text-transform: uppercase;
            }
            .card__secure {
              min-width: 165px;
              border-radius: 0 0 0 18px;
              background: linear-gradient(135deg, #08275b, #071a44);
              padding: 12px 14px;
              color: #fff;
            }
            .card__secure-title {
              margin: 0;
              font-size: 12px;
              font-weight: 800;
              text-transform: uppercase;
            }
            .card__secure-note {
              margin: 4px 0 0;
              font-size: 11px;
              color: rgba(255,255,255,0.86);
            }
            .card__body {
              padding: 16px 18px 0;
            }
            .card__meta {
              margin: 0 0 8px;
              font-size: 13px;
              color: #1f2937;
            }
            .card__hint {
              margin: 0 0 10px;
              color: #1d4f9c;
              font-size: 12px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.12em;
            }
            .card__token-shell {
              margin: 18px;
              border: 2px solid rgba(37, 99, 235, 0.78);
              border-radius: 18px;
              padding: 14px;
              background: linear-gradient(180deg, rgba(255,255,255,0.78), rgba(248,250,252,0.94));
            }
            .card__token {
              margin: 0;
              border-radius: 16px;
              border: 1px solid rgba(148, 163, 184, 0.62);
              background:
                linear-gradient(180deg, rgba(208, 214, 224, 0.96), rgba(156, 163, 175, 0.94)),
                repeating-linear-gradient(0deg, rgba(255,255,255,0.09) 0 2px, rgba(148,163,184,0.08) 2px 4px),
                repeating-linear-gradient(135deg, rgba(255,255,255,0.08) 0 14px, rgba(148,163,184,0.08) 14px 28px);
              padding: 18px 16px;
              color: #08275b;
              font-family: Georgia, serif;
              font-size: 28px;
              font-weight: 800;
              letter-spacing: 0.22em;
              text-align: center;
            }
            .card__footer {
              background: linear-gradient(135deg, #08275b, #071a44);
              padding: 14px 18px;
              color: rgba(255,255,255,0.95);
              font-size: 12px;
            }
          </style>
        </head>
        <body>
          <div class="grid">${cards}</div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    setSuccess(`Prepared ${printableTokens.length} token slips for printing.`);
    setError('');
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
      subtitle="Generate token slips in bulk, print them for sale, and track which ones have been used."
      actions={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={printTokens}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
          >
            Print Tokens
          </button>
          <button
            type="button"
            onClick={loadTokens}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
          >
            Refresh
          </button>
        </div>
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

      <section className="mt-6 rounded-[28px] border border-amber-200 bg-amber-50 p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-800">Token Sales Control</p>
            <h2 className="mt-2 font-heading text-2xl text-amber-950">Scratch Card Sales</h2>
            <p className="mt-2 text-sm text-amber-900">
              Open or close result-token sales here. Admissions will handle receipt review and token release from their own desk.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <select
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              className="rounded-2xl border border-amber-300 bg-white px-4 py-3 text-sm text-amber-950"
            >
              {!sessions.length && <option value="">No sessions available</option>}
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.sessionName} {session.isActive ? '(Active)' : ''}
                </option>
              ))}
            </select>
            <select
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              className="rounded-2xl border border-amber-300 bg-white px-4 py-3 text-sm text-amber-950"
            >
              {['First Term', 'Second Term', 'Third Term'].map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className={`rounded-full border px-3 py-2 text-xs font-semibold ${tokenSalesControl.enabled ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-300 bg-white text-amber-900'}`}>
            {tokenSalesControl.enabled ? `Open for ${tokenSalesControl.term || term}` : `Closed for ${tokenSalesControl.term || term}`}
          </span>
          <button
            type="button"
            onClick={() => updateTokenSalesControl(true)}
            disabled={updatingTokenSales || !sessionId}
            className="rounded-2xl border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {updatingTokenSales && tokenSalesControl.enabled ? 'Saving...' : 'Open Sales'}
          </button>
          <button
            type="button"
            onClick={() => updateTokenSalesControl(false)}
            disabled={updatingTokenSales || !sessionId}
            className="rounded-2xl border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {updatingTokenSales && !tokenSalesControl.enabled ? 'Saving...' : 'Close Sales'}
          </button>
        </div>
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
        <p className="mt-2 text-xs text-slate-500">Each token can be generated in bulk, printed, sold, and used once for the selected term.</p>
      </section>

      <section className="mt-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-2xl text-primary">Token Inventory</h2>
            <p className="mt-2 text-sm text-slate-600">Search, filter, print, and export token stock without assigning each one first.</p>
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
                <th className="px-4 py-3 whitespace-nowrap">Token</th>
                <th className="px-4 py-3 whitespace-nowrap">Status</th>
                <th className="px-4 py-3 whitespace-nowrap">Reserved For</th>
                <th className="px-4 py-3 whitespace-nowrap">Term</th>
                <th className="px-4 py-3 whitespace-nowrap">Usage</th>
                <th className="px-4 py-3 whitespace-nowrap">Created</th>
                <th className="px-4 py-3 whitespace-nowrap">Expires</th>
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
                  <td className="text-code-break px-4 py-3 font-semibold tracking-[0.08em] text-slate-800">{token.token}</td>
                  <td className="px-4 py-3"><StatusPill status={token.status} /></td>
                  <td className="text-code-break px-4 py-3 text-slate-700">{token.assignedStudentId || '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-700">{token.term || '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-700">{token.usedCount}/{token.maxUses} used</td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-700">{formatDate(token.createdAt)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-700">{formatDate(token.expiresAt)}</td>
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
