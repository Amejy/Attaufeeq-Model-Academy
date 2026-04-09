import { useState } from 'react';
import ResultCard from '../components/ResultCard';
import { apiJson } from '../utils/publicApi';

const TERM_OPTIONS = ['First Term', 'Second Term', 'Third Term'];

function ResultChecker() {
  const [studentIdentifier, setStudentIdentifier] = useState('');
  const [term, setTerm] = useState('First Term');
  const [token, setToken] = useState('');
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setPayload(null);
    try {
      const data = await apiJson('/result-tokens/check', {
        method: 'POST',
        body: {
          token,
          studentIdentifier,
          term
        }
      });
      setPayload(data);
    } catch (err) {
      setError(err.message || 'Unable to validate token.');
    } finally {
      setLoading(false);
    }
  }

  const student = payload?.student;
  const holdReason = payload?.holdReason;
  const remainingUses = payload?.remainingUses;
  const reportCard = payload?.reportCard || null;

  function printResultCard(element) {
    if (!element) return;
    const printWindow = window.open('', '_blank', 'width=900,height=650');
    if (!printWindow) return;
    const styles = `
      <style>
        body { margin: 24px; font-family: Arial, sans-serif; color: #0f172a; }
        .result-card { background: #fff; border: none; border-radius: 0; padding: 0; box-shadow: none; }
        .result-card__header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 1px solid #e2e8f0; padding-bottom: 16px; }
        .result-card__brand { display: flex; align-items: center; gap: 16px; }
        .result-card__logo { width: 64px; height: 64px; object-fit: cover; border-radius: 16px; border: 1px solid #e2e8f0; }
        .result-card__school { font-size: 20px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; }
        .result-card__tag { margin-top: 4px; font-size: 12px; letter-spacing: 0.2em; text-transform: uppercase; color: #64748b; }
        .result-card__meta { font-size: 12px; text-align: right; color: #475569; }
        .result-card__meta span { font-weight: 600; color: #0f172a; }
        .result-card__student { display: grid; grid-template-columns: 120px 1fr; gap: 20px; margin-top: 20px; align-items: center; }
        .result-card__photo { width: 120px; height: 140px; border-radius: 16px; border: 1px solid #e2e8f0; background: #f8fafc; display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 700; color: #0f766e; }
        .result-card__photo img { width: 100%; height: 100%; border-radius: 16px; object-fit: cover; }
        .result-card__details { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 24px; font-size: 12px; color: #64748b; }
        .result-card__details h3 { margin-top: 4px; font-size: 15px; font-weight: 700; color: #0f172a; }
        .result-card__scores { margin-top: 20px; border: 1px solid #e2e8f0; border-radius: 18px; overflow: hidden; }
        .result-card__scores table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .result-card__scores thead { background: #f8fafc; text-transform: uppercase; letter-spacing: 0.12em; font-size: 10px; color: #64748b; }
        .result-card__scores th, .result-card__scores td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; }
        .result-card__summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-top: 18px; }
        .result-card__summary div { background: #f8fafc; border-radius: 14px; padding: 10px 12px; font-size: 12px; color: #64748b; }
        .result-card__summary h3 { margin-top: 4px; font-size: 15px; font-weight: 700; color: #0f172a; }
        .result-card__footer { margin-top: 20px; display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; border-top: 1px dashed #e2e8f0; padding-top: 16px; }
        .result-card__footer img { width: 140px; height: auto; object-fit: contain; }
        .result-card__signature-line { width: 140px; height: 2px; background: #0f172a; margin-top: 24px; }
      </style>
    `;
    printWindow.document.open();
    printWindow.document.write(`
      <html>
        <head>
          <title>Result Card</title>
          ${styles}
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
    <section className="section-wrap py-16 sm:py-20">
      <div className="glass-panel mx-auto max-w-5xl p-6 sm:p-8">
          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Result Checker</p>
            <h1 className="font-heading text-3xl text-primary sm:text-4xl">Check Your Result</h1>
            <p className="text-sm text-slate-600">
              Enter your student ID or student code with a valid result token to view your published results.
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
                      <p className="font-semibold text-slate-900">{student.fullName}</p>
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
                  <ResultCard reportCard={reportCard} />
                  <button
                    type="button"
                    onClick={() => printResultCard(document.getElementById('result-card-print'))}
                    className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700"
                  >
                    Download PDF
                  </button>
                </div>
              )}
            </div>
          )}
      </div>
    </section>
  );
}

export default ResultChecker;
