import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import PortalLayout from '../../components/PortalLayout';
import ChildScopePanel from '../../components/ChildScopePanel';
import useParentChildSelection from '../../hooks/useParentChildSelection';

function RoleFeeStatus({ role }) {
  const { apiJson, user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [children, setChildren] = useState([]);
  const [child, setChild] = useState(null);
  const [selectedChildId, setSelectedChildId] = useParentChildSelection(role, user);
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState('');
  const [term, setTerm] = useState('First Term');
  const [error, setError] = useState('');

  useEffect(() => {
    if (role === 'parent') {
      setTerm('First Term');
    }
  }, [role, selectedChildId]);

  useEffect(() => {
    let isCurrent = true;

    async function loadSessions() {
      try {
        setSessions([]);
        const data = await apiJson('/results/sessions');
        if (!isCurrent) return;
        const sessionRows = data.sessions || [];
        const activeSession = data.activeSession || sessionRows.find((item) => item.isActive) || sessionRows[0] || null;
        setSessions(sessionRows);
        setSessionId((prev) =>
          prev && sessionRows.some((session) => session.id === prev)
            ? prev
            : activeSession?.id || ''
        );
      } catch (err) {
        if (!isCurrent) return;
        setError(err.message || 'Unable to load fee status.');
      }
    }

    loadSessions();
    return () => {
      isCurrent = false;
    };
  }, [apiJson]);

  useEffect(() => {
    let isCurrent = true;

    async function load() {
      setLoading(true);
      setError('');
      setSummary(null);
      setChild(null);
      setChildren([]);
      try {
        const params = new URLSearchParams();
        params.set('term', term);
        if (sessionId) {
          params.set('sessionId', sessionId);
        }
        if (role === 'parent' && selectedChildId) {
          params.set('childId', selectedChildId);
        }
        const query = params.toString() ? `?${params.toString()}` : '';
        const data = await apiJson(`/fees/${role}${query}`);
        if (!isCurrent) return;
        setSummary(data.summary || null);
        setChildren(data.children || []);
        setChild(data.child || data.student || null);
        if (role === 'parent' && data.child?.id && data.child.id !== selectedChildId) {
          setSelectedChildId(data.child.id);
        }
      } catch (err) {
        if (!isCurrent) return;
        setError(err.message || 'Unable to load fee status.');
      } finally {
        if (isCurrent) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      isCurrent = false;
    };
  }, [role, apiJson, selectedChildId, sessionId, term, setSelectedChildId]);

  return (
    <PortalLayout
      role={role}
      title={role === 'student' ? 'My Fee Status' : 'Child Fee Status'}
      subtitle="Track total fee plan, paid amount, and outstanding balance."
    >
      {role === 'parent' && (
        <ChildScopePanel
          children={children}
          activeChildId={selectedChildId}
          onChange={setSelectedChildId}
          heading="Fee Scope"
          description="Fee balances now follow the active child exactly, with no mixed records from another student."
        />
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <select
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm sm:w-auto"
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
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm sm:w-auto"
        >
          {['First Term', 'Second Term', 'Third Term'].map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
      </div>
      {loading && <p className="mt-4 text-sm text-slate-600">Loading fee status...</p>}
      {!loading && !sessionId && (
        <p className="mt-4 text-sm text-amber-700">No academic session is active yet. Fee status will appear once a session is created.</p>
      )}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {child && (
        <p className="mt-4 text-sm text-slate-600">
          Profile: <span className="font-semibold text-slate-900">{child.fullName}</span>{' '}
          {child.classLabel ? `• ${child.classLabel}` : ''}
        </p>
      )}

      {summary && (
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <article className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase text-slate-500">Total Plan ({term})</p>
            <p className="mt-2 text-2xl font-bold text-primary">NGN {summary.totalPlan}</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase text-slate-500">Total Paid ({term})</p>
            <p className="mt-2 text-2xl font-bold text-primary">NGN {summary.totalPaid}</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase text-slate-500">Balance ({term})</p>
            <p className="mt-2 text-2xl font-bold text-primary">NGN {summary.balance}</p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Status</p>
            <span
              className={`mt-1 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                summary.balance <= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
              }`}
            >
              {summary.balance <= 0 ? 'Paid in full' : 'Outstanding'}
            </span>
          </article>
        </div>
      )}
    </PortalLayout>
  );
}

export default RoleFeeStatus;
