import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PortalLayout from '../../components/PortalLayout';
import { useAuth } from '../../context/AuthContext';
import { ADMIN_INSTITUTIONS, canonicalInstitution } from '../../utils/adminInstitution';
import { buildStudentCode } from '../../utils/studentCode';
import useDebouncedValue from '../../hooks/useDebouncedValue';

const TERM_OPTIONS = ['First Term', 'Second Term', 'Third Term'];

function nextSessionName(value = '') {
  const match = String(value).match(/(\d{4})\s*\/\s*(\d{4})/);
  if (!match) return '';
  const start = Number(match[1]) + 1;
  const end = Number(match[2]) + 1;
  return `${start}/${end}`;
}

function isSessionRolloverTerm(term = '') {
  return term === 'Third Term';
}

function AdminPromotions() {
  const { apiJson } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [sessionId, setSessionId] = useState('');
  const [institution, setInstitution] = useState(ADMIN_INSTITUTIONS[0]);
  const [term, setTerm] = useState('Third Term');
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState('');
  const [toSessionName, setToSessionName] = useState('');
  const [sessionNameTouched, setSessionNameTouched] = useState(false);
  const [preview, setPreview] = useState({ eligible: [], graduated: [], skipped: [], promotionMap: [] });
  const [clearedSections, setClearedSections] = useState({ eligible: false, repeated: false, graduated: false });
  const [batches, setBatches] = useState([]);
  const [decisions, setDecisions] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [decisionFilter, setDecisionFilter] = useState('all');
  const [showRowsBySection, setShowRowsBySection] = useState(() => ({}));
  const resolveShowRows = (key) => showRowsBySection[key] !== false;
  const loadSessionsSeq = useRef(0);
  const loadClassesSeq = useRef(0);
  const loadPreviewSeq = useRef(0);
  const loadBatchesSeq = useRef(0);
  const initSeq = useRef(0);
  const debouncedSearch = useDebouncedValue(search.trim(), 300);

  const loadSessions = useCallback(async (preferredSessionId = '') => {
    const seq = ++loadSessionsSeq.current;
    setSessions([]);
    setActiveSession(null);
    const payload = await apiJson('/admin/academic-sessions');
    if (seq !== loadSessionsSeq.current) {
      return { sessionsData: [], active: null, resolvedSessionId: '' };
    }
    const sessionsData = payload.sessions || [];
    const active = payload.activeSession || sessionsData.find((item) => item.isActive) || sessionsData[0] || null;
    const resolvedSessionId =
      preferredSessionId && sessionsData.some((item) => item.id === preferredSessionId)
        ? preferredSessionId
        : active?.id || '';
    setSessions(sessionsData);
    setActiveSession(active);
    setSessionId(resolvedSessionId);
    return { sessionsData, active, resolvedSessionId };
  }, [apiJson]);

  const loadClasses = useCallback(async () => {
    const seq = ++loadClassesSeq.current;
    setClasses([]);
    const payload = await apiJson('/admin/classes');
    if (seq !== loadClassesSeq.current) return;
    setClasses(payload.classes || []);
  }, [apiJson]);

  const loadPreview = useCallback(async (
    targetSessionId = sessionId,
    targetInstitution = institution,
    targetTerm = term,
    targetClassId = classId
  ) => {
    const seq = ++loadPreviewSeq.current;
    setPreview({ eligible: [], graduated: [], skipped: [], promotionMap: [] });
    setClearedSections({ eligible: false, repeated: false, graduated: false });
    setDecisions({});
    if (!targetSessionId) return;
    const queryParams = new URLSearchParams({
      sessionId: targetSessionId,
      institution: targetInstitution,
      term: targetTerm
    });
    if (targetClassId) queryParams.append('classId', targetClassId);
    const query = queryParams.toString();
    const payload = await apiJson(`/admin/promotions/preview?${query}`);
    if (seq !== loadPreviewSeq.current) return;
    setPreview({
      eligible: payload.eligible || [],
      graduated: payload.graduated || [],
      skipped: payload.skipped || [],
      promotionMap: payload.promotionMap || [],
      canPromote: payload.canPromote
    });
    setClearedSections({ eligible: false, repeated: false, graduated: false });
  }, [apiJson, classId, institution, sessionId, term]);

  const loadBatches = useCallback(async () => {
    const seq = ++loadBatchesSeq.current;
    setBatches([]);
    const payload = await apiJson('/admin/promotions/batches');
    if (seq !== loadBatchesSeq.current) return;
    setBatches(payload.batches || []);
  }, [apiJson]);

  useEffect(() => {
    async function init() {
      const seq = ++initSeq.current;
      const initialInstitution = ADMIN_INSTITUTIONS[0];
      const initialTerm = 'Third Term';
      const initialClassId = '';
      setLoading(true);
      setError('');
      setMessage('');
      try {
        const { resolvedSessionId } = await loadSessions('');
        await loadClasses();
        await Promise.all([
          loadPreview(resolvedSessionId, initialInstitution, initialTerm, initialClassId),
          loadBatches()
        ]);
      } catch (err) {
        if (seq !== initSeq.current) return;
        setError(err.message || 'Unable to load promotion data.');
      } finally {
        if (seq === initSeq.current) {
          setLoading(false);
        }
      }
    }

    void init();
  }, [loadBatches, loadClasses, loadPreview, loadSessions]);

  useEffect(() => {
    let active = true;

    async function refreshPreview() {
      if (!sessionId) return;
      try {
        await loadPreview(sessionId, institution, term, classId);
      } catch (err) {
        if (!active) return;
        setError(err.message || 'Unable to load promotion data.');
      }
    }

    refreshPreview().catch((err) => {
      if (!active) return;
      setError(err.message || 'Unable to refresh preview.');
    });

    return () => {
      active = false;
    };
  }, [classId, institution, loadPreview, sessionId, term]);

  useEffect(() => {
    setDecisions((prev) => {
      const next = {};
      (preview.eligible || []).forEach((row) => {
        const recommended = row.recommendation?.action === 'repeat' ? 'repeat' : 'promote';
        next[row.studentId] = prev[row.studentId] || recommended;
      });
      return next;
    });
  }, [preview.eligible]);

  const eligibleRows = clearedSections.eligible ? [] : (preview.eligible || []);
  const filteredClasses = useMemo(
    () => classes.filter((item) => canonicalInstitution(item.institution) === canonicalInstitution(institution)),
    [classes, institution]
  );
  const repeatedRows = useMemo(
    () => (clearedSections.repeated ? [] : (preview.eligible || []).filter((row) => decisions[row.studentId] === 'repeat')),
    [preview, decisions, clearedSections.repeated]
  );
  const graduatedRows = clearedSections.graduated ? [] : (preview.graduated || []);
  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === sessionId) || activeSession || null,
    [activeSession, sessionId, sessions]
  );
  const suggestedSessionName = useMemo(
    () => nextSessionName(selectedSession?.sessionName),
    [selectedSession]
  );
  const requiresSessionRollover = isSessionRolloverTerm(term);

  const summary = useMemo(() => ({
    eligible: eligibleRows.length,
    graduated: graduatedRows.length,
    skipped: preview.skipped?.length || 0,
    repeated: repeatedRows.length
  }), [eligibleRows.length, graduatedRows.length, preview.skipped, repeatedRows.length]);
  const actionableCount = summary.eligible + summary.repeated + summary.graduated;
  const canRunPromotion = Boolean(
    sessionId &&
    actionableCount > 0 &&
    preview.canPromote &&
    (!requiresSessionRollover || toSessionName.trim())
  );
  const filteredEligibleRows = useMemo(() => {
    const query = debouncedSearch.toLowerCase();
    return eligibleRows.filter((row) => {
      const decision = decisions[row.studentId] || 'promote';
      const matchesDecision = decisionFilter === 'all' ? true : decision === decisionFilter;
      const matchesClass = classId ? row.classId === classId : true;
      const searchable = `${row.fullName} ${buildStudentCode(row)} ${row.classLabel} ${row.nextClassLabel || ''} ${row.nextStepLabel || ''}`.toLowerCase();
      const matchesSearch = !query || searchable.includes(query);
      return matchesDecision && matchesSearch && matchesClass;
    });
  }, [classId, debouncedSearch, decisionFilter, decisions, eligibleRows]);
  const filteredRepeatedRows = useMemo(() => {
    const query = debouncedSearch.toLowerCase();
    return repeatedRows.filter((row) => {
      const matchesClass = classId ? row.classId === classId : true;
      const searchable = `${row.fullName} ${buildStudentCode(row)} ${row.classLabel}`.toLowerCase();
      return matchesClass && (!query || searchable.includes(query));
    });
  }, [classId, debouncedSearch, repeatedRows]);
  const filteredGraduatedRows = useMemo(() => {
    const query = debouncedSearch.toLowerCase();
    return graduatedRows.filter((row) => {
      const matchesClass = classId ? row.classId === classId : true;
      const searchable = `${row.fullName} ${buildStudentCode(row)} ${row.classLabel}`.toLowerCase();
      return matchesClass && (!query || searchable.includes(query));
    });
  }, [classId, debouncedSearch, graduatedRows]);

  useEffect(() => {
    if (!suggestedSessionName) return;
    if (!sessionNameTouched || !toSessionName.trim()) {
      setToSessionName(suggestedSessionName);
    }
  }, [sessionNameTouched, suggestedSessionName, toSessionName]);

  async function handlePromote() {
    setSubmitting(true);
    setError('');
    setMessage('');

    try {
      if (requiresSessionRollover && !toSessionName.trim()) {
        throw new Error('New session name is required.');
      }
      const payload = await apiJson('/admin/academic-sessions/rollover', {
        method: 'POST',
        body: {
          institution,
          classId,
          term,
          toSessionName: requiresSessionRollover ? toSessionName.trim() : '',
          fromSessionId: sessionId,
          activateNewSession: requiresSessionRollover,
          studentDecisions: Object.entries(decisions).map(([studentId, action]) => ({
            studentId,
            action
          }))
        }
      });

      setMessage(
        requiresSessionRollover
          ? `Class promotion completed. ${payload.promotedCount} moved forward, ${payload.repeatedCount || 0} marked to repeat, ${payload.graduatedCount} graduated${classId ? ' in the selected class' : ''}.`
          : `Term promotion completed. ${payload.promotedCount} moved to the next term and ${payload.repeatedCount || 0} were marked to repeat${classId ? ' in the selected class' : ''}.`
      );
      setSessionNameTouched(false);
      await loadSessions();
      await loadPreview(sessionId, institution, term, classId);
      await loadBatches();
    } catch (err) {
      setError(err.message || 'Unable to promote students.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleClearBatches() {
    const confirmed = window.confirm('Clear all promotion history entries? This does not affect student records.');
    if (!confirmed) return;
    setClearing(true);
    setError('');
    setMessage('');

    try {
      await apiJson('/admin/promotions/batches', { method: 'DELETE' });

      setBatches([]);
      setMessage('Promotion history cleared.');
    } catch (err) {
      setError(err.message || 'Unable to clear promotion history.');
    } finally {
      setClearing(false);
    }
  }

  return (
    <PortalLayout
      role="admin"
      title="Promotion & Session Rollover"
      subtitle="Review each student, move approved students into the next term when results are ready, and roll the school into a new session after Third Term."
    >
      {loading && <p className="text-sm text-slate-600">Loading promotion data...</p>}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {message && <p className="mt-3 text-sm text-emerald-700">{message}</p>}

      <div className="mt-6 grid gap-4 lg:grid-cols-4">
        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Active Session</p>
          <p className="mt-3 text-2xl font-semibold text-slate-900">{activeSession?.sessionName || 'Not set'}</p>
          <p className="mt-2 text-xs text-slate-500">Use this as the source for promotions.</p>
        </article>
        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Eligible Students</p>
          <p className="mt-3 text-2xl font-semibold text-slate-900">{summary.eligible}</p>
          <p className="mt-2 text-xs text-slate-500">Students ready for the next approved step.</p>
        </article>
        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Graduations</p>
          <p className="mt-3 text-2xl font-semibold text-slate-900">{summary.graduated}</p>
          <p className="mt-2 text-xs text-slate-500">Students who must finish and register again for the next portal.</p>
        </article>
        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Repeats</p>
          <p className="mt-3 text-2xl font-semibold text-slate-900">{summary.repeated}</p>
          <p className="mt-2 text-xs text-slate-500">Students flagged to remain where they are.</p>
        </article>
      </div>

      <section className="mt-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Source Session</p>
            <select
              value={sessionId}
              onChange={(event) => setSessionId(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm"
            >
              {!sessions.length && <option value="">No sessions available</option>}
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.sessionName} {session.isActive ? '(Active)' : ''}
                </option>
              ))}
              </select>
            </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Institution</p>
            <select
              value={institution}
              onChange={(event) => {
                setInstitution(event.target.value);
                setClassId('');
              }}
              className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm"
            >
              {ADMIN_INSTITUTIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Term</p>
            <select
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm"
            >
              {TERM_OPTIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-slate-500">
              {requiresSessionRollover
                ? 'Third Term promotion moves students into the next class and can open a new session.'
                : `This promotion moves approved students into ${term === 'First Term' ? 'Second Term' : 'Third Term'}.`}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Class Filter</p>
            <select
              value={classId}
              onChange={(event) => setClassId(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm"
            >
              <option value="">All Classes</option>
              {filteredClasses.map((classItem) => (
                <option key={classItem.id} value={classItem.id}>
                  {classItem.name} {classItem.arm} • {classItem.institution}
                </option>
              ))}
            </select>
          </div>
          {requiresSessionRollover && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">New Session Name</p>
              <input
                value={toSessionName}
                onChange={(event) => {
                  setSessionNameTouched(true);
                  setToSessionName(event.target.value);
                }}
                placeholder="2026/2027"
                className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm"
              />
            </div>
          )}
          <div className="flex items-end">
            <button
              type="button"
              onClick={handlePromote}
              disabled={submitting || !canRunPromotion}
              className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Saving...' : requiresSessionRollover ? 'Run Class Promotion' : 'Run Term Promotion'}
            </button>
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search student name or code"
            className="rounded-2xl border border-slate-300 px-4 py-3 text-sm"
          />
          <select
            value={decisionFilter}
            onChange={(event) => setDecisionFilter(event.target.value)}
            className="rounded-2xl border border-slate-300 px-4 py-3 text-sm"
          >
            <option value="all">All Decisions</option>
            <option value="promote">Promote</option>
            <option value="repeat">Repeat</option>
          </select>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Search applies to eligible, repeated, and graduated lists.
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-2xl text-primary">Eligible Students</h2>
            <p className="mt-2 text-sm text-slate-600">
              {requiresSessionRollover
                ? 'These students are lined up for the next class or graduation point.'
                : 'These students are ready to move into the next term once you confirm the list.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              {summary.eligible} students
            </span>
            <button
              type="button"
              onClick={() => setClearedSections((prev) => ({ ...prev, eligible: true }))}
              disabled={!eligibleRows.length}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Clear List
            </button>
          </div>
        </div>
        <div className="mt-4 overflow-x-auto rounded-3xl border border-slate-200">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            <span>Eligible table</span>
            <button
              type="button"
              onClick={() => {
                const nextValue = !resolveShowRows('eligible');
                setShowRowsBySection((prev) => ({ ...prev, eligible: nextValue }));
              }}
              className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
            >
              {resolveShowRows('eligible') ? 'Hide rows' : 'Show rows'}
            </button>
          </div>
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Current Class</th>
                <th className="px-4 py-3">Next Class</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Recommendation</th>
                <th className="px-4 py-3">Parent Email</th>
              </tr>
            </thead>
            <tbody>
              {!resolveShowRows('eligible') && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                    Rows are hidden. Click “Show rows” to display eligible students.
                  </td>
                </tr>
              )}
              {resolveShowRows('eligible') && filteredEligibleRows.map((row) => (
                <tr key={row.studentId} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-800">{row.fullName}</p>
                    <p className="text-xs text-slate-500">{buildStudentCode(row)}</p>
                  </td>
                  <td className="px-4 py-3">{row.classLabel}</td>
                  <td className="px-4 py-3">{row.nextStepLabel || row.nextClassLabel}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-3 text-xs text-slate-700">
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={(decisions[row.studentId] || 'promote') === 'promote'}
                          onChange={() => setDecisions((prev) => ({ ...prev, [row.studentId]: 'promote' }))}
                        />
                        Promote
                      </label>
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={decisions[row.studentId] === 'repeat'}
                          onChange={() => setDecisions((prev) => ({ ...prev, [row.studentId]: 'repeat' }))}
                        />
                        Repeat
                      </label>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {row.recommendation
                      ? `${row.recommendation.action || 'promote'}${row.recommendation.teacherName ? ` • ${row.recommendation.teacherName}` : ''}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">{row.parentEmail || '—'}</td>
                </tr>
              ))}
              {resolveShowRows('eligible') && !filteredEligibleRows.length && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                    No eligible students found for this session.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-2xl text-primary">Repeated Students</h2>
            <p className="mt-2 text-sm text-slate-600">
              {requiresSessionRollover
                ? 'These students will stay in the same class in the new session.'
                : 'These students will remain in the same term and class for now.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
              {summary.repeated} students
            </span>
            <button
              type="button"
              onClick={() => setClearedSections((prev) => ({ ...prev, repeated: true }))}
              disabled={!repeatedRows.length}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Clear List
            </button>
          </div>
        </div>
        <div className="mt-4 overflow-x-auto rounded-3xl border border-slate-200">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            <span>Repeated table</span>
            <button
              type="button"
              onClick={() => {
                const nextValue = !resolveShowRows('repeated');
                setShowRowsBySection((prev) => ({ ...prev, repeated: nextValue }));
              }}
              className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
            >
              {resolveShowRows('repeated') ? 'Hide rows' : 'Show rows'}
            </button>
          </div>
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Class</th>
                <th className="px-4 py-3">Parent Email</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {!resolveShowRows('repeated') && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                    Rows are hidden. Click “Show rows” to display repeated students.
                  </td>
                </tr>
              )}
              {resolveShowRows('repeated') && filteredRepeatedRows.map((row) => (
                <tr key={row.studentId} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-800">{row.fullName}</p>
                    <p className="text-xs text-slate-500">{buildStudentCode(row)}</p>
                  </td>
                  <td className="px-4 py-3">{row.classLabel}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{row.parentEmail || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-3 text-xs text-slate-700">
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={(decisions[row.studentId] || 'repeat') === 'repeat'}
                          onChange={() => setDecisions((prev) => ({ ...prev, [row.studentId]: 'repeat' }))}
                        />
                        Repeat
                      </label>
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={decisions[row.studentId] === 'promote'}
                          onChange={() => setDecisions((prev) => ({ ...prev, [row.studentId]: 'promote' }))}
                        />
                        Promote
                      </label>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      Current: {decisions[row.studentId] === 'promote' ? 'Promote' : 'Repeat'}
                    </p>
                  </td>
                </tr>
              ))}
              {resolveShowRows('repeated') && !filteredRepeatedRows.length && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                    No students are marked as repeat in this preview.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-2xl text-primary">Graduated Students</h2>
            <p className="mt-2 text-sm text-slate-600">Students at the highest level are marked as graduated and retained in history.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
              {summary.graduated} graduates
            </span>
            <button
              type="button"
              onClick={() => setClearedSections((prev) => ({ ...prev, graduated: true }))}
              disabled={!graduatedRows.length}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Clear List
            </button>
          </div>
        </div>
        <div className="mt-4 overflow-x-auto rounded-3xl border border-slate-200">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            <span>Graduated table</span>
            <button
              type="button"
              onClick={() => {
                const nextValue = !resolveShowRows('graduated');
                setShowRowsBySection((prev) => ({ ...prev, graduated: nextValue }));
              }}
              className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
            >
              {resolveShowRows('graduated') ? 'Hide rows' : 'Show rows'}
            </button>
          </div>
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Final Class</th>
                <th className="px-4 py-3">Institution</th>
                <th className="px-4 py-3">Parent Email</th>
              </tr>
            </thead>
            <tbody>
              {!resolveShowRows('graduated') && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                    Rows are hidden. Click “Show rows” to display graduated students.
                  </td>
                </tr>
              )}
              {resolveShowRows('graduated') && filteredGraduatedRows.map((row) => (
                <tr key={row.studentId} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-800">{row.fullName}</p>
                    <p className="text-xs text-slate-500">{buildStudentCode(row)}</p>
                  </td>
                  <td className="px-4 py-3">{row.classLabel}</td>
                  <td className="px-4 py-3">{row.institution}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{row.parentEmail || '—'}</td>
                </tr>
              ))}
              {resolveShowRows('graduated') && !filteredGraduatedRows.length && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                    No graduations detected in this session.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-2xl text-primary">Promotion History</h2>
            <p className="mt-2 text-sm text-slate-600">Every promotion batch is logged here for repeat verification.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
              {batches.length} batches
            </span>
            <button
              type="button"
              onClick={handleClearBatches}
              disabled={clearing || !batches.length}
              className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {clearing ? 'Clearing...' : 'Clear History'}
            </button>
            <button
              type="button"
              onClick={() => {
                const nextValue = !resolveShowRows('history');
                setShowRowsBySection((prev) => ({ ...prev, history: nextValue }));
              }}
              className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
            >
              {resolveShowRows('history') ? 'Hide rows' : 'Show rows'}
            </button>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {!resolveShowRows('history') && (
            <p className="text-sm text-slate-600">Rows are hidden. Click “Show rows” to display promotion history.</p>
          )}
          {resolveShowRows('history') && batches.map((batch) => (
            <article key={batch.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{batch.toSessionName}</p>
                  <p className="text-xs text-slate-500">{new Date(batch.createdAt).toLocaleString()}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">Promoted: {batch.promotedCount}</span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-600">Repeated: {batch.repeatedCount || 0}</span>
                  <span className="rounded-full bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-700">Graduated: {batch.graduatedCount}</span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-600">Skipped: {batch.skippedCount}</span>
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {batch.institution || 'All institutions'} • From {batch.fromSessionId} • Term {batch.term}
              </p>
            </article>
          ))}
          {resolveShowRows('history') && !batches.length && <p className="text-sm text-slate-600">No promotion batches recorded yet.</p>}
        </div>
      </section>
    </PortalLayout>
  );
}

export default AdminPromotions;
