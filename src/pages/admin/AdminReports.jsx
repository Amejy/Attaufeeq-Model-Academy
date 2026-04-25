import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import ErrorState from '../../components/ErrorState';
import PortalLayout from '../../components/PortalLayout';
import { ADMIN_INSTITUTIONS, institutionAccent } from '../../utils/adminInstitution';

function Metric({ label, value }) {
  return (
    <article className="dashboard-tile">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-primary">{value}</p>
    </article>
  );
}

function AdminReports() {
  const { apiFetch, apiJson } = useAuth();
  const [summary, setSummary] = useState(null);
  const [performance, setPerformance] = useState([]);
  const [performanceByClass, setPerformanceByClass] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState('');
  const [institution, setInstitution] = useState('');
  const [term, setTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAllPerformance, setShowAllPerformance] = useState(false);
  const loadDataSeq = useRef(0);
  const termLabel = term || 'All Terms';
  const institutionLabel = institution || 'All Institutions';
  const showTop3 = term === 'Third Term';
  const sessionLabel = sessions.length
    ? sessions.find((session) => session.id === sessionId)?.sessionName || 'Active Session'
    : 'No sessions';

  const loadData = useCallback(async (options = {}) => {
    const seq = ++loadDataSeq.current;
    const nextTerm = options.term ?? term;
    const nextInstitution = options.institution ?? institution;
    setError('');
    setLoading(true);
    setSessions([]);
    setSummary(null);
    setPerformance([]);
    setPerformanceByClass([]);
    try {
      const sessionsData = await apiJson('/results/sessions');
      if (seq !== loadDataSeq.current) return;
      const sessionRows = sessionsData.sessions || [];
      const active = sessionsData.activeSession || sessionRows.find((item) => item.isActive) || sessionRows[0] || null;
      const requestedSessionId = options.sessionId ?? sessionId;
      const resolvedSessionId =
        requestedSessionId && sessionRows.some((item) => item.id === requestedSessionId)
          ? requestedSessionId
          : active?.id || '';

      setSessions(sessionRows);
      setSessionId(resolvedSessionId);

      const params = new URLSearchParams();
      if (nextTerm) params.set('term', nextTerm);
      if (nextInstitution) params.set('institution', nextInstitution);
      if (resolvedSessionId) params.set('sessionId', resolvedSessionId);
      const query = params.toString() ? `?${params.toString()}` : '';
      const [summaryData, performanceData] = await Promise.all([
        apiJson(`/reports/admin/summary${query}`),
        apiJson(`/reports/admin/performance${query}`)
      ]);
      if (seq !== loadDataSeq.current) return;

      setSummary(summaryData);
      setPerformance(performanceData.rows || []);
      setPerformanceByClass(performanceData.grouped || []);
    } catch (err) {
      if (seq !== loadDataSeq.current) return;
      setError(err.message || 'Unable to load reports.');
    } finally {
      if (seq === loadDataSeq.current) {
        setLoading(false);
      }
    }
  }, [apiJson, institution, sessionId, term]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadData({ term: '', institution: '' });
    });
  }, [loadData]);

  async function downloadPerformanceCsv() {
    const params = new URLSearchParams();
    if (term) params.set('term', term);
    if (institution) params.set('institution', institution);
    if (sessionId) params.set('sessionId', sessionId);
    const query = params.toString() ? `?${params.toString()}` : '';
    const response = await apiFetch(`/reports/admin/performance.csv${query}`);
    if (!response.ok) {
      setError('Failed to download CSV report.');
      return;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'performance-report.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <PortalLayout
      role="admin"
      title="Admin Reports"
      subtitle="Performance is now broken down by class and institution, with the top 3 students surfaced for each class."
      actions={
        <div className="admin-toolbar">
          <label className="field-shell min-w-[12rem]">
            <span className="field-label">Session</span>
            <select
              value={sessionId}
              onChange={(e) => {
                const next = e.target.value;
                setSessionId(next);
                loadData({ sessionId: next });
              }}
              className="form-select"
            >
              {!sessions.length && <option value="">No sessions available</option>}
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.sessionName} {session.isActive ? '(Active)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="field-shell min-w-[11rem]">
            <span className="field-label">Term</span>
            <select
              value={term}
              onChange={(e) => {
                const next = e.target.value;
                setTerm(next);
                loadData({ term: next });
              }}
              className="form-select"
            >
              <option value="">All Terms</option>
              {['First Term', 'Second Term', 'Third Term'].map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="field-shell min-w-[14rem]">
            <span className="field-label">Institution</span>
            <select
              value={institution}
              onChange={(e) => {
                const next = e.target.value;
                setInstitution(next);
                loadData({ institution: next });
              }}
              className="form-select"
            >
              <option value="">All Institutions</option>
              {ADMIN_INSTITUTIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={downloadPerformanceCsv}
            disabled={loading || !sessionId}
            className="interactive-button"
          >
            Download CSV
          </button>
        </div>
      }
    >
      {error && <ErrorState compact title="Unable to load reports" message={error} onRetry={() => loadData()} className="mb-4" />}
      {loading && <div className="status-banner mb-4">Loading reports...</div>}
      <p className="admin-toolbar__meta mb-4">
        Scope: <span className="font-semibold text-slate-900">{institutionLabel}</span> • <span className="font-semibold text-slate-900">{termLabel}</span> • <span className="font-semibold text-slate-900">{sessionLabel}</span>
      </p>

      {summary && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Students" value={summary.metrics.totalStudents} />
            <Metric label="Teachers" value={summary.metrics.totalTeachers} />
            <Metric label={`Outstanding Fees (${termLabel})`} value={`NGN ${summary.metrics.outstandingFees}`} />
            <Metric label={`Fully Admitted (${institutionLabel})`} value={summary.metrics.totalAdmissions} />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {(summary.institutionSummary || []).map((row) => (
              <section key={row.institution} className="admin-surface">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-heading text-2xl text-primary">{row.institution}</h2>
                    <p className="mt-2 text-sm text-slate-600">Institution-level report snapshot for admin oversight.</p>
                  </div>
                  <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${institutionAccent(row.institution)}`}>
                    Institution Report
                  </span>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <Metric label="Students" value={row.students} />
                  <Metric label="Teachers" value={row.teachers} />
                  <Metric label="Classes" value={row.classes} />
                  <Metric label="Fully Admitted" value={row.admissions} />
                </div>
              </section>
            ))}
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <section className="admin-surface">
              <h2 className="font-heading text-xl text-primary">Admissions by Status</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {summary.admissionsByStatus.map((row) => (
                  <li key={row.status} className="flex items-center justify-between">
                    <span className="capitalize">{row.status}</span>
                    <span className="font-semibold">{row.count}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="admin-surface">
              <h2 className="font-heading text-xl text-primary">Students by Institution</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {summary.studentsByInstitution.map((row) => (
                  <li key={row.institution} className="flex items-center justify-between">
                    <span>{row.institution}</span>
                    <span className="font-semibold">{row.count}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="admin-surface">
              <h2 className="font-heading text-xl text-primary">Grade Distribution</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {summary.gradeDistribution.map((row) => (
                  <li key={row.grade} className="flex items-center justify-between">
                    <span>Grade {row.grade}</span>
                    <span className="font-semibold">{row.count}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </>
      )}

      <section className="admin-surface mt-6">
        <h2 className="font-heading text-2xl text-primary">Top 3 Students Per Class</h2>
        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          {!showTop3 && (
            <p className="status-banner status-banner--warning">
              Top 3 rankings are only available after Third Term.
            </p>
          )}
          {showTop3 && performanceByClass.map((group) => (
            <article key={`${group.institution}-${group.classId}`} className="dashboard-tile">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{group.classLabel}</h3>
                  <p className={`mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${institutionAccent(group.institution)}`}>
                    {group.institution}
                  </p>
                </div>
              </div>

              <div className="data-table-shell mt-4">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left">
                    <tr>
                      <th className="px-4 py-3">Rank</th>
                      <th className="px-4 py-3">Student</th>
                      <th className="px-4 py-3">Average</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((row, index) => (
                      <tr key={row.studentId} className="border-t border-slate-100">
                        <td className="px-4 py-3 font-semibold text-slate-900">{index + 1}</td>
                        <td className="px-4 py-3">{row.studentName}</td>
                        <td className="px-4 py-3">{row.average}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          ))}
          {showTop3 && !performanceByClass.length && (
            <p className="empty-state-inline">No class-based performance data available for the selected term.</p>
          )}
        </div>
      </section>

      <section className="admin-surface mt-6">
        <div className="admin-toolbar">
          <h2 className="font-heading text-xl text-primary">All Performance Rows</h2>
          <button
            type="button"
            onClick={() => setShowAllPerformance((prev) => !prev)}
            className="interactive-button"
          >
            {showAllPerformance ? 'Hide Rows' : 'Show Rows'}
          </button>
        </div>
        {showAllPerformance && (
          <div className="data-table-shell mt-3">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2">Student</th>
                  <th className="px-3 py-2">Institution</th>
                  <th className="px-3 py-2">Class</th>
                  <th className="px-3 py-2">Average</th>
                </tr>
              </thead>
              <tbody>
                {performance.map((row) => (
                  <tr key={row.studentId} className="border-t border-slate-100">
                    <td className="px-3 py-2">{row.studentName}</td>
                    <td className="px-3 py-2">{row.institution}</td>
                    <td className="px-3 py-2">{row.classLabel || row.classId}</td>
                    <td className="px-3 py-2">{row.average}</td>
                  </tr>
                ))}
                {!performance.length && (
                  <tr>
                    <td colSpan={4} className="px-3 py-3 text-slate-600">No data available for the selected filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </PortalLayout>
  );
}

export default AdminReports;
