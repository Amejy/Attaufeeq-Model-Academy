import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ReportCardSheet from '../components/ReportCardSheet';
import SectionPhotoGrid from '../components/public/SectionPhotoGrid';
import { GlassPanel, PremiumHero } from '../components/public/PremiumPublic';
import { apiJson } from '../utils/publicApi';
import { getSectionMedia } from '../utils/publicSectionImages';

const TERM_OPTIONS = ['First Term', 'Second Term', 'Third Term'];

function ResultChecker() {
  const resultMedia = getSectionMedia('result');
  const [searchParams] = useSearchParams();
  const [studentIdentifier, setStudentIdentifier] = useState('');
  const [term, setTerm] = useState('First Term');
  const [token, setToken] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event, overrides = {}) {
    event?.preventDefault?.();
    const nextStudentIdentifier = String(overrides.studentIdentifier ?? studentIdentifier).trim();
    const nextTerm = String(overrides.term ?? term).trim();
    const nextToken = String(overrides.token ?? token).trim().toUpperCase();
    const nextSessionId = String(overrides.sessionId ?? sessionId).trim();

    if (!nextStudentIdentifier || !nextTerm) return;
    setLoading(true);
    setError('');
    setPayload(null);
    try {
      const data = await apiJson('/result-tokens/check', {
        method: 'POST',
        body: {
          token: nextToken,
          studentIdentifier: nextStudentIdentifier,
          term: nextTerm,
          sessionId: nextSessionId
        }
      });
      setPayload(data);
    } catch (err) {
      setError(err.message || 'Unable to validate token.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const nextStudentIdentifier = String(searchParams.get('studentIdentifier') || '').trim();
    const nextTerm = String(searchParams.get('term') || '').trim();
    const nextToken = String(searchParams.get('token') || '').trim().toUpperCase();
    const nextSessionId = String(searchParams.get('sessionId') || '').trim();

    if (!nextStudentIdentifier) return;

    setStudentIdentifier(nextStudentIdentifier);
    if (nextTerm && TERM_OPTIONS.includes(nextTerm)) {
      setTerm(nextTerm);
    }
    if (nextToken) {
      setToken(nextToken);
    }
    if (nextSessionId) {
      setSessionId(nextSessionId);
    }

    if (!nextTerm || !TERM_OPTIONS.includes(nextTerm)) return;

    let cancelled = false;

    async function runPrefillCheck() {
      setLoading(true);
      setError('');
      setPayload(null);
      try {
        const data = await apiJson('/result-tokens/check', {
          method: 'POST',
          body: {
            token: nextToken,
            studentIdentifier: nextStudentIdentifier,
            term: nextTerm,
            sessionId: nextSessionId
          }
        });
        if (!cancelled) {
          setPayload(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Unable to validate token.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void runPrefillCheck();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  const student = payload?.student;
  const holdReason = payload?.holdReason;
  const remainingUses = payload?.remainingUses;
  const reportCard = payload?.reportCard || null;

  function printReportSheet(element) {
    if (!element) return;
    const printWindow = window.open('', '_blank', 'width=980,height=720');
    if (!printWindow) return;
    printWindow.document.open();
    printWindow.document.write(`
      <html>
        <head>
          <title>Report Sheet</title>
          <style>
            body { margin: 0; background: #fff; }
            body * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .report-sheet { margin: 0 auto !important; box-shadow: none !important; }
          </style>
        </head>
        <body>
          ${element.outerHTML}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  return (
    <main className="premium-page">
      <PremiumHero
        accent="school"
        badge="Check Result"
        title="Student Result Access"
        kicker="School and Madrasa Results"
        description="Use a student ID or code with a valid token to access published academic or madrasa results."
        image={resultMedia.headerImage?.url || '/images/Home/Pasted image (2).png'}
        imageAlt="Student result access"
      />
    <section className="section-wrap pb-20">
      <GlassPanel className="mx-auto max-w-5xl p-6 sm:p-8">
          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Result Checker</p>
            <h1 className="break-words font-heading text-3xl text-primary sm:text-4xl">Check Your Result</h1>
            <p className="text-sm text-slate-600">
              Enter your student ID or student code with a valid result token to view your published results.
            </p>
            <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              First-time result access depends on the school opening token sales for the term. If sales are still closed, receipt upload and new token access will stay unavailable.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 grid gap-3 sm:grid-cols-2">
            <input
              value={studentIdentifier}
              onChange={(e) => setStudentIdentifier(e.target.value)}
              placeholder="Student ID or Student Code"
              className="rounded-2xl border border-slate-300 px-4 py-3 text-sm"
              required
            />
            <select
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              className="rounded-2xl border border-slate-300 px-4 py-3 text-sm"
            >
              {TERM_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            <input
              value={token}
              onChange={(e) => setToken(e.target.value.toUpperCase())}
              placeholder="Result Token (required only for first-time access)"
              className="rounded-2xl border border-slate-300 px-4 py-3 text-sm sm:col-span-2"
            />
            <input
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              placeholder="Session ID (optional)"
              className="rounded-2xl border border-slate-300 px-4 py-3 text-sm sm:col-span-2"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 sm:col-span-2"
            >
              {loading ? 'Checking...' : 'Check Result'}
            </button>
          </form>

          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

          {payload && (
            <div className="mt-8 space-y-4">
              {student && (
              <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Student Details</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div>
                      <p className="text-sm text-slate-600">Name</p>
                      <p className="break-words font-semibold text-slate-900">{student.fullName}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-600">Class</p>
                      <p className="font-semibold text-slate-900">{student.classLabel || student.classId || '—'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-600">Institution</p>
                      <p className="font-semibold text-slate-900">{student.institution || '—'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-600">Remaining Uses</p>
                      <p className="font-semibold text-slate-900">{remainingUses ?? '—'}</p>
                    </div>
                  </div>
                </div>
              )}

              {holdReason && (
                <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  {holdReason}
                </div>
              )}

              {!holdReason && reportCard && (
                <div className="space-y-3">
                  <div id="result-card-print">
                    <ReportCardSheet reportCard={reportCard} />
                  </div>
                  <button
                    type="button"
                    onClick={() => printReportSheet(document.getElementById('result-card-print'))}
                    className="interactive-button rounded-2xl border border-slate-300 bg-white/80 px-4 py-3 text-sm font-semibold text-slate-700"
                  >
                    Print / Save as PDF
                  </button>
                </div>
              )}
            </div>
          )}
      </GlassPanel>
    </section>

    <SectionPhotoGrid
      eyebrow="Result Access"
      title="Result page visuals"
      description="The result folder images are now connected to this page. The main image appears in the header and the remaining images appear here."
      photos={resultMedia.supportingImages}
      fallbackSrc={resultMedia.headerImage?.url || '/images/logo.png'}
    />
    </main>
  );
}

export default ResultChecker;
