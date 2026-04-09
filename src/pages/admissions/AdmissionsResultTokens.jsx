import { useCallback, useEffect, useRef, useState } from 'react';
import PortalLayout from '../../components/PortalLayout';
import { useAuth } from '../../context/AuthContext';
import { useSiteContent } from '../../context/SiteContentContext';
import { buildStudentCode } from '../../utils/studentCode';


function AdmissionsResultTokens() {
  const { apiJson } = useAuth();
  const { siteContent } = useSiteContent();
  const branding = siteContent.branding || {};
  const logoSrc = branding.logoUrl || '/images/logo.png';
  const [tokens, setTokens] = useState([]);
  const [stats, setStats] = useState({ total: 0, used: 0, active: 0, expired: 0 });
  const [statusFilter, setStatusFilter] = useState('unused');
  const [search, setSearch] = useState('');
  const [activeTokens, setActiveTokens] = useState([]);
  const [students, setStudents] = useState([]);
  const [classFilter, setClassFilter] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [copiedId, setCopiedId] = useState('');
  const [copiedCode, setCopiedCode] = useState('');
  const [showStudentRows, setShowStudentRows] = useState(true);
  const [showTokenRows, setShowTokenRows] = useState(true);
  const [assignment, setAssignment] = useState({ tokenValue: '', studentIdentifier: '' });
  const [assigning, setAssigning] = useState(false);
  const [tokenCard, setTokenCard] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const tokenCardRef = useRef(null);
  const studentMap = useRef(new Map());

  const loadTokens = useCallback(async () => {
    setError('');
    try {
      const query = new URLSearchParams();
      if (statusFilter) query.set('status', statusFilter);
      if (search.trim()) query.set('search', search.trim());
      const data = await apiJson(`/result-tokens/admissions?${query.toString()}`);
      setTokens(data.tokens || []);
      setStats(data.stats || stats);
    } catch (err) {
      setError(err.message || 'Unable to load tokens.');
    }
  }, [apiJson, search, statusFilter, stats]);

  const loadActiveTokens = useCallback(async () => {
    try {
      const data = await apiJson('/result-tokens/admissions?status=active');
      setActiveTokens(data.tokens || []);
    } catch (err) {
      setError(err.message || 'Unable to load active tokens.');
    }
  }, [apiJson]);

  const loadStudents = useCallback(async () => {
    try {
      const data = await apiJson('/operations/students');
      setStudents(data.students || []);
      studentMap.current = new Map((data.students || []).map((student) => [student.id, student.fullName]));
    } catch (err) {
      setError(err.message || 'Unable to load students.');
    }
  }, [apiJson]);

  useEffect(() => {
    loadTokens();
  }, [loadTokens]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  useEffect(() => {
    loadActiveTokens();
  }, [loadActiveTokens]);

  const classOptions = Array.from(
    new Map(
      students.map((student) => {
        const key = student.classId || student.classLabel || student.level || '';
        const label = student.classLabel || student.level || 'Unassigned';
        return [key, { id: student.classId || '', label }];
      })
    ).values()
  ).filter((item) => item.id);

  const filteredStudents = students.filter((student) => {
    if (classFilter && student.classId !== classFilter) return false;
    if (!studentSearch.trim()) return true;
    const query = studentSearch.trim().toLowerCase();
    const searchable = `${student.fullName} ${buildStudentCode(student)} ${student.id} ${student.studentEmail}`.toLowerCase();
    return searchable.includes(query);
  });

  async function assignToken(event) {
    event.preventDefault();
    setAssigning(true);
    setError('');
    setSuccess('');
    try {
      const data = await apiJson('/result-tokens/admissions/assign', {
        method: 'POST',
        body: {
          token: assignment.tokenValue,
          studentIdentifier: assignment.studentIdentifier
        }
      });
      setSuccess(`Assigned token to ${data.student?.fullName || 'student'}.`);
      setTokenCard({ token: data.token || { token: assignment.tokenValue }, student: data.student });
      setAssignment({ tokenValue: '', studentIdentifier: '' });
      await loadTokens();
      await loadActiveTokens();
    } catch (err) {
      setError(err.message || 'Unable to assign token.');
    } finally {
      setAssigning(false);
    }
  }

  async function printTokenCard(element) {
    if (!element) return;
    const convertToDataUrl = async (url) => {
      const response = await fetch(url, { cache: 'force-cache' });
      if (!response.ok) throw new Error('Unable to fetch logo');
      const blob = await response.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Unable to read logo'));
        reader.readAsDataURL(blob);
      });
    };
    const printWindow = window.open('', '_blank', 'width=700,height=520');
    if (!printWindow) return;
    const clone = element.cloneNode(true);
    const images = Array.from(clone.querySelectorAll('img'));
    for (const img of images) {
      if (!img.src) continue;
      try {
        const absolute = new URL(img.getAttribute('src') || img.src, window.location.origin);
        const dataUrl = await convertToDataUrl(absolute.toString());
        img.setAttribute('src', dataUrl || absolute.toString());
      } catch (error) {
        // Fall back to absolute URL if data URL conversion fails.
        try {
          const absolute = new URL(img.getAttribute('src') || img.src, window.location.origin);
          img.setAttribute('src', absolute.toString());
        } catch {
          // Leave src as-is if URL resolution fails.
        }
      }
    }
    const styles = `
      <style>
        body { margin: 24px; font-family: Arial, sans-serif; color: #0f172a; }
        .token-card { border: 1px solid #e2e8f0; border-radius: 18px; padding: 20px; background: #f8fafc; }
        .token-card__header { display: flex; align-items: center; gap: 14px; }
        .token-card__logo { width: 52px; height: 52px; border-radius: 14px; border: 1px solid #e2e8f0; object-fit: cover; background: #fff; }
        .token-card__brand h3 { margin: 0 0 4px; font-size: 16px; letter-spacing: 0.12em; text-transform: uppercase; }
        .token-card__brand p { margin: 0; font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.2em; }
        .token-card__meta { margin-top: 10px; font-size: 12px; color: #475569; }
        .token-card__meta p { margin: 4px 0; }
        .token-card .code { margin-top: 12px; font-size: 22px; font-weight: 700; letter-spacing: 0.2em; color: #0f172a; }
      </style>
    `;
    printWindow.document.open();
    printWindow.document.write(`
      <html>
        <head>
          <title>Result Token</title>
          <base href="${window.location.origin}/" />
          ${styles}
        </head>
        <body>${clone.outerHTML}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();

    const waitForImages = () => {
      const docImages = Array.from(printWindow.document.images || []);
      if (!docImages.length) return Promise.resolve();
      return Promise.race([
        Promise.all(
          docImages.map(
            (img) =>
              img.complete
                ? Promise.resolve()
                : new Promise((resolve) => {
                    img.onload = resolve;
                    img.onerror = resolve;
                  })
          )
        ),
        new Promise((resolve) => setTimeout(resolve, 1500))
      ]);
    };

    await waitForImages();
    setTimeout(() => {
      printWindow.print();
    }, 100);
  }

  return (
    <PortalLayout
      role="admissions"
      title="Result Token & Card Manager"
      subtitle="Assign tokens, track usage, and generate printable result cards."
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
        {[
          { label: 'Total Tokens', value: stats.total ?? 0 },
          { label: 'Used Tokens', value: stats.used ?? 0 },
          { label: 'Active Tokens', value: stats.active ?? 0 },
          { label: 'Expired Tokens', value: stats.expired ?? 0 }
        ].map((card) => (
          <article key={card.label} className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{card.label}</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{card.value}</p>
          </article>
        ))}
      </section>

      <section className="mt-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-heading text-2xl text-primary">Assign Token to Student</h2>
        <form onSubmit={assignToken} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.2fr,1fr,auto]">
          <input
            list="active-token-list"
            value={assignment.tokenValue}
            onChange={(e) => setAssignment((prev) => ({ ...prev, tokenValue: e.target.value.toUpperCase() }))}
            placeholder="Type or select active token"
            className="rounded-2xl border border-slate-300 px-3 py-3 text-sm"
            required
          />
          <datalist id="active-token-list">
            {activeTokens
              .map((token) => (
                <option key={token.id} value={token.token}>
                  {token.token} ({token.usedCount}/{token.maxUses})
                </option>
              ))}
          </datalist>
          <input
            value={assignment.studentIdentifier}
            onChange={(e) => setAssignment((prev) => ({ ...prev, studentIdentifier: e.target.value }))}
            placeholder="Student ID or Code"
            className="rounded-2xl border border-slate-300 px-3 py-3 text-sm"
            required
          />
          <button
            type="submit"
            disabled={assigning}
            className="rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {assigning ? 'Assigning...' : 'Assign Token'}
          </button>
        </form>
        {!activeTokens.length && (
          <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            No active tokens available yet. Ask admin to generate tokens first.
          </p>
        )}
        {tokenCard && (
          <div className="mt-4 space-y-3">
            <div ref={tokenCardRef} className="token-card rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-4">
              <div className="token-card__header flex items-center gap-3">
                <img src={logoSrc} alt="ATTAUFEEQ logo" className="token-card__logo h-12 w-12 rounded-2xl border border-slate-200 bg-white object-cover" />
                <div className="token-card__brand">
                  <h3>ATTAUFEEQ Result Token</h3>
                  <p>{branding.name || 'ATTAUFEEQ Model Academy'}</p>
                </div>
              </div>
              <div className="token-card__meta mt-3 text-sm text-slate-600">
                <p>Student: {tokenCard.student?.fullName || '—'}</p>
                <p>Admission No: {tokenCard.student?.id || '—'}</p>
                <p>Institution: {tokenCard.student?.institution || 'ATTAUFEEQ Model Academy'}</p>
                <p>Student Code: {buildStudentCode(tokenCard.student || {})}</p>
                <p>Term: {tokenCard.token?.term || '—'}</p>
              </div>
              <div className="code mt-3 text-xl font-bold tracking-[0.25em] text-slate-900">{tokenCard.token?.token || tokenCard.token}</div>
            </div>
            <button
              type="button"
              onClick={() => printTokenCard(tokenCardRef.current)}
              className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700"
            >
              Print Token Card
            </button>
          </div>
        )}
      </section>

      <section className="mt-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-2xl text-primary">Pick Student (Copy ID / Code)</h2>
            <p className="mt-2 text-sm text-slate-600">Choose a class, then copy the student ID or code into the token assignment field.</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="rounded-2xl border border-slate-300 px-4 py-3 text-sm"
          >
            <option value="">All Classes</option>
            {classOptions.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>
          <input
            value={studentSearch}
            onChange={(e) => setStudentSearch(e.target.value)}
            placeholder="Search by name, code, or email"
            className="rounded-2xl border border-slate-300 px-4 py-3 text-sm"
          />
        </div>
        <div className="mt-4 max-h-[360px] overflow-auto rounded-2xl border border-slate-200">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            <span>Students table</span>
            <button
              type="button"
              onClick={() => setShowStudentRows((prev) => !prev)}
              className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
            >
              {showStudentRows ? 'Hide rows' : 'Show rows'}
            </button>
          </div>
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Class</th>
                <th className="px-4 py-3">Student ID</th>
                <th className="px-4 py-3">Student Code</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {!showStudentRows && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                    Rows are hidden. Click “Show rows” to display students.
                  </td>
                </tr>
              )}
              {showStudentRows && filteredStudents.map((student) => (
                <tr key={student.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-800">{student.fullName}</p>
                    <p className="text-xs text-slate-500">{student.studentEmail || '—'}</p>
                  </td>
                  <td className="px-4 py-3">{student.classLabel || student.level || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-700">{student.id}</span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(student.id);
                          setAssignment((prev) => ({ ...prev, studentIdentifier: student.id }));
                          setCopiedId(student.id);
                          setTimeout(() => setCopiedId(''), 1500);
                        }}
                        className="rounded-full border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-600"
                      >
                        {copiedId === student.id ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-700">{buildStudentCode(student)}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const code = buildStudentCode(student);
                          navigator.clipboard.writeText(code);
                          setAssignment((prev) => ({ ...prev, studentIdentifier: code }));
                          setCopiedCode(code);
                          setTimeout(() => setCopiedCode(''), 1500);
                        }}
                        className="rounded-full border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-600"
                      >
                        {copiedCode === buildStudentCode(student) ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setAssignment((prev) => ({ ...prev, studentIdentifier: student.id }))}
                      className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
                    >
                      Use ID
                    </button>
                  </td>
                </tr>
              ))}
              {showStudentRows && !filteredStudents.length && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-500">No students found for this class.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-2xl text-primary">Token Inventory</h2>
            <p className="mt-2 text-sm text-slate-600">Track usage and remaining access.</p>
          </div>
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
            <option value="">All Tokens</option>
            <option value="unused">Unused</option>
            <option value="used">Used</option>
            <option value="expired">Expired</option>
          </select>
        </div>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            <span>Token inventory table</span>
            <button
              type="button"
              onClick={() => setShowTokenRows((prev) => !prev)}
              className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
            >
              {showTokenRows ? 'Hide rows' : 'Show rows'}
            </button>
          </div>
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-3">Token</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Assigned</th>
                <th className="px-4 py-3">Institution</th>
                <th className="px-4 py-3">Term</th>
                <th className="px-4 py-3">Usage</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {!showTokenRows && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                    Rows are hidden. Click “Show rows” to display tokens.
                  </td>
                </tr>
              )}
              {showTokenRows && tokens.length > 0 && tokens.map((token) => (
                <tr key={token.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-semibold text-slate-800">{token.token}</td>
                  <td className="px-4 py-3">{token.status}</td>
                  <td className="px-4 py-3">
                    {token.assignedStudentId
                      ? `${studentMap.current.get(token.assignedStudentId) || 'Student'} (${token.assignedStudentId})`
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {token.assignedStudentId
                      ? (students.find((student) => student.id === token.assignedStudentId)?.institution || 'ATTAUFEEQ Model Academy')
                      : '—'}
                  </td>
                  <td className="px-4 py-3">{token.term || '—'}</td>
                  <td className="px-4 py-3">{token.usedCount}/{token.maxUses}</td>
                  <td className="px-4 py-3">{token.createdAt ? new Date(token.createdAt).toLocaleString() : '—'}</td>
                </tr>
              ))}
              {showTokenRows && !tokens.length && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-slate-500">No tokens available.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-heading text-2xl text-primary">Result Card Delivery</h2>
        <p className="mt-2 text-sm text-slate-600">
          Result cards are generated when a student uses a valid token on the Result Checker page.
          Print the token card above and share it with the student.
        </p>
      </section>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {success && <p className="mt-4 text-sm text-emerald-700">{success}</p>}
    </PortalLayout>
  );
}

export default AdmissionsResultTokens;
