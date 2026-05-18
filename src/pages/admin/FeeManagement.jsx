import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import PortalLayout from '../../components/PortalLayout';
import { ADMIN_INSTITUTIONS, canonicalInstitution, institutionAccent } from '../../utils/adminInstitution';
import { buildStudentCode } from '../../utils/studentCode';

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase();
}

function isCountableActiveStudent(item) {
  const status = normalizeStatus(item?.accountStatus);
  return Boolean(item?.userId && item?.portalEmail && ['pending', 'provisioned', 'active'].includes(status));
}

function createReceiptObjectUrl(receiptDataUrl) {
  const value = String(receiptDataUrl || '').trim();
  if (!value.startsWith('data:')) {
    return { url: value, mimeType: '' };
  }

  const [header, data] = value.split(',', 2);
  if (!header || !data) {
    throw new Error('Receipt data is malformed.');
  }

  const mimeType = header.slice(5).split(';')[0] || 'application/octet-stream';
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return {
    url: URL.createObjectURL(new Blob([bytes], { type: mimeType })),
    mimeType
  };
}

function FeeManagement({ role = '', section = 'all' }) {
  const { apiJson, user } = useAuth();
  const resolvedRole = role || user?.role || 'admin';
  const isReceiptDeskOnly = resolvedRole === 'admissions' && section === 'receipt-desk';
  const showReceiptDesk = resolvedRole !== 'admissions' || isReceiptDeskOnly;
  const managementBase = resolvedRole === 'admissions' ? '/operations' : '/admin';
  const defaultInstitution = ADMIN_INSTITUTIONS[0];
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [plans, setPlans] = useState([]);
  const [payments, setPayments] = useState([]);
  const [paymentRequests, setPaymentRequests] = useState([]);
  const [defaulters, setDefaulters] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [creatingPlan, setCreatingPlan] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState('');
  const [deletingPlanId, setDeletingPlanId] = useState('');
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [deletingPaymentId, setDeletingPaymentId] = useState('');
  const [reviewingRequestId, setReviewingRequestId] = useState('');
  const [showPlans, setShowPlans] = useState(true);
  const [showPayments, setShowPayments] = useState(true);
  const [showDefaulters, setShowDefaulters] = useState(true);
  const [sessionId, setSessionId] = useState('');
  const [institutionFilter, setInstitutionFilter] = useState(defaultInstitution);
  const [classFilter, setClassFilter] = useState('');
  const [termFilter, setTermFilter] = useState('First Term');
  const [receiptPreview, setReceiptPreview] = useState(null);

  const [planForm, setPlanForm] = useState({ classId: '', term: 'First Term', amount: '' });
  const [paymentForm, setPaymentForm] = useState({
    classId: '',
    studentId: '',
    entryMode: 'select',
    manualStudentId: '',
    bulkStudents: '',
    term: 'First Term',
    amountPaid: '',
    method: 'Bank Transfer'
  });
  const [studentSearch, setStudentSearch] = useState('');
  const loadDataSeq = useRef(0);

  const loadData = useCallback(async (options = {}) => {
    const requestId = loadDataSeq.current + 1;
    loadDataSeq.current = requestId;
    const preserveSuccess = Boolean(options.preserveSuccess);
    setError('');
    if (!preserveSuccess) {
      setSuccess('');
    }
    setClasses([]);
    setStudents([]);
    setPlans([]);
    setPayments([]);
    setPaymentRequests([]);
    setDefaulters([]);

    try {
      const sessionQuery = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : '';
      const defaulterParams = new URLSearchParams({ term: termFilter });
      if (sessionId) defaulterParams.set('sessionId', sessionId);
      const [sessionsData, classesData, studentsData, plansData, paymentsData, defaultersData] = await Promise.all([
        apiJson('/results/sessions'),
        apiJson(`${managementBase}/classes`),
        apiJson(`${managementBase}/students`),
        apiJson(`/fees/admin/plans${sessionQuery}`),
        apiJson(`/fees/admin/payments${sessionQuery}`),
        apiJson(`/fees/admin/defaulters?${defaulterParams.toString()}`)
      ]);

      const sessionRows = sessionsData.sessions || [];
      const active = sessionsData.activeSession || sessionRows.find((item) => item.isActive) || sessionRows[0] || null;
      if (loadDataSeq.current !== requestId) return;
      setSessions(sessionRows);
      setSessionId((prev) =>
        prev && sessionRows.some((session) => session.id === prev)
          ? prev
          : active?.id || ''
      );
      setClasses(classesData.classes || []);
      setStudents(studentsData.students || []);
      setPlans(plansData.plans || []);
      setPayments(paymentsData.payments || []);
      setPaymentRequests(paymentsData.paymentRequests || []);
      setDefaulters(defaultersData.defaulters || []);
    } catch (err) {
      if (loadDataSeq.current !== requestId) return;
      setError(err.message || 'Unable to load fee module.');
    }
  }, [apiJson, managementBase, sessionId, termFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => () => {
    if (receiptPreview?.url?.startsWith('blob:')) {
      URL.revokeObjectURL(receiptPreview.url);
    }
  }, [receiptPreview]);

  const scopedClasses = useMemo(
    () => classes.filter((item) => canonicalInstitution(item.institution) === canonicalInstitution(institutionFilter)),
    [classes, institutionFilter]
  );
  const institutionStudents = useMemo(
    () => students.filter((item) => canonicalInstitution(item.institution) === canonicalInstitution(institutionFilter)),
    [institutionFilter, students]
  );
  const scopedStudents = useMemo(
    () => institutionStudents.filter((item) => (classFilter ? item.classId === classFilter : true)),
    [classFilter, institutionStudents]
  );

  useEffect(() => {
    setPlanForm((prev) => ({
      ...prev,
      classId: scopedClasses.some((item) => item.id === prev.classId) ? prev.classId : scopedClasses[0]?.id || ''
    }));
    if (classFilter && !scopedClasses.some((item) => item.id === classFilter)) {
      setClassFilter('');
    }
  }, [classFilter, scopedClasses]);

  useEffect(() => {
    setPaymentForm((prev) => ({
      ...prev,
      classId: scopedClasses.some((item) => item.id === prev.classId) ? prev.classId : scopedClasses[0]?.id || ''
    }));
  }, [scopedClasses]);

  const paymentEligibleStudents = useMemo(
    () => institutionStudents.filter((item) => (paymentForm.classId ? item.classId === paymentForm.classId : true)),
    [institutionStudents, paymentForm.classId]
  );
  const paymentStudents = useMemo(
    () => paymentEligibleStudents
      .filter((item) => {
        if (!studentSearch.trim()) return true;
        const needle = studentSearch.trim().toLowerCase();
        return `${item.fullName} ${buildStudentCode(item)} ${item.id}`.toLowerCase().includes(needle);
      }),
    [paymentEligibleStudents, studentSearch]
  );

  const manualMatch = useMemo(
    () => {
      const value = paymentForm.manualStudentId.trim();
      if (!value) return null;
      return (
        paymentEligibleStudents.find((item) => item.id === value) ||
        paymentEligibleStudents.find((item) => buildStudentCode(item) === value.toUpperCase()) ||
        null
      );
    },
    [paymentEligibleStudents, paymentForm.manualStudentId]
  );
  const planAmount = Number(planForm.amount);
  const paymentAmount = Number(paymentForm.amountPaid);
  const hasValidSelectedStudent = useMemo(
    () => paymentStudents.some((item) => item.id === paymentForm.studentId),
    [paymentForm.studentId, paymentStudents]
  );
  const bulkStudentIdentifiers = useMemo(
    () =>
      paymentForm.bulkStudents
        .split(/\r?\n|,/)
        .map((entry) => entry.trim())
        .filter(Boolean),
    [paymentForm.bulkStudents]
  );
  const bulkMatches = useMemo(() => {
    const classStudents = paymentEligibleStudents;
    return bulkStudentIdentifiers.map((identifier) => {
      const match = classStudents.find((student) => {
        const code = buildStudentCode(student);
        return (
          student.id === identifier ||
          code.toLowerCase() === identifier.toLowerCase() ||
          String(student.fullName || '').trim().toLowerCase() === identifier.toLowerCase()
        );
      });
      return { identifier, match };
    });
  }, [bulkStudentIdentifiers, paymentEligibleStudents]);
  const canCreatePlan = useMemo(
    () => {
      const duplicatePlan = plans.some(
        (item) =>
          item.id !== editingPlanId &&
          item.classId === planForm.classId &&
          item.term === planForm.term &&
          item.sessionId === sessionId
      );
      return Boolean(sessionId && scopedClasses.length && planForm.classId) &&
        Number.isFinite(planAmount) &&
        planAmount > 0 &&
        !duplicatePlan;
    },
    [editingPlanId, planAmount, planForm.classId, planForm.term, plans, scopedClasses.length, sessionId]
  );
  const canRecordPayment = useMemo(() => {
    const hasValidTarget = paymentForm.entryMode === 'manual'
      ? Boolean(manualMatch)
      : paymentForm.entryMode === 'bulk'
        ? bulkStudentIdentifiers.length > 0
        : hasValidSelectedStudent;

    return Boolean(sessionId) &&
      hasValidTarget &&
      Number.isFinite(paymentAmount) &&
      paymentAmount > 0 &&
      Boolean(String(paymentForm.method || '').trim());
  }, [
    bulkStudentIdentifiers.length,
    hasValidSelectedStudent,
    manualMatch,
    paymentAmount,
    paymentForm.entryMode,
    paymentForm.method,
    sessionId
  ]);

  useEffect(() => {
    setPaymentForm((prev) => ({
      ...prev,
      studentId: paymentStudents.some((item) => item.id === prev.studentId) ? prev.studentId : paymentStudents[0]?.id || ''
    }));
  }, [paymentStudents]);

  useEffect(() => {
    if (paymentForm.entryMode !== 'bulk') return;
    setPaymentForm((prev) => ({ ...prev, bulkStudents: '' }));
  }, [paymentForm.classId, paymentForm.entryMode]);

  const filteredPlans = useMemo(
    () => plans
      .filter((item) => scopedClasses.some((classItem) => classItem.id === item.classId))
      .filter((item) => (classFilter ? item.classId === classFilter : true))
      .filter((item) => item.term === termFilter),
    [classFilter, plans, scopedClasses, termFilter]
  );
  const filteredPayments = useMemo(
    () => payments
      .filter((item) => scopedStudents.some((student) => student.id === item.studentId))
      .filter((item) => item.term === termFilter),
    [payments, scopedStudents, termFilter]
  );
  const filteredPaymentRequests = useMemo(
    () => paymentRequests
      .filter((item) => scopedStudents.some((student) => student.id === item.studentId))
      .filter((item) => item.term === termFilter),
    [paymentRequests, scopedStudents, termFilter]
  );
  const filteredDefaulters = useMemo(
    () => defaulters
      .filter((item) => canonicalInstitution(item.student?.institution) === canonicalInstitution(institutionFilter))
      .filter((item) => (classFilter ? item.student?.classId === classFilter : true)),
    [classFilter, defaulters, institutionFilter]
  );

  function resetPlanForm(nextClassId = '') {
    setEditingPlanId('');
    setPlanForm({
      classId: nextClassId || scopedClasses[0]?.id || '',
      term: 'First Term',
      amount: ''
    });
  }

  async function createPlan(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setCreatingPlan(true);

    try {
      const method = editingPlanId ? 'PUT' : 'POST';
      const path = editingPlanId ? `/fees/admin/plans/${editingPlanId}` : '/fees/admin/plans';
      await apiJson(path, {
        method,
        body: {
          ...planForm,
          classId: planForm.classId.trim(),
          term: planForm.term.trim(),
          sessionId
        }
      });
      setSuccess(editingPlanId ? 'Fee plan updated.' : 'Fee plan created.');
      resetPlanForm(planForm.classId.trim());
      void loadData({ preserveSuccess: true });
    } catch (err) {
      setError(err.message || `Unable to ${editingPlanId ? 'update' : 'create'} fee plan.`);
    } finally {
      setCreatingPlan(false);
    }
  }

  function startEditPlan(plan) {
    setError('');
    setSuccess('');
    setEditingPlanId(plan.id);
    setPlanForm({
      classId: plan.classId || '',
      term: plan.term || 'First Term',
      amount: String(plan.amount ?? '')
    });
  }

  async function deletePlan(planId) {
    if (!window.confirm('Delete this fee plan?')) return;
    setError('');
    setSuccess('');
    setDeletingPlanId(planId);
    try {
      await apiJson(`/fees/admin/plans/${planId}`, { method: 'DELETE' });
      if (editingPlanId === planId) {
        resetPlanForm(planForm.classId);
      }
      setSuccess('Fee plan deleted.');
      void loadData({ preserveSuccess: true });
    } catch (err) {
      setError(err.message || 'Unable to delete fee plan.');
    } finally {
      setDeletingPlanId('');
    }
  }

  async function recordPayment(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setRecordingPayment(true);

    try {
      if (paymentForm.entryMode === 'bulk') {
        const identifiers = bulkStudentIdentifiers;
        if (!identifiers.length) {
          throw new Error('Provide at least one student name or code.');
        }

        const data = await apiJson('/fees/admin/payments/bulk', {
          method: 'POST',
          body: {
            classId: paymentForm.classId,
            term: paymentForm.term.trim(),
            amountPaid: paymentForm.amountPaid,
            method: paymentForm.method.trim(),
            sessionId,
            studentIdentifiers: identifiers
          }
        });

        setSuccess(`Bulk payment recorded. ${data.createdCount || 0} saved, ${data.errorCount || 0} errors.`);
        void loadData({ preserveSuccess: true });
      } else {
        const selectedStudentId =
          paymentForm.entryMode === 'manual'
            ? manualMatch?.id || paymentForm.manualStudentId.trim()
            : paymentForm.studentId;

        if (!selectedStudentId) {
          throw new Error('Select a student or enter a valid student code.');
        }

        const data = await apiJson('/fees/admin/payments', {
          method: 'POST',
          body: {
            studentId: selectedStudentId,
            term: paymentForm.term.trim(),
            amountPaid: paymentForm.amountPaid,
            method: paymentForm.method.trim(),
            sessionId
          }
        });

        setSuccess('Payment recorded.');
        setPayments((prev) => [data.payment, ...prev]);
        void loadData({ preserveSuccess: true });
      }
    } catch (err) {
      setError(err.message || 'Unable to record payment.');
    } finally {
      setRecordingPayment(false);
    }
  }

  async function deletePayment(paymentId) {
    if (!window.confirm('Delete this payment record?')) return;
    setError('');
    setSuccess('');
    setDeletingPaymentId(paymentId);
    try {
      await apiJson(`/fees/admin/payments/${paymentId}`, { method: 'DELETE' });
      setSuccess('Payment deleted.');
      void loadData({ preserveSuccess: true });
    } catch (err) {
      setError(err.message || 'Unable to delete payment.');
    } finally {
      setDeletingPaymentId('');
    }
  }

  async function reviewPaymentRequest(requestId, status) {
    setError('');
    setSuccess('');
    setReviewingRequestId(requestId);
    try {
      await apiJson(`/fees/admin/payment-requests/${requestId}`, {
        method: 'PUT',
        body: { status }
      });
      setSuccess(status === 'approved' ? 'Receipt confirmed and payment recorded.' : 'Receipt rejected.');
      void loadData({ preserveSuccess: true });
    } catch (err) {
      setError(err.message || 'Unable to review receipt.');
    } finally {
      setReviewingRequestId('');
    }
  }

  async function releaseResultToken(requestId) {
    setError('');
    setSuccess('');
    setReviewingRequestId(requestId);
    try {
      await apiJson(`/fees/admin/payment-requests/${requestId}/release-token`, {
        method: 'POST'
      });
      setSuccess('Result token released to the student and parent dashboards.');
      void loadData({ preserveSuccess: true });
    } catch (err) {
      setError(err.message || 'Unable to release result token.');
    } finally {
      setReviewingRequestId('');
    }
  }

  function openReceiptPreview(request) {
    setError('');

    try {
      if (receiptPreview?.url?.startsWith('blob:')) {
        URL.revokeObjectURL(receiptPreview.url);
      }

      const preview = createReceiptObjectUrl(request.receiptDataUrl);
      setReceiptPreview({
        requestId: request.id,
        receiptName: request.receiptName || 'receipt',
        url: preview.url,
        mimeType: preview.mimeType
      });
    } catch (err) {
      setError(err.message || 'Unable to preview receipt.');
    }
  }

  function closeReceiptPreview() {
    if (receiptPreview?.url?.startsWith('blob:')) {
      URL.revokeObjectURL(receiptPreview.url);
    }
    setReceiptPreview(null);
  }

  return (
    <PortalLayout
      role={resolvedRole}
      title={isReceiptDeskOnly ? `Receipt Upload Desk (${termFilter})` : resolvedRole === 'admissions' ? 'Fee Management' : 'Fee Management'}
      subtitle={isReceiptDeskOnly
        ? 'Parent and student receipt uploads wait here for admissions confirmation before payment records and result-token release.'
        : resolvedRole === 'admissions'
        ? 'Manage school fee plans and payment records for the selected institution and session.'
        : 'Finance is now institution-aware and can be drilled down to a single class.'}
    >
      {!isReceiptDeskOnly && (
      <div className="grid gap-4 lg:grid-cols-3">
        {ADMIN_INSTITUTIONS.map((institution) => (
          <article key={institution} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className={`inline-flex max-w-full text-wrap-safe rounded-full border px-3 py-1 text-xs font-semibold ${institutionAccent(institution)}`}>
              {institution}
            </p>
            <p className="mt-4 text-3xl font-bold text-slate-900">
              {students
                .filter((item) => canonicalInstitution(item.institution) === canonicalInstitution(institution))
                .filter((item) => isCountableActiveStudent(item)).length}
            </p>
            <p className="mt-2 text-sm text-slate-600">Active students within this finance section.</p>
          </article>
        ))}
      </div>
      )}

      <div className="mt-6 flex flex-wrap gap-3 rounded-[28px] border border-slate-200 bg-white p-5">
        <select value={sessionId} onChange={(e) => setSessionId(e.target.value)} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm sm:w-auto">
          {!sessions.length && <option value="">No sessions available</option>}
          {sessions.map((session) => (
            <option key={session.id} value={session.id}>
              {session.sessionName} {session.isActive ? '(Active)' : ''}
            </option>
          ))}
        </select>
        <select value={institutionFilter} onChange={(e) => setInstitutionFilter(e.target.value)} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm sm:w-auto">
          {ADMIN_INSTITUTIONS.map((institution) => <option key={institution}>{institution}</option>)}
        </select>
        <select value={termFilter} onChange={(e) => setTermFilter(e.target.value)} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm sm:w-auto">
          {['First Term', 'Second Term', 'Third Term'].map((term) => <option key={term}>{term}</option>)}
        </select>
        <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm sm:w-auto">
          <option value="">All Classes</option>
          {scopedClasses.map((item) => <option key={item.id} value={item.id}>{item.name} {item.arm}</option>)}
        </select>
      </div>

      {!sessionId && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          No academic session is available yet. Create or activate a session before recording fees.
        </div>
      )}

      {!isReceiptDeskOnly && (
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-heading text-2xl text-primary">{editingPlanId ? 'Edit Fee Plan' : 'Create Fee Plan'}</h2>
          <form onSubmit={createPlan} className="mt-3 grid gap-3 sm:grid-cols-3">
            {scopedClasses.length ? (
              <select value={planForm.classId} onChange={(e) => setPlanForm((prev) => ({ ...prev, classId: e.target.value }))} className="w-full rounded-2xl border border-slate-300 px-3 py-3 text-sm">
                {scopedClasses.map((item) => <option key={item.id} value={item.id}>{item.name} {item.arm}</option>)}
              </select>
            ) : (
              <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:col-span-3">
                Add a class in this institution before creating fee plans.
              </p>
            )}
            <select value={planForm.term} onChange={(e) => setPlanForm((prev) => ({ ...prev, term: e.target.value }))} className="w-full rounded-2xl border border-slate-300 px-3 py-3 text-sm">
              {['First Term', 'Second Term', 'Third Term'].map((term) => <option key={term}>{term}</option>)}
            </select>
            <input type="number" min="0.01" step="0.01" value={planForm.amount} onChange={(e) => setPlanForm((prev) => ({ ...prev, amount: e.target.value }))} placeholder="Amount" className="w-full rounded-2xl border border-slate-300 px-3 py-3 text-sm" />
            <button
              type="submit"
              disabled={creatingPlan || !canCreatePlan}
              className="rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 sm:col-span-3"
            >
              {creatingPlan ? (editingPlanId ? 'Saving Plan...' : 'Adding Plan...') : (editingPlanId ? 'Save Changes' : 'Add Plan')}
            </button>
            {editingPlanId && (
              <button
                type="button"
                onClick={() => resetPlanForm(planForm.classId)}
                disabled={creatingPlan}
                className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60 sm:col-span-3"
              >
                Cancel Edit
              </button>
            )}
            {planForm.classId && plans.some((item) => item.id !== editingPlanId && item.classId === planForm.classId && item.term === planForm.term && item.sessionId === sessionId) && (
              <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:col-span-3">
                A fee plan already exists for this class, term, and session.
              </p>
            )}
          </form>
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-heading text-2xl text-primary">Record Payment</h2>
          <form onSubmit={recordPayment} className="mt-3 grid gap-3 sm:grid-cols-4">
            <select
              value={paymentForm.classId}
              onChange={(e) => setPaymentForm((prev) => ({ ...prev, classId: e.target.value }))}
              className="w-full rounded-2xl border border-slate-300 px-3 py-3 text-sm"
            >
              {scopedClasses.map((item) => (
                <option key={item.id} value={item.id}>{item.name} {item.arm}</option>
              ))}
            </select>
            <select
              value={paymentForm.entryMode}
              onChange={(e) => setPaymentForm((prev) => ({ ...prev, entryMode: e.target.value }))}
              className="w-full rounded-2xl border border-slate-300 px-3 py-3 text-sm"
            >
              <option value="select">Select Student</option>
              <option value="manual">Manual Entry</option>
              {resolvedRole === 'admissions' && <option value="bulk">Bulk Entry</option>}
            </select>
            <input
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              placeholder="Search student"
              className="w-full rounded-2xl border border-slate-300 px-3 py-3 text-sm"
            />
            <select
              value={paymentForm.term}
              onChange={(e) => setPaymentForm((prev) => ({ ...prev, term: e.target.value }))}
              className="rounded-2xl border border-slate-300 px-3 py-3 text-sm"
            >
              {['First Term', 'Second Term', 'Third Term'].map((term) => <option key={term}>{term}</option>)}
            </select>

            {paymentForm.entryMode === 'manual' ? (
              <>
                <input
                  value={paymentForm.manualStudentId}
                  onChange={(e) => setPaymentForm((prev) => ({ ...prev, manualStudentId: e.target.value }))}
                  placeholder="Student Code or ID"
                  className="rounded-2xl border border-slate-300 px-3 py-3 text-sm sm:col-span-2"
                />
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600 sm:col-span-2">
                  {manualMatch
                    ? `Matched: ${manualMatch.fullName} (${buildStudentCode(manualMatch)})`
                    : 'Enter a valid student code or ID'}
                </div>
              </>
            ) : paymentForm.entryMode === 'bulk' ? (
              <>
                <textarea
                  value={paymentForm.bulkStudents}
                  onChange={(e) => setPaymentForm((prev) => ({ ...prev, bulkStudents: e.target.value }))}
                  placeholder="Paste student names or codes, one per line"
                  rows={5}
                  className="rounded-2xl border border-slate-300 px-3 py-3 text-sm sm:col-span-4"
                />
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-600 sm:col-span-4">
                  {bulkMatches.length
                    ? `${bulkMatches.filter((item) => item.match).length} matched, ${bulkMatches.filter((item) => !item.match).length} not found`
                    : 'Enter student names or codes to see matches.'}
                </div>
              </>
            ) : (
              <>
                <select
                  value={paymentForm.studentId}
                  onChange={(e) => setPaymentForm((prev) => ({ ...prev, studentId: e.target.value }))}
                  className="w-full rounded-2xl border border-slate-300 px-3 py-3 text-sm sm:col-span-4"
                >
                  {paymentStudents.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.fullName} ({buildStudentCode(item)})
                    </option>
                  ))}
                  {!paymentStudents.length && <option value="">No students in this class</option>}
                </select>
                {!paymentStudents.length && (
                  <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:col-span-4">
                    No students are available in this class for the selected institution.
                  </p>
                )}
              </>
            )}

            <input
              type="number"
              min="0.01"
              step="0.01"
              value={paymentForm.amountPaid}
              onChange={(e) => setPaymentForm((prev) => ({ ...prev, amountPaid: e.target.value }))}
              placeholder="Amount Paid"
              className="w-full rounded-2xl border border-slate-300 px-3 py-3 text-sm"
            />
            <input
              value={paymentForm.method}
              onChange={(e) => setPaymentForm((prev) => ({ ...prev, method: e.target.value }))}
              placeholder="Method"
              className="w-full rounded-2xl border border-slate-300 px-3 py-3 text-sm"
            />
            <button
              type="submit"
              disabled={recordingPayment || !canRecordPayment}
              className="rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 sm:col-span-4"
            >
              {recordingPayment ? 'Recording Payment...' : 'Record Payment'}
            </button>
          </form>
        </section>
      </div>
      )}

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {success && <p className="mt-4 text-sm text-emerald-700">{success}</p>}

      <section className={`mt-8 grid gap-6 ${isReceiptDeskOnly ? 'lg:grid-cols-1' : 'lg:grid-cols-3'}`}>
        {!isReceiptDeskOnly && (
        <article className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-heading text-xl text-primary">Fee Plans ({termFilter})</h3>
          <div className="mt-2 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            <span>Plan rows</span>
            <button
              type="button"
              onClick={() => setShowPlans((prev) => !prev)}
              className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
            >
              {showPlans ? 'Hide rows' : 'Show rows'}
            </button>
          </div>
          <ul className="mt-3 space-y-2 text-sm">
            {!showPlans && (
              <li className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                Rows are hidden. Click “Show rows” to display fee plans.
              </li>
            )}
            {showPlans && filteredPlans.map((plan) => {
              const classItem = classes.find((item) => item.id === plan.classId);
              return (
                <li key={plan.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <p className="text-wrap-safe pr-1">
                    {classItem?.label || `${classItem?.name || plan.classId} ${classItem?.arm || ''}`} | {plan.term} | NGN {plan.amount}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => startEditPlan(plan)}
                      disabled={creatingPlan || deletingPlanId === plan.id}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => deletePlan(plan.id)}
                      disabled={creatingPlan || deletingPlanId === plan.id}
                      className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {deletingPlanId === plan.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </article>
        )}

        {!isReceiptDeskOnly && (
        <article className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-heading text-xl text-primary">Payments ({termFilter})</h3>
          <div className="mt-2 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            <span>Payment rows</span>
            <button
              type="button"
              onClick={() => setShowPayments((prev) => !prev)}
              className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
            >
              {showPayments ? 'Hide rows' : 'Show rows'}
            </button>
          </div>
          <ul className="mt-3 space-y-2 text-sm">
            {!showPayments && (
              <li className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                Rows are hidden. Click “Show rows” to display payments.
              </li>
            )}
            {showPayments && filteredPayments.map((payment) => {
              const student = students.find((item) => item.id === payment.studentId);
              return (
                <li key={payment.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <p className="text-wrap-safe pr-1">
                    {student?.fullName || payment.studentId} | {buildStudentCode(student || { id: payment.studentId })} | {payment.term} | NGN {payment.amountPaid}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => deletePayment(payment.id)}
                      disabled={deletingPaymentId === payment.id}
                      className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {deletingPaymentId === payment.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </article>
        )}

        {showReceiptDesk && (
        <article className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-heading text-xl text-primary">Receipt Upload Desk ({termFilter})</h3>
          <p className="mt-2 text-sm text-slate-600">
            Parent and student receipt uploads wait here for admissions confirmation before payment records and result-token release.
          </p>
          {receiptPreview && (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">
                  Receipt preview: {receiptPreview.receiptName}
                </p>
                <div className="flex flex-wrap gap-2 text-xs">
                  <a
                    href={receiptPreview.url}
                    download={receiptPreview.receiptName}
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 font-semibold text-slate-700"
                  >
                    Download receipt
                  </a>
                  <button
                    type="button"
                    onClick={closeReceiptPreview}
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 font-semibold text-slate-700"
                  >
                    Close preview
                  </button>
                </div>
              </div>
              {receiptPreview.mimeType.includes('pdf') ? (
                <iframe
                  title="Receipt preview"
                  src={receiptPreview.url}
                  className="mt-3 h-[32rem] w-full rounded-xl border border-slate-200 bg-white"
                />
              ) : (
                <img
                  src={receiptPreview.url}
                  alt="Payment receipt preview"
                  className="mt-3 max-h-[32rem] w-full rounded-xl border border-slate-200 bg-white object-contain"
                />
              )}
            </div>
          )}
          <ul className="mt-3 space-y-2 text-sm">
            {filteredPaymentRequests.map((request) => {
              const student = students.find((item) => item.id === request.studentId);
              return (
                <li key={request.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <p className="text-wrap-safe pr-1">
                    {student?.fullName || request.studentName || request.studentId} | {request.term} | NGN {request.amountPaid} | {request.status}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Submitted by {request.submittedByRole || 'parent'} {request.submittedByEmail ? `• ${request.submittedByEmail}` : ''}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    {request.receiptDataUrl && (
                      <button
                        type="button"
                        onClick={() => openReceiptPreview(request)}
                        className="rounded-md border border-slate-300 bg-white px-2 py-1 font-semibold text-slate-700"
                      >
                        Preview receipt
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => reviewPaymentRequest(request.id, 'approved')}
                      disabled={request.status !== 'pending' || reviewingRequestId === request.id}
                      className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 font-semibold text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => reviewPaymentRequest(request.id, 'rejected')}
                      disabled={request.status !== 'pending' || reviewingRequestId === request.id}
                      className="rounded-md border border-red-300 bg-red-50 px-2 py-1 font-semibold text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      onClick={() => releaseResultToken(request.id)}
                      disabled={request.status !== 'approved' || Boolean(request.releasedTokenId) || reviewingRequestId === request.id}
                      className="rounded-md border border-primary/25 bg-primary/10 px-2 py-1 font-semibold text-primary disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {request.releasedTokenId ? 'Token Released' : 'Release Token'}
                    </button>
                  </div>
                </li>
              );
            })}
            {!filteredPaymentRequests.length && (
              <li className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-6 text-center text-slate-500">
                No receipt confirmations in this scope.
              </li>
            )}
          </ul>
        </article>
        )}

        {!isReceiptDeskOnly && (
        <article className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-heading text-xl text-primary">Defaulters ({termFilter})</h3>
          <div className="mt-2 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            <span>Defaulter rows</span>
            <button
              type="button"
              onClick={() => setShowDefaulters((prev) => !prev)}
              className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
            >
              {showDefaulters ? 'Hide rows' : 'Show rows'}
            </button>
          </div>
          <ul className="mt-3 space-y-2 text-sm">
            {!showDefaulters && (
              <li className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                Rows are hidden. Click “Show rows” to display defaulters.
              </li>
            )}
            {showDefaulters && filteredDefaulters.map((item) => (
              <li key={item.student.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-wrap-safe">
                {item.student.fullName} | Balance: NGN {item.balance}
              </li>
            ))}
          </ul>
        </article>
        )}
      </section>
    </PortalLayout>
  );
}

export default FeeManagement;
