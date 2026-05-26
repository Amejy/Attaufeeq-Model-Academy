import { useCallback, useEffect, useRef, useState } from 'react';
import PortalLayout from '../../components/PortalLayout';
import ResultScratchCard from '../../components/ResultScratchCard';
import { useAuth } from '../../context/AuthContext';
import { useSiteContent } from '../../context/SiteContentContext';
import { buildStudentCode } from '../../utils/studentCode';
import { buildResultCheckerUrl } from '../../utils/resultVerification';


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
  const checkerOrigin = typeof window !== 'undefined' ? window.location.origin : '';

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
      } catch (_error) {
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
        body { margin: 24px; font-family: Arial, sans-serif; color: #0f172a; background: #ffffff; }
        * { box-sizing: border-box; }
        .text-code-break { overflow-wrap: anywhere; word-break: break-word; }
        .text-wrap-safe { overflow-wrap: break-word; word-break: normal; white-space: normal; }
        .token-card { border: 1px solid #e2e8f0; border-radius: 18px; padding: 20px; background: #f8fafc; }
        .result-scratch-card { position: relative; overflow: hidden; border-radius: 34px; border: 1px solid rgba(37, 99, 235, 0.18); background: radial-gradient(circle at 86% 26%, rgba(191, 219, 254, 0.24), transparent 25%), radial-gradient(circle at 18% 72%, rgba(226, 232, 240, 0.46), transparent 31%), linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.96)); box-shadow: 0 28px 54px rgba(15, 23, 42, 0.14), inset 0 1px 0 rgba(255,255,255,0.82); }
        .result-scratch-card::before { content: ""; position: absolute; inset: 0; background: radial-gradient(circle at right center, rgba(59,130,246,0.08), transparent 30%), linear-gradient(120deg, transparent 58%, rgba(15,23,42,0.02) 58%, rgba(15,23,42,0.02) 59%, transparent 59%); pointer-events: none; }
        .result-scratch-card::after { content: ""; position: absolute; inset: 0; background: radial-gradient(circle at 83% 38%, rgba(59,130,246,0.08), transparent 22%), linear-gradient(90deg, transparent 66%, rgba(148,163,184,0.16) 66%, rgba(148,163,184,0.16) 66.3%, transparent 66.3%); pointer-events: none; }
        .result-scratch-card__hero { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 24px 24px 0; }
        .result-scratch-card__brand-block { display: flex; min-width: 0; flex: 1 1 420px; align-items: center; gap: 20px; }
        .result-scratch-card__logo-shell { height: 100px; width: 100px; flex-shrink: 0; }
        .result-scratch-card__logo { width: 100%; height: 100%; object-fit: contain; }
        .result-scratch-card__title { margin: 0; color: #0f2b5b; font-size: 42px; font-weight: 800; line-height: 1.08; }
        .result-scratch-card__school { margin: 10px 0 0; color: #5a7fb8; font-size: 20px; letter-spacing: 0.28em; text-transform: uppercase; }
        .result-scratch-card__secure-pill { position: relative; display: inline-flex; min-width: 288px; align-items: center; gap: 12px; border-radius: 0 0 0 32px; background: linear-gradient(135deg, #08275b, #071a44); padding: 16px 22px 16px 30px; color: #f8fafc; box-shadow: 0 16px 30px rgba(8,39,91,0.18); }
        .result-scratch-card__secure-pill::before { content: ""; position: absolute; top: 0; bottom: 0; left: -38px; width: 58px; background: linear-gradient(135deg, #08275b, #071a44); clip-path: polygon(100% 0, 0 0, 100% 100%); }
        .result-scratch-card__secure-title { margin: 0; font-size: 15px; font-weight: 800; text-transform: uppercase; }
        .result-scratch-card__secure-note { margin: 2px 0 0; font-size: 14px; color: rgba(255, 255, 255, 0.86); }
        .result-scratch-card__content { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(240px, 0.75fr); gap: 24px; align-items: center; padding: 22px 24px 0; }
        .result-scratch-card__details { display: grid; gap: 12px; }
        .result-scratch-card__meta-row { display: grid; grid-template-columns: 68px minmax(0, 1fr); gap: 16px; align-items: center; }
        .result-scratch-card__meta-icon { display: flex; height: 54px; width: 54px; align-items: center; justify-content: center; border-radius: 16px; background: linear-gradient(180deg, rgba(219, 234, 254, 0.96), rgba(219, 234, 254, 0.74)); color: #173f80; }
        .result-scratch-card__meta-line { margin: 0; color: #111827; font-size: 18px; line-height: 1.45; }
        .result-scratch-card__meta-label { color: #0b2f69; font-weight: 800; }
        .result-scratch-card__qr-panel { position: relative; border-left: 1px solid rgba(96, 165, 250, 0.35); padding-left: 24px; }
        .result-scratch-card__wave { position: absolute; inset: -16px -16px -16px -96px; opacity: 0.8; background: radial-gradient(circle at 15% 50%, rgba(191, 219, 254, 0.24), transparent 22%), repeating-radial-gradient(circle at 78% 52%, transparent 0 10px, rgba(191, 219, 254, 0.22) 10px 11px); pointer-events: none; }
        .result-scratch-card__qr-shell { position: relative; margin-left: auto; max-width: 216px; border-radius: 22px; border: 1px solid rgba(226, 232, 240, 0.96); background: rgba(255, 255, 255, 0.96); padding: 16px; text-align: center; box-shadow: 0 12px 30px rgba(15,23,42,0.08); }
        .result-scratch-card__qr-image { width: 100%; border-radius: 16px; background: #fff; object-fit: contain; }
        .result-scratch-card__qr-caption { margin: 12px 0 0; color: #0f172a; font-size: 15px; line-height: 1.35; }
        .result-scratch-card__scratch-band { display: grid; grid-template-columns: minmax(220px, 0.72fr) minmax(0, 1.28fr); gap: 16px; align-items: center; margin: 22px 24px 0; border: 2px solid rgba(37, 99, 235, 0.78); border-radius: 24px; padding: 16px; background: linear-gradient(180deg, rgba(255, 255, 255, 0.78), rgba(248, 250, 252, 0.94)), radial-gradient(circle at center, rgba(219, 234, 254, 0.35), transparent 42%); }
        .result-scratch-card__scratch-guide { display: flex; align-items: center; gap: 16px; }
        .result-scratch-card__scratch-copy-block { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
        .result-scratch-card__scratch-icon-shell { display: flex; height: 78px; width: 78px; flex-shrink: 0; align-items: center; justify-content: center; border-radius: 999px; background: linear-gradient(180deg, #e0ecff, #cfe0ff); color: #1d4f9c; }
        .result-scratch-card__scratch-copy { margin: 0; max-width: 160px; color: #1d4f9c; font-size: 18px; line-height: 1.35; }
        .result-scratch-card__scratch-arrow { height: 28px; width: 68px; color: #1d4f9c; }
        .result-scratch-card__scratch-token { position: relative; overflow: hidden; border-radius: 20px; border: 1px solid rgba(148, 163, 184, 0.62); background: linear-gradient(180deg, rgba(208, 214, 224, 0.96), rgba(156, 163, 175, 0.94)), repeating-linear-gradient(0deg, rgba(255,255,255,0.09) 0 2px, rgba(148,163,184,0.08) 2px 4px), repeating-linear-gradient(135deg, rgba(255,255,255,0.08) 0 14px, rgba(148,163,184,0.08) 14px 28px); padding: 24px 22px; text-align: center; box-shadow: inset 0 1px 0 rgba(255,255,255,0.4); }
        .result-scratch-card__scratch-token span { color: #08275b; font-family: "Merriweather", serif; font-size: 48px; font-weight: 800; letter-spacing: 0.38em; line-height: 1.15; }
        .result-scratch-card__footer { position: relative; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 16px; margin-top: 22px; background: linear-gradient(135deg, #08275b, #071a44); padding: 22px 24px 18px; }
        .result-scratch-card__footer-note, .result-scratch-card__footer-school { margin: 0; color: rgba(255,255,255,0.95); font-size: 16px; line-height: 1.4; }
        .result-scratch-card__footer-school { color: #f2cf70; }
        .result-scratch-card__footer-crest { position: absolute; left: 50%; top: 0; transform: translate(-50%, -48%); width: 120px; height: 68px; display: flex; align-items: center; justify-content: center; background: linear-gradient(180deg, #0c2d63, #091e49); clip-path: polygon(50% 100%, 100% 0, 0 0); filter: drop-shadow(0 10px 18px rgba(8,39,91,0.28)); }
        .result-scratch-card__footer-crest::before { content: ""; position: absolute; inset: 4px; background: linear-gradient(180deg, #f3c96d, #d39e33); clip-path: polygon(50% 100%, 100% 0, 0 0); }
        .result-scratch-card__footer-crest-inner { position: relative; z-index: 1; display: flex; align-items: center; justify-content: center; width: 70px; height: 36px; border-radius: 999px 999px 0 0; color: #f7deb0; font-size: 16px; }
        .result-scratch-card__footer-star { transform: translateY(-3px); }
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

  const tokenCardStudentCode = tokenCard?.student ? buildStudentCode(tokenCard.student) : '';
  const tokenActivationUrl = tokenCard
    ? buildResultCheckerUrl({
        studentIdentifier: tokenCardStudentCode || tokenCard.student?.id || '',
        term: tokenCard.token?.term || '',
        sessionId: tokenCard.token?.sessionId || '',
        token: tokenCard.token?.token || tokenCard.token || '',
        origin: checkerOrigin
      })
    : '';
  return (
    <PortalLayout
      role="admissions"
      title="Result Token & Card Manager"
      subtitle="Sell tokens quickly, reserve one for a student when needed, and print a clean token slip on the spot."
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
          <article key={card.label} className="dashboard-tile rounded-[24px] p-4">
            <p className="text-wrap-safe text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{card.label}</p>
            <p className="text-wrap-safe mt-2 text-2xl font-bold text-slate-900">{card.value}</p>
          </article>
        ))}
      </section>

      <section className="dashboard-tile mt-6 rounded-[28px] p-5">
        <h2 className="text-wrap-safe font-heading text-2xl text-primary">Reserve Token for Student</h2>
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
            {assigning ? 'Saving...' : 'Reserve Token'}
          </button>
        </form>
        <p className="mt-3 text-xs text-slate-500">
          You do not have to reserve every token here. Any unused token can still be sold directly and will bind itself to the first student who uses it.
        </p>
        {!activeTokens.length && (
          <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            No active tokens available yet. Ask admin to generate tokens first.
          </p>
        )}
        {tokenCard && (
          <div className="mt-4 space-y-3">
            <div ref={tokenCardRef} className="token-card dashboard-tile rounded-[28px] px-5 py-5 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="max-w-full rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                  Student Reserved
                </div>
                <p className="text-code-break text-xs text-slate-500">{tokenActivationUrl}</p>
              </div>
              <ResultScratchCard
                logoSrc={logoSrc}
                schoolName={branding.name || 'ATTAUFEEQ MODEL ACADEMY'}
                studentName={tokenCard.student?.fullName || '—'}
                admissionNo={tokenCard.student?.id || '—'}
                institution={tokenCard.student?.institution || 'Model Academy'}
                studentCode={tokenCardStudentCode || '—'}
                term={tokenCard.token?.term || '—'}
                sessionId={tokenCard.token?.sessionId || ''}
                token={tokenCard.token?.token || tokenCard.token || ''}
                revealOnInteract={false}
              />
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

      <section className="dashboard-tile mt-6 rounded-[28px] p-5">
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
                      <span className="text-code-break text-xs font-semibold text-slate-700">{student.id}</span>
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
                      <span className="text-code-break text-xs font-semibold text-slate-700">{buildStudentCode(student)}</span>
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

      <section className="dashboard-tile mt-6 rounded-[28px] p-5">
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
                <th className="px-4 py-3 whitespace-nowrap">Token</th>
                <th className="px-4 py-3 whitespace-nowrap">Status</th>
                <th className="px-4 py-3 whitespace-nowrap">Assigned</th>
                <th className="px-4 py-3 whitespace-nowrap">Institution</th>
                <th className="px-4 py-3 whitespace-nowrap">Term</th>
                <th className="px-4 py-3 whitespace-nowrap">Usage</th>
                <th className="px-4 py-3 whitespace-nowrap">Created</th>
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
                  <td className="text-code-break px-4 py-3 font-semibold tracking-[0.08em] text-slate-800">{token.token}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-700">
                      {token.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {token.assignedStudentId
                      ? (
                        <div className="min-w-0">
                          <p className="text-wrap-safe font-medium text-slate-800">
                            {studentMap.current.get(token.assignedStudentId) || 'Student'}
                          </p>
                          <p className="text-code-break mt-1 text-xs text-slate-500">{token.assignedStudentId}</p>
                        </div>
                      )
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {token.assignedStudentId
                      ? (students.find((student) => student.id === token.assignedStudentId)?.institution || 'ATTAUFEEQ Model Academy')
                      : '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-700">{token.term || '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-700">{token.usedCount}/{token.maxUses}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                    {token.createdAt
                      ? new Intl.DateTimeFormat('en-NG', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit'
                      }).format(new Date(token.createdAt))
                      : '—'}
                  </td>
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

      <section className="dashboard-tile mt-6 rounded-[28px] p-5">
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
