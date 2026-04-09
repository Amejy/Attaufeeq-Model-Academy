import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import PortalLayout from '../../components/PortalLayout';
import { ADMIN_INSTITUTIONS, institutionAccent } from '../../utils/adminInstitution';
import { buildStudentCode } from '../../utils/studentCode';
import ReportCardSheet from '../../components/ReportCardSheet';
import useDebouncedValue from '../../hooks/useDebouncedValue';

function AdminResultsPublish() {
  const { apiJson } = useAuth();
  const [results, setResults] = useState([]);
  const [classes, setClasses] = useState([]);
  const [institution, setInstitution] = useState(ADMIN_INSTITUTIONS[0]);
  const [term, setTerm] = useState('First Term');
  const [sessionId, setSessionId] = useState('');
  const [sessions, setSessions] = useState([]);
  const [classId, setClassId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [expandedStudents, setExpandedStudents] = useState({});
  const [reportCard, setReportCard] = useState(null);
  const [openClassIds, setOpenClassIds] = useState([]);
  const [accessBusy, setAccessBusy] = useState(false);
  const [termClosures, setTermClosures] = useState([]);
  const [termBusy, setTermBusy] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [reportLoadingStudentId, setReportLoadingStudentId] = useState('');
  const [blockedStudents, setBlockedStudents] = useState([]);
  const [pendingGroups, setPendingGroups] = useState([]);
  const [compiling, setCompiling] = useState(false);
  const [showRowsByInstitution, setShowRowsByInstitution] = useState(() => ({}));
  const resolveShowRows = (value) => showRowsByInstitution[value] !== false;
  const loadDataSeq = useRef(0);
  const reportCardSeq = useRef(0);
  const debouncedPendingSearch = useDebouncedValue('', 300);

  const loadData = useCallback(async (next = {}) => {
    const seq = ++loadDataSeq.current;
    setError('');
    setSuccess('');
    setLoading(true);
    setResults([]);
    setClasses([]);
    setSessions([]);
    setOpenClassIds([]);
    setTermClosures([]);
    setBlockedStudents([]);

    const nextInstitution = next.institution ?? ADMIN_INSTITUTIONS[0];
    const nextTerm = next.term ?? 'First Term';
    const nextClassId = next.classId ?? '';
    const nextSessionId = next.sessionId ?? '';

    try {
      const [resultsData, classesData, sessionsData, accessData, closuresData, pendingData] = await Promise.all([
        apiJson(
          `/results/admin/overview?term=${encodeURIComponent(nextTerm)}&institution=${encodeURIComponent(nextInstitution)}${nextClassId ? `&classId=${encodeURIComponent(nextClassId)}` : ''}${nextSessionId ? `&sessionId=${encodeURIComponent(nextSessionId)}` : ''}`
        ),
        apiJson(`/admin/classes?institution=${encodeURIComponent(nextInstitution)}`),
        apiJson('/admin/academic-sessions'),
        apiJson('/results/admin/access'),
        apiJson(`/admin/terms/closures${nextSessionId ? `?sessionId=${encodeURIComponent(nextSessionId)}` : ''}`),
        apiJson(`/results/admin/pending-subject-results?term=${encodeURIComponent(nextTerm)}${nextSessionId ? `&sessionId=${encodeURIComponent(nextSessionId)}` : ''}`)
      ]);
      if (seq !== loadDataSeq.current) return;

      const classRows = classesData.classes || [];
      setResults(resultsData.results || []);
      setClasses(classRows);
      setOpenClassIds(accessData.openClassIds || []);
      const sessionRows = sessionsData.sessions || [];
      setSessions(sessionRows);
      setTermClosures(closuresData.termClosures || []);
      const active = sessionsData.activeSession || sessionRows.find((item) => item.isActive) || sessionRows[0] || null;
      setSessionId((prev) => {
        const candidate = nextSessionId || prev;
        return candidate && sessionRows.some((session) => session.id === candidate)
          ? candidate
          : active?.id || '';
      });
      setPendingGroups(pendingData.groups || []);

      if (nextClassId && !classRows.some((item) => item.id === nextClassId)) {
        setClassId('');
      }
    } catch (err) {
      if (seq !== loadDataSeq.current) return;
      setError(err.message || 'Unable to load result publishing data.');
      setPendingGroups([]);
    } finally {
      if (seq === loadDataSeq.current) {
        setLoading(false);
      }
    }
  }, [apiJson]);

  const termClosed = useMemo(
    () => termClosures.some((entry) => entry.term === term && entry.sessionId === sessionId),
    [termClosures, term, sessionId]
  );
  const actionBusy = publishing || accessBusy || termBusy || compiling;

  useEffect(() => {
    void loadData({ institution, term, classId, sessionId });
  }, [classId, institution, loadData, sessionId, term]);

  useEffect(() => {
    setExpandedStudents({});
    setReportCard(null);
  }, [classId, institution, sessionId, term]);

  const groupedResults = useMemo(() => {
    const grouped = new Map();

    results.forEach((result) => {
      const existing = grouped.get(result.studentId) || {
        studentId: result.studentId,
        studentName: result.studentName,
        classLabel: result.classLabel,
        institution: result.institution,
        rows: [],
        publishedCount: 0
      };

      existing.rows.push(result);
      existing.publishedCount += result.published ? 1 : 0;
      grouped.set(result.studentId, existing);
    });

    return [...grouped.values()]
      .map((group) => ({
        ...group,
        subjectCount: group.rows.length,
        submittedCount: group.rows.filter((row) => Boolean(row.submittedAt)).length,
        averageTotal: Number(
          (group.rows.reduce((sum, row) => sum + Number(row.total || 0), 0) / group.rows.length).toFixed(1)
        ),
        rows: group.rows.sort((a, b) => a.subjectName.localeCompare(b.subjectName))
      }))
      .sort((a, b) => a.classLabel.localeCompare(b.classLabel) || a.studentName.localeCompare(b.studentName));
  }, [results]);

  const pendingGroupsFiltered = useMemo(() => pendingGroups, [pendingGroups]);

  async function compilePublishedResults() {
    setCompiling(true);
    setError('');
    setSuccess('');
    try {
      const data = await apiJson('/results/admin/compile-final-results', {
        method: 'POST',
        body: {
          term,
          classId,
          institution,
          sessionId
        }
      });
      setSuccess(`Compiled ${data.compiledCount || 0} final report cards.`);
      void loadData({ institution, term, classId, sessionId });
    } catch (err) {
      setError(err.message || 'Unable to compile final results.');
    } finally {
      setCompiling(false);
    }
  }
  const hasPublishableResults = useMemo(
    () => results.some((row) => (row.submittedAt || row.submittedByTeacherId) && !row.published),
    [results]
  );
  const summaryCards = useMemo(
    () => [
      {
        key: 'rows',
        label: 'Loaded Score Rows',
        value: results.length,
        tone: institutionAccent(institution)
      },
      {
        key: 'students',
        label: 'Students In Review',
        value: groupedResults.length,
        tone: 'border-slate-200 bg-slate-50 text-slate-700'
      },
      {
        key: 'publishable',
        label: 'Publishable Rows',
        value: results.filter((row) => (row.submittedAt || row.submittedByTeacherId) && !row.published).length,
        tone: hasPublishableResults ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'
      }
    ],
    [groupedResults.length, hasPublishableResults, institution, results]
  );

  async function publishResults(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setBlockedStudents([]);

    try {
      setPublishing(true);
      const data = await apiJson('/results/admin/publish', {
        method: 'POST',
        body: { term, classId: classId || undefined, institution, sessionId }
      });

      const publishedCount = data.publishedCount || 0;
      const blockedCount = data.blockedCount || 0;
      setBlockedStudents(Array.isArray(data.blockedStudents) ? data.blockedStudents : []);
      setSuccess(
        blockedCount
          ? publishedCount
            ? `${publishedCount} result records published for ${institution}. ${blockedCount} student(s) are still held due to outstanding fees.`
            : `No result records were published for ${institution}. ${blockedCount} student(s) are still held due to outstanding fees.`
          : `${publishedCount} result records published for ${institution}.`
      );
      void loadData({ institution, term, classId, sessionId });
    } catch (err) {
      setError(err.message || 'Unable to publish results.');
    } finally {
      setPublishing(false);
    }
  }

  const classAccessOpen = classId ? openClassIds.includes(classId) : false;

  async function toggleClassAccess() {
    if (!classId) return;
    setAccessBusy(true);
    setError('');
    setSuccess('');

    try {
      const data = await apiJson('/results/admin/access', {
        method: 'PUT',
        body: { classId, open: !classAccessOpen }
      });
      setOpenClassIds(data.openClassIds || []);
      setSuccess(classAccessOpen ? 'Results access closed for this class.' : 'Results access opened for this class.');
    } catch (err) {
      setError(err.message || 'Unable to update results access.');
    } finally {
      setAccessBusy(false);
    }
  }

  async function toggleTermClosed() {
    if (!term) return;
    setTermBusy(true);
    setError('');
    setSuccess('');

    try {
      const data = await apiJson('/admin/terms/closures', {
        method: 'PUT',
        body: { term, sessionId, closed: !termClosed }
      });
      setTermClosures(data.termClosures || []);
      setSuccess(termClosed ? 'Term reopened for this session.' : 'Term closed for this session.');
    } catch (err) {
      setError(err.message || 'Unable to update term status.');
    } finally {
      setTermBusy(false);
    }
  }

  function toggleExpanded(studentId) {
    setExpandedStudents((prev) => ({ ...prev, [studentId]: !prev[studentId] }));
  }

  async function loadReportSheet(studentId) {
    const seq = ++reportCardSeq.current;
    setError('');
    setReportCard(null);
    setReportLoadingStudentId(studentId);
    try {
      const params = new URLSearchParams();
      if (term) params.set('term', term);
      if (sessionId) params.set('sessionId', sessionId);
      const query = params.toString() ? `?${params.toString()}` : '';
      const data = await apiJson(`/results/admin/report-card/${studentId}${query}`);
      if (seq !== reportCardSeq.current) return;
      setReportCard(data.reportCard || null);
    } catch (err) {
      if (seq !== reportCardSeq.current) return;
      setError(err.message || 'Unable to load report sheet.');
    } finally {
      if (seq === reportCardSeq.current) {
        setReportLoadingStudentId('');
      }
    }
  }

  return (
    <PortalLayout
      role="admin"
      title="Result Approval and Publishing"
      subtitle="Teacher-uploaded scores now flow into an institution-scoped admin review before publication."
    >
      <div className="grid gap-4 lg:grid-cols-3">
        {summaryCards.map((card) => (
          <article key={card.key} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${card.tone}`}>
              {card.key === 'rows' ? institution : term}
            </p>
            <p className="mt-4 text-3xl font-bold text-slate-900">
              {card.value}
            </p>
            <p className="mt-2 text-sm text-slate-600">{card.label}</p>
          </article>
        ))}
      </div>

      <section className="mt-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-2xl text-primary">Pending Subject Result Groups</h2>
            <p className="mt-2 text-sm text-slate-600">
              Subject-level approvals are disabled. Use Publish or Compile Final Report Cards instead.
            </p>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
            0 groups
          </span>
        </div>
      </section>

      <form onSubmit={publishResults} className="mt-6 grid gap-3 rounded-[28px] border border-slate-200 bg-white p-5 sm:grid-cols-6">
        <select
          value={institution}
          onChange={(e) => {
            setInstitution(e.target.value);
            setClassId('');
          }}
          className="rounded-2xl border border-slate-300 px-4 py-3 text-sm"
        >
          {ADMIN_INSTITUTIONS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select value={term} onChange={(e) => setTerm(e.target.value)} className="rounded-2xl border border-slate-300 px-4 py-3 text-sm">
          {['First Term', 'Second Term', 'Third Term'].map((termOption) => (
            <option key={termOption} value={termOption}>
              {termOption}
            </option>
          ))}
        </select>
        <select
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
          className="rounded-2xl border border-slate-300 px-4 py-3 text-sm"
        >
          {!sessions.length && <option value="">No sessions available</option>}
          {sessions.map((session) => (
            <option key={session.id} value={session.id}>
              {session.sessionName} {session.isActive ? '(Active)' : ''}
            </option>
          ))}
        </select>
        <select
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          className="rounded-2xl border border-slate-300 px-4 py-3 text-sm"
        >
          <option value="">All Classes</option>
          {classes.map((classItem) => (
            <option key={classItem.id} value={classItem.id}>
              {classItem.name} {classItem.arm}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={loading || actionBusy || !sessionId || !hasPublishableResults}
          className="rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {publishing ? 'Publishing...' : 'Publish Approved Results'}
        </button>
        <button
          type="button"
          onClick={compilePublishedResults}
          disabled={loading || actionBusy || !sessionId}
          className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {compiling ? 'Compiling...' : 'Compile Final Report Cards'}
        </button>
        <button
          type="button"
          onClick={toggleClassAccess}
          disabled={loading || actionBusy || !classId}
          className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {accessBusy ? 'Updating Access...' : classAccessOpen ? 'Close Results Access' : 'Open Results Access'}
        </button>
        <button
          type="button"
          onClick={toggleTermClosed}
          disabled={loading || actionBusy || !term || !sessionId}
          className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {termBusy ? 'Updating Term...' : termClosed ? 'Reopen Term' : 'Close Term'}
        </button>
      </form>

      {loading && <p className="mt-4 text-sm text-slate-600">Loading result review data...</p>}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {success && <p className="mt-4 text-sm text-emerald-700">{success}</p>}
      {!!blockedStudents.length && (
        <section className="mt-4 rounded-[24px] border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Publishing Hold</p>
          <p className="mt-2 text-sm text-amber-900">
            These students still have outstanding fee issues, so their submitted results were not published.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {blockedStudents.map((student) => (
              <span key={student.studentId} className="rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-800">
                {student.studentName} {student.classLabel ? `• ${student.classLabel}` : ''} • {buildStudentCode({ id: student.studentId, institution })}
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="mt-8 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-2xl text-primary">{institution} Result Review</h2>
            <p className="mt-2 text-sm text-slate-600">
              Filter by class when needed. Selecting `JSS 1` will now only show `JSS 1` records.
            </p>
          </div>
          <span className={`rounded-full border px-3 py-2 text-xs font-semibold ${institutionAccent(institution)}`}>
            {groupedResults.length} students in review
          </span>
        </div>

        <div className="mt-5 overflow-x-auto rounded-3xl border border-slate-200">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            <span>Results table</span>
            <button
              type="button"
              onClick={() => {
                const nextValue = !resolveShowRows(institution);
                setShowRowsByInstitution((prev) => ({ ...prev, [institution]: nextValue }));
              }}
              className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
            >
              {resolveShowRows(institution) ? 'Hide rows' : 'Show rows'}
            </button>
          </div>
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Class</th>
                <th className="px-4 py-3">Subjects</th>
                <th className="px-4 py-3">Average</th>
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3">Published</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!resolveShowRows(institution) && (
                <tr>
                  <td className="px-4 py-6 text-center text-slate-500" colSpan={7}>
                    Rows are hidden. Click “Show rows” to display results.
                  </td>
                </tr>
              )}
              {resolveShowRows(institution) && groupedResults.map((group) => {
                const open = Boolean(expandedStudents[group.studentId]);

                return (
                  <Fragment key={group.studentId}>
                    <tr className="border-t border-slate-100">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800">{group.studentName}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {buildStudentCode({ id: group.studentId, institution })}
                        </p>
                      </td>
                      <td className="px-4 py-3">{group.classLabel}</td>
                      <td className="px-4 py-3">{group.subjectCount}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{group.averageTotal}</td>
                      <td className="px-4 py-3">{group.submittedCount}/{group.subjectCount}</td>
                      <td className="px-4 py-3">{group.publishedCount}/{group.subjectCount}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button type="button" onClick={() => toggleExpanded(group.studentId)} className="rounded-xl border border-slate-300 px-3 py-2 text-xs">
                            {open ? 'Hide' : 'Open'}
                          </button>
                          <button type="button" disabled={reportLoadingStudentId === group.studentId} onClick={() => loadReportSheet(group.studentId)} className="rounded-xl border border-primary px-3 py-2 text-xs font-semibold text-primary disabled:cursor-not-allowed disabled:opacity-60">
                            {reportLoadingStudentId === group.studentId ? 'Loading Sheet...' : 'Preview Sheet'}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {open && (
                      <tr className="border-t border-slate-100 bg-slate-50/70">
                        <td className="px-4 py-4" colSpan={7}>
                          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                            <table className="min-w-full text-sm">
                              <thead className="bg-slate-50 text-left">
                                <tr>
                                  <th className="px-4 py-3">Subject</th>
                                  <th className="px-4 py-3">CA</th>
                                  <th className="px-4 py-3">Exam</th>
                                  <th className="px-4 py-3">Total</th>
                                  <th className="px-4 py-3">Grade</th>
                                  <th className="px-4 py-3">Published</th>
                                </tr>
                              </thead>
                              <tbody>
                                {group.rows.map((row) => (
                                  <tr key={row.id} className="border-t border-slate-100">
                                    <td className="px-4 py-3">{row.subjectName}</td>
                                    <td className="px-4 py-3">{row.ca}</td>
                                    <td className="px-4 py-3">{row.exam}</td>
                                    <td className="px-4 py-3 font-semibold text-slate-900">{row.total}</td>
                                    <td className="px-4 py-3">{row.grade}</td>
                                    <td className="px-4 py-3">{row.published ? 'Yes' : 'No'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {resolveShowRows(institution) && !groupedResults.length && (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={7}>
                    {loading ? 'Loading result review data...' : 'No results found for this institution, term, and class scope.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {reportCard && (
        <section className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-heading text-2xl text-primary">Admin Report Sheet Preview</h2>
              <p className="mt-1 text-sm text-slate-600">
                Review this approved sheet design before publishing or printing.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  document.body.classList.add('print-mode');
                  setTimeout(() => {
                    window.print();
                    setTimeout(() => document.body.classList.remove('print-mode'), 500);
                  }, 100);
                }}
                className="rounded-2xl border border-primary px-4 py-3 text-sm font-semibold text-primary"
              >
                Print / Save as PDF
              </button>
              <button
                type="button"
                onClick={() => setReportCard(null)}
                className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700"
              >
                Close Preview
              </button>
            </div>
          </div>
          <ReportCardSheet reportCard={reportCard} />
        </section>
      )}
    </PortalLayout>
  );
}

export default AdminResultsPublish;
