import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import PortalLayout from '../../components/PortalLayout';
import ReportCardSheet from '../../components/ReportCardSheet';
import ChildScopePanel from '../../components/ChildScopePanel';
import useParentChildSelection from '../../hooks/useParentChildSelection';
import { buildStudentCode } from '../../utils/studentCode';
import useDebouncedValue from '../../hooks/useDebouncedValue';

function RoleResults({ role }) {
  const { apiJson, user } = useAuth();
  const [payload, setPayload] = useState({});
  const [reportCard, setReportCard] = useState(null);
  const [finalResult, setFinalResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tokenError, setTokenError] = useState('');
  const [tokenSuccess, setTokenSuccess] = useState('');
  const [tokenValue, setTokenValue] = useState('');
  const [tokenBusy, setTokenBusy] = useState(false);
  const [reportInfo, setReportInfo] = useState('');
  const [term, setTerm] = useState('');
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState('');
  const [subjectSearch, setSubjectSearch] = useState('');
  const [selectedChildId, setSelectedChildId] = useParentChildSelection(role, user);
  const reportCardSeq = useRef(0);
  const holdReason = payload.holdReason || '';
  const holdStatus = payload.holdStatus || '';
  const debouncedSubjectSearch = useDebouncedValue(subjectSearch.trim(), 300);

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
        setError(err.message || 'Unable to load sessions.');
      }
    }

    loadSessions();
    return () => {
      isCurrent = false;
    };
  }, [apiJson]);

  useEffect(() => {
    let isCurrent = true;

    async function loadResults() {
      setLoading(true);
      setError('');
      setPayload({});
      setReportCard(null);
      setFinalResult(null);
      setReportInfo('');

      try {
        const params = new URLSearchParams();
        if (role === 'parent' && selectedChildId) params.set('childId', selectedChildId);
        if (sessionId) params.set('sessionId', sessionId);
        if (term) params.set('term', term);
        const query = params.toString() ? `?${params.toString()}` : '';
        const data = await apiJson(`/results/${role}${query}`);
        if (!isCurrent) return;
        setPayload(data);
        if (role === 'parent' && data.child?.id && data.child.id !== selectedChildId) {
          setSelectedChildId(data.child.id);
        }
      } catch (err) {
        if (!isCurrent) return;
        setError(err.message || 'Unable to load results.');
      } finally {
        if (isCurrent) {
          setLoading(false);
        }
      }
    }

    loadResults();
    return () => {
      isCurrent = false;
    };
  }, [role, apiJson, selectedChildId, sessionId, term, setSelectedChildId]);

  useEffect(() => {
    queueMicrotask(() => {
      reportCardSeq.current += 1;
      setReportCard(null);
      setFinalResult(null);
    });
  }, [selectedChildId, sessionId, term]);

  function buildReportCardFromFinal(finalResultData, studentInfo) {
    if (!finalResultData) return null;
    const subjects = finalResultData.subjects || [];
    return {
      student: studentInfo || {},
      classInfo: studentInfo?.classLabel
        ? { name: studentInfo.classLabel, arm: '' }
        : null,
      institution: studentInfo?.institution || '',
      term: finalResultData.term,
      sessionId: finalResultData.sessionId,
      generatedAt: finalResultData.approvedAt || new Date().toISOString(),
      totalSubjects: subjects.length,
      totalScore: finalResultData.totalScore,
      averageScore: finalResultData.averageScore,
      overallGrade: finalResultData.gradeSummary,
      classRank: null,
      classSize: null,
      attendance: reportCard?.attendance,
      behavior: reportCard?.behavior,
      publishState: 'Approved',
      rows: subjects.map((row, index) => ({
        id: row.id || `${row.subject}-${index}`,
        subjectName: row.subject,
        ca: '',
        exam: '',
        total: row.score,
        grade: row.grade,
        remark: ''
      }))
    };
  }

  async function loadReportCard() {
    const requestId = reportCardSeq.current + 1;
    reportCardSeq.current = requestId;
    setError('');
    if (loading) return;
    if (!term) {
      setError('Select a term to generate the report card.');
      return;
    }
    if (holdReason) {
      setError(holdReason);
      return;
    }
    try {
      const studentForCode = role === 'parent'
        ? (payload.child || reportCard?.student || null)
        : (payload.student || reportCard?.student || null);
      if (!studentForCode) {
        setError('Student data is missing for this report card.');
        return;
      }
      const studentCode = buildStudentCode(studentForCode || {});
      const params = new URLSearchParams();
      params.set('studentCode', studentCode);
      params.set('term', term);
      if (sessionId) params.set('sessionId', sessionId);
      const query = params.toString();
      const data = await apiJson(`/results/final?${query}`);
      if (reportCardSeq.current !== requestId) return;
      const finalResultData = data.finalResult || null;
      if (!finalResultData) {
        const reportEndpoint = role === 'parent'
          ? `/results/parent/report-card?${query}`
          : `/results/student/report-card?${query}`;
        const fallback = await apiJson(reportEndpoint);
        if (reportCardSeq.current !== requestId) return;
        if (fallback?.reportCard) {
          setFinalResult(null);
          setReportCard(fallback.reportCard);
          setReportInfo('');
          return;
        }
        setReportInfo('Report card will be available once the admin compiles the final result.');
        setReportCard(null);
        setFinalResult(null);
        return;
      }
      setFinalResult(finalResultData);
      const studentInfo = data.student || studentForCode || null;
      setReportCard(buildReportCardFromFinal(finalResultData, studentInfo));
    } catch (err) {
      if (reportCardSeq.current !== requestId) return;
      setError(err.message || 'Unable to load report card.');
    }
  }

  async function handleTokenActivation(event) {
    event.preventDefault();
    if (!tokenValue.trim()) {
      setTokenError('Enter the result token to continue.');
      return;
    }
    const studentForToken = role === 'parent'
      ? (payload.child || reportCard?.student || null)
      : (payload.student || reportCard?.student || null);
    if (!studentForToken) {
      setTokenError('Student information is missing.');
      return;
    }
    if (!term) {
      setTokenError('Select a term before using a token.');
      return;
    }
    setTokenError('');
    setTokenSuccess('');
    setTokenBusy(true);
    try {
      const studentIdentifier = buildStudentCode(studentForToken);
      const data = await apiJson('/result-tokens/check', {
        method: 'POST',
        body: {
          token: tokenValue.trim().toUpperCase(),
          studentIdentifier,
          term,
          sessionId
        }
      });
      setPayload(data || {});
      setReportCard(data.reportCard || null);
      setFinalResult(null);
      setTokenValue('');
      setTokenSuccess('Token accepted. Your results are now unlocked.');
      setError('');
    } catch (err) {
      setTokenError(err.message || 'Unable to verify token.');
    } finally {
      setTokenBusy(false);
    }
  }

  const children = payload.children || [];
  const child = payload.child || reportCard?.student || null;
  const subjects = payload.subjects || [];
  const studentForReport = role === 'parent'
    ? (payload.child || reportCard?.student || null)
    : (payload.student || reportCard?.student || null);
  const canGenerateReport = Boolean(studentForReport && term && !loading && !holdReason);
  const filteredReportCard = useMemo(() => {
    if (!reportCard) return null;
    const query = debouncedSubjectSearch.toLowerCase();
    if (!query) return reportCard;
    return {
      ...reportCard,
      rows: reportCard.rows.filter((row) => String(row.subjectName || '').toLowerCase().includes(query))
    };
  }, [debouncedSubjectSearch, reportCard]);

  return (
    <PortalLayout
      role={role}
      title={role === 'student' ? 'My Results' : 'Child Results'}
      subtitle={role === 'student' ? 'Published academic records for the active term and previous sessions.' : 'Every result view is tied to the linked child you selected.'}
    >
      {loading && <p className="mt-4 text-sm text-slate-600">Loading results...</p>}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {reportInfo && !error && (
        <p className="mt-4 text-sm text-amber-700">{reportInfo}</p>
      )}
      {holdReason && !error && (
        <p className="mt-4 text-sm text-amber-700">{holdReason}</p>
      )}
      {holdStatus === 'token-required' && !loading && (
        <form onSubmit={handleTokenActivation} className="mt-4 rounded-xl border border-amber-100 bg-amber-50/60 p-4">
          <p className="text-sm font-semibold text-amber-900">Enter result token</p>
          <p className="mt-1 text-xs text-amber-800">
            Use the token from the admission desk to unlock this term’s results.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-xs text-amber-900">
              <span className="mb-1 block font-semibold uppercase tracking-[0.2em]">Token</span>
              <input
                value={tokenValue}
                onChange={(event) => setTokenValue(event.target.value.toUpperCase())}
                className="w-64 rounded-md border border-amber-200 bg-white px-3 py-2 text-sm uppercase tracking-[0.2em]"
                placeholder="Enter token"
              />
            </label>
            <button
              type="submit"
              disabled={tokenBusy}
              className="rounded-full bg-amber-600 px-5 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {tokenBusy ? 'Checking...' : 'Activate'}
            </button>
          </div>
          {tokenError && <p className="mt-2 text-xs text-red-600">{tokenError}</p>}
          {tokenSuccess && <p className="mt-2 text-xs text-emerald-700">{tokenSuccess}</p>}
        </form>
      )}
      {role === 'parent' && (
        <ChildScopePanel
          children={children}
          activeChildId={selectedChildId}
          onChange={setSelectedChildId}
          heading="Academic Scope"
          description="Switch child once and the overview table plus report card stay aligned to that student."
        />
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <select
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
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
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All Terms</option>
          {['First Term', 'Second Term', 'Third Term'].map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
        <input
          value={subjectSearch}
          onChange={(e) => setSubjectSearch(e.target.value)}
          placeholder="Filter subjects"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={loadReportCard}
          disabled={!canGenerateReport}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Generate Report Card
        </button>
        <button
          type="button"
          onClick={() => {
            document.body.classList.add('print-mode');
            setTimeout(() => {
              window.print();
              setTimeout(() => document.body.classList.remove('print-mode'), 500);
            }, 100);
          }}
          disabled={!reportCard}
          className="rounded-md border border-primary px-3 py-2 text-sm font-semibold text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          Print / Save as PDF
        </button>
      </div>

      {child && (
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Student</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">{child.fullName}</p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Class</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">{child.classLabel || child.level || 'Pending'}</p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Institution</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">{child.institution || 'Pending'}</p>
          </article>
        </div>
      )}

      {!!subjects.length && (
        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Subjects in class</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {subjects.map((subject) => (
              <span key={subject.id} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                {subject.name}
              </span>
            ))}
          </div>
        </section>
      )}

      {!finalResult && (
        <p className="mt-6 text-sm text-slate-600">
          Results are now compiled into a single report sheet. Use “Generate Report Card” to view the full term result.
        </p>
      )}

      {filteredReportCard && (
        <ReportCardSheet reportCard={filteredReportCard} />
      )}
    </PortalLayout>
  );
}

export default RoleResults;
