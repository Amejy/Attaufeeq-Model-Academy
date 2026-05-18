import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import PortalLayout from '../../components/PortalLayout';
import ChildScopePanel from '../../components/ChildScopePanel';
import ResultScratchCard from '../../components/ResultScratchCard';
import useParentChildSelection from '../../hooks/useParentChildSelection';
import { buildStudentCode } from '../../utils/studentCode';

function RoleFeeStatus({ role, section = 'fees' }) {
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
  const [paymentRequests, setPaymentRequests] = useState([]);
  const [receiptForm, setReceiptForm] = useState({ amountPaid: '', method: 'Bank transfer', receiptName: '', receiptDataUrl: '' });
  const [submittingReceipt, setSubmittingReceipt] = useState(false);
  const [success, setSuccess] = useState('');
  const [scratchCard, setScratchCard] = useState(null);
  const [releasedToken, setReleasedToken] = useState(null);

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
      setPaymentRequests([]);
      setScratchCard(null);
      setReleasedToken(null);
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
        setPaymentRequests(data.paymentRequests || []);
        setScratchCard(data.scratchCard || null);
        setReleasedToken(data.releasedToken || null);
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

  function handleReceiptFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setReceiptForm((prev) => ({
        ...prev,
        receiptName: file.name,
        receiptDataUrl: String(reader.result || '')
      }));
    };
    reader.readAsDataURL(file);
  }

  async function submitReceipt(event) {
    event.preventDefault();
    if (!child?.id) return;
    setSubmittingReceipt(true);
    setError('');
    setSuccess('');

    try {
      if (role === 'student') {
        await apiJson('/fees/student/payment-requests', {
          method: 'POST',
          body: {
            term,
            sessionId,
            amountPaid: Number(receiptForm.amountPaid || 0),
            method: receiptForm.method,
            receiptName: receiptForm.receiptName,
            receiptDataUrl: receiptForm.receiptDataUrl
          }
        });
      } else {
        await apiJson('/fees/parent/payment-requests', {
        method: 'POST',
        body: {
          childId: child.id,
          term,
          sessionId,
          amountPaid: Number(receiptForm.amountPaid || 0),
          method: receiptForm.method,
          receiptName: receiptForm.receiptName,
          receiptDataUrl: receiptForm.receiptDataUrl
        }
      });
      }
      setSuccess('Receipt submitted for confirmation. Admissions will review and release the token workflow after confirmation.');
      setReceiptForm({ amountPaid: '', method: 'Bank transfer', receiptName: '', receiptDataUrl: '' });
      const params = new URLSearchParams({ term });
      if (sessionId) params.set('sessionId', sessionId);
      if (selectedChildId) params.set('childId', selectedChildId);
      const data = await apiJson(`/fees/${role}?${params.toString()}`);
      setPaymentRequests(data.paymentRequests || []);
      setSummary(data.summary || null);
      setScratchCard(data.scratchCard || null);
      setReleasedToken(data.releasedToken || null);
    } catch (err) {
      setError(err.message || 'Unable to submit receipt.');
    } finally {
      setSubmittingReceipt(false);
    }
  }

  const isReceiptSection = section === 'receipt-upload';
  const isScratchCardSection = section === 'scratch-card';
  const isSchoolFeesSection = section === 'fees';
  const receiptPath = `/portal/${role}/receipt-upload`;
  const scratchCardPath = `/portal/${role}/scratch-card`;

  return (
    <PortalLayout
      role={role}
      title={
        isReceiptSection
          ? (role === 'student' ? 'Receipt Upload' : 'Child Receipt Upload')
          : isScratchCardSection
            ? (role === 'student' ? 'Scratch Card' : 'Child Scratch Card')
            : (role === 'student' ? 'School Fees' : 'Child School Fees')
      }
      subtitle={
        isReceiptSection
          ? 'Upload payment proof for the scratch card independently, track review status, and wait for admissions confirmation.'
          : isScratchCardSection
            ? 'Use the official scratch-card payment account, upload proof separately, and access the released token when admissions confirms payment.'
            : 'Review school fee balance, payment position, and the active term summary without mixing it with scratch-card purchases.'
      }
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
      <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap">
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
      {success && <p className="mt-4 text-sm text-emerald-700">{success}</p>}
      {child && (
        <p className="text-wrap-safe mt-4 text-sm text-slate-600">
          Profile: <span className="font-semibold text-slate-900">{child.fullName}</span>{' '}
          {child.classLabel ? `• ${child.classLabel}` : ''}
        </p>
      )}

      {summary && isSchoolFeesSection && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <article className="dashboard-tile rounded-xl p-4">
            <p className="text-xs uppercase text-slate-500">Total Plan ({term})</p>
            <p className="mt-2 text-2xl font-bold text-primary">NGN {summary.totalPlan}</p>
          </article>
          <article className="dashboard-tile rounded-xl p-4">
            <p className="text-xs uppercase text-slate-500">Total Paid ({term})</p>
            <p className="mt-2 text-2xl font-bold text-primary">NGN {summary.totalPaid}</p>
          </article>
          <article className="dashboard-tile rounded-xl p-4">
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

      {isSchoolFeesSection && (
        <section className="dashboard-tile mt-6 rounded-2xl p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-wrap-safe font-heading text-2xl text-primary">Scratch Card Purchase Is Separate</h2>
              <p className="text-wrap-safe mt-2 text-sm text-slate-600">
                Scratch-card payment does not count as school-fee payment. It is a separate purchase flow with its own receipt upload and token release process.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                to={scratchCardPath}
                className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700"
              >
                Open Scratch Card
              </Link>
              <Link
                to={receiptPath}
                className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                Upload Scratch Receipt
              </Link>
            </div>
          </div>
        </section>
      )}

      {child && scratchCard && (isScratchCardSection || isReceiptSection) && (
        <section className="dashboard-tile mt-6 rounded-2xl p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-wrap-safe font-heading text-2xl text-primary">
                {isReceiptSection ? 'Scratch Card Receipt Upload' : 'Official Result Scratch Card'}
              </h2>
              <p className="text-wrap-safe mt-2 text-sm text-slate-600">
                {isReceiptSection
                  ? 'Use this page to upload your payment receipt after sending money into the official scratch-card account shown below.'
                  : `${scratchCard.amountLabel}. This payment is separate from normal school fees.`}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              {!isReceiptSection && (
                <Link
                  to={receiptPath}
                  className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-center text-xs font-semibold text-emerald-700"
                >
                  Open Receipt Upload
                </Link>
              )}
              {isReceiptSection && (
                <Link
                  to={scratchCardPath}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-center text-xs font-semibold text-slate-700"
                >
                  Back to Scratch Card
                </Link>
              )}
              <span className="max-w-full rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                {paymentRequests.length} request(s)
              </span>
            </div>
          </div>

          <div className="mt-5">
            <ResultScratchCard
              studentName={child.fullName || '—'}
              admissionNo={child.id || '—'}
              institution={child.institution || 'Model Academy'}
              studentCode={buildStudentCode(child) || child.id || '—'}
              term={releasedToken?.term || term}
              sessionId={releasedToken?.sessionId || sessionId}
              token={releasedToken?.token || ''}
            />
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[1.05fr,0.95fr]">
            <article className="surface-outline rounded-2xl p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Scratch Card Payment Account</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div className="min-w-0">
                  <p className="text-xs uppercase text-slate-500">Bank</p>
                  <p className="text-wrap-safe mt-1 text-sm font-semibold text-slate-900">{scratchCard.bankName}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs uppercase text-slate-500">Account Name</p>
                  <p className="text-wrap-safe mt-1 text-sm font-semibold text-slate-900">{scratchCard.accountName}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs uppercase text-slate-500">Account Number</p>
                  <p className="text-code-break mt-1 text-sm font-semibold tracking-[0.14em] text-slate-900 sm:tracking-[0.18em]">
                    {scratchCard.accountNumber}
                  </p>
                </div>
              </div>
            </article>

            <article className="payment-guide-card rounded-2xl p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Scratch Card Guide</p>
              <ol className="mt-3 grid gap-2 text-sm text-emerald-900">
                {(scratchCard.guide || []).map((step) => (
                  <li key={step} className="text-wrap-safe">{step}</li>
                ))}
              </ol>
            </article>
          </div>

          {isReceiptSection ? (
            <form onSubmit={submitReceipt} className="mt-4 grid gap-3 md:grid-cols-4">
              <input
                type="number"
                min="1"
                required
                value={receiptForm.amountPaid}
                onChange={(event) => setReceiptForm((prev) => ({ ...prev, amountPaid: event.target.value }))}
                placeholder="Amount paid"
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
              <select
                value={receiptForm.method}
                onChange={(event) => setReceiptForm((prev) => ({ ...prev, method: event.target.value }))}
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
              >
                <option>Bank transfer</option>
                <option>Cash through student</option>
                <option>POS</option>
              </select>
              <input
                type="file"
                accept="image/*,.pdf"
                required
                onChange={handleReceiptFile}
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={submittingReceipt || !receiptForm.receiptDataUrl}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submittingReceipt ? 'Submitting...' : 'Submit Receipt'}
              </button>
            </form>
          ) : (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-700">
              Scratch-card receipt upload now lives in its own portal section.
              {' '}
              <Link to={receiptPath} className="font-semibold text-primary underline decoration-2 underline-offset-4">
                Go to Receipt Upload
              </Link>
              .
            </div>
          )}

          {releasedToken && (
            <article className="payment-guide-card mt-4 rounded-2xl p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Released Token</p>
                  <p className="text-code-break mt-2 text-2xl font-bold tracking-[0.14em] text-emerald-950 sm:tracking-[0.2em]">{releasedToken.token}</p>
                  <p className="text-wrap-safe mt-2 text-sm text-emerald-900">
                    This token is now available for {role === 'student' ? 'your' : 'this child’s'} result access for {releasedToken.term}. Keep it exactly like a real scratch card credential.
                  </p>
                </div>
                <span className="max-w-full rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-semibold text-emerald-700">
                  Ready to use
                </span>
              </div>
            </article>
          )}

          {isReceiptSection && (
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Method</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Token</th>
                    <th className="px-4 py-3">Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentRequests.map((request) => (
                    <tr key={request.id} className="border-t border-slate-100">
                      <td className="px-4 py-3">NGN {request.amountPaid}</td>
                      <td className="px-4 py-3">{request.method}</td>
                      <td className="px-4 py-3">{request.status}</td>
                      <td className="px-4 py-3">
                        {request.tokenReleasedAt ? 'Released' : request.status === 'approved' ? 'Awaiting release' : 'Pending'}
                      </td>
                      <td className="px-4 py-3 text-wrap-safe">{request.createdAt ? new Date(request.createdAt).toLocaleString() : '—'}</td>
                    </tr>
                  ))}
                  {!paymentRequests.length && (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-slate-500">No receipt submissions yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </PortalLayout>
  );
}

export default RoleFeeStatus;
