import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import ErrorState from '../../components/ErrorState';
import PortalLayout from '../../components/PortalLayout';
import ProvisioningPanel from '../../components/ProvisioningPanel';
import { ADMIN_INSTITUTIONS, canonicalInstitution, institutionAccent } from '../../utils/adminInstitution';
import useDebouncedValue from '../../hooks/useDebouncedValue';

function validateAdmissionPeriod(period = {}) {
  const programs = period.programs || {};
  const windows = [
    { label: 'ATTAUFEEQ Model Academy', ...programs.modern },
    { label: 'Madrastul ATTAUFEEQ', ...programs.madrasa },
    { label: 'Quran Memorization', ...programs.memorization }
  ];

  for (const window of windows) {
    const start = window.startDate ? new Date(window.startDate).getTime() : null;
    const end = window.endDate ? new Date(window.endDate).getTime() : null;
    if (start != null && Number.isNaN(start)) {
      return `${window.label} start date is invalid.`;
    }
    if (end != null && Number.isNaN(end)) {
      return `${window.label} end date is invalid.`;
    }
    if (start != null && end != null && start > end) {
      return `${window.label} start date must be before its end date.`;
    }
  }

  return '';
}

function StatusBadge({ status }) {
  const normalized = String(status || '').trim().toLowerCase();
  const styles = {
    pending: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-emerald-100 text-emerald-800',
    rejected: 'bg-red-100 text-red-800'
  };

  return (
    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${styles[normalized] || 'bg-slate-100 text-slate-700'}`}>
      {normalized || 'pending'}
    </span>
  );
}

function VerificationBadge({ status }) {
  const normalized = String(status || '').trim().toLowerCase();
  const styles = {
    pending: 'bg-yellow-100 text-yellow-800',
    verified: 'bg-emerald-100 text-emerald-800',
    rejected: 'bg-red-100 text-red-800'
  };

  return (
    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${styles[normalized] || 'bg-slate-100 text-slate-700'}`}>
      {normalized || 'pending'}
    </span>
  );
}

function PaymentBadge({ status }) {
  const normalized = String(status || '').trim().toLowerCase();
  const styles = {
    pending: 'bg-amber-100 text-amber-800',
    confirmed: 'bg-emerald-100 text-emerald-800'
  };

  return (
    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${styles[normalized] || 'bg-slate-100 text-slate-700'}`}>
      {normalized || 'pending'}
    </span>
  );
}

function DeliveryBadge({ status }) {
  const normalized = String(status || '').trim().toLowerCase();
  const styles = {
    sent: 'bg-emerald-100 text-emerald-800',
    confirmed: 'bg-emerald-100 text-emerald-800',
    'manual-only': 'bg-amber-100 text-amber-800',
    disabled: 'bg-slate-200 text-slate-700',
    skipped: 'bg-slate-200 text-slate-700',
    pending: 'bg-slate-100 text-slate-600'
  };

  return (
    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${styles[normalized] || 'bg-slate-100 text-slate-700'}`}>
      {normalized || 'pending'}
    </span>
  );
}

const PREVIEWABLE_DOCUMENT_MIMES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp'
]);

function escapeHtml(value = '') {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizePhoneLink(value = '') {
  const digits = String(value || '').trim().replace(/[^\d+]/g, '');
  return digits || '';
}

function buildMailtoLink(email = '', fullName = '') {
  const normalizedEmail = String(email || '').trim();
  if (!normalizedEmail) return '';
  const params = new URLSearchParams({
    subject: `ATTAUFEEQ Model Academy Application Follow-up${fullName ? ` - ${fullName}` : ''}`
  });
  return `mailto:${normalizedEmail}?${params.toString()}`;
}

function resolveDocumentRequestPath(rawUrl = '') {
  const url = String(rawUrl || '').trim();
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/api/')) return url.replace(/^\/api/, '');
  return url;
}

function ManageAdmissions() {
  const { apiFetch, apiJson, user } = useAuth();
  const isAdmissionsDesk = user?.role === 'admissions';
  const managementBase = isAdmissionsDesk ? '/operations' : '/admin';

  const [admissions, setAdmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [institutionFilter, setInstitutionFilter] = useState('all');
  const [classFilter, setClassFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [sortBy, setSortBy] = useState('submitted-desc');
  const [expandedAdmissions, setExpandedAdmissions] = useState({});
  const [admissionPeriod, setAdmissionPeriod] = useState({
    enabled: true,
    startDate: '',
    endDate: '',
    programs: {
      modern: { enabled: true, startDate: '', endDate: '' },
      madrasa: { enabled: true, startDate: '', endDate: '' },
      memorization: { enabled: true, startDate: '', endDate: '' }
    }
  });
  const [periodSaving, setPeriodSaving] = useState(false);
  const [provisionedCredentials, setProvisionedCredentials] = useState([]);
  const [busyActionKey, setBusyActionKey] = useState('');
  const [openingDocumentKey, setOpeningDocumentKey] = useState('');
  const loadAdmissionsSeq = useRef(0);
  const admissionsQuerySeq = useRef(0);
  const periodValidationError = validateAdmissionPeriod(admissionPeriod);
  const canSavePeriod = !periodSaving && !periodValidationError;
  const debouncedSearch = useDebouncedValue(search.trim(), 300);

  async function openAdmissionDocument(document, admissionId, index) {
    const url = resolveDocumentRequestPath(document?.url || '');
    if (!url) return;

    const key = `${admissionId}:${index}`;
    const previewWindow = window.open('', '_blank');
    setOpeningDocumentKey(key);
    setError('');

    try {
      if (previewWindow) {
        previewWindow.document.write(`
          <!doctype html>
          <html lang="en">
            <head>
              <meta charset="utf-8" />
              <title>Opening document...</title>
              <style>
                body {
                  margin: 0;
                  min-height: 100vh;
                  display: grid;
                  place-items: center;
                  font-family: Arial, sans-serif;
                  background: #f8fafc;
                  color: #0f172a;
                }
                .card {
                  padding: 24px 28px;
                  border-radius: 18px;
                  background: white;
                  border: 1px solid #e2e8f0;
                  box-shadow: 0 12px 40px rgba(15, 23, 42, 0.08);
                  text-align: center;
                }
              </style>
            </head>
            <body>
              <div class="card">Opening uploaded document...</div>
            </body>
          </html>
        `);
        previewWindow.document.close();
      }

      const response = await apiFetch(url);
      if (!response.ok) {
        const raw = await response.text();
        let message = 'Unable to open uploaded document.';

        try {
          const payload = JSON.parse(raw);
          message = payload?.message || message;
        } catch {
          if (raw) message = raw;
        }

        throw new Error(message);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const mime = String(blob.type || document?.type || '').trim().toLowerCase();
      const fileName = document?.name || `Document ${index + 1}`;
      const safeFileName = escapeHtml(fileName);

      if (previewWindow) {
        if (PREVIEWABLE_DOCUMENT_MIMES.has(mime)) {
          const previewBody = mime.startsWith('image/')
            ? `<img src="${objectUrl}" alt="${safeFileName}" style="max-width:100%;height:auto;display:block;margin:0 auto;" />`
            : `<iframe src="${objectUrl}" title="${safeFileName}" style="width:100%;height:100%;border:0;" />`;

          previewWindow.document.write(`
            <!doctype html>
            <html lang="en">
              <head>
                <meta charset="utf-8" />
                <title>${safeFileName}</title>
                <style>
                  body {
                    margin: 0;
                    background: #0f172a;
                    color: white;
                    font-family: Arial, sans-serif;
                  }
                  .shell {
                    min-height: 100vh;
                    display: grid;
                    grid-template-rows: auto 1fr;
                  }
                  .topbar {
                    padding: 12px 16px;
                    background: rgba(15, 23, 42, 0.96);
                    border-bottom: 1px solid rgba(148, 163, 184, 0.24);
                    font-size: 14px;
                    font-weight: 600;
                  }
                  .viewer {
                    min-height: calc(100vh - 49px);
                    background: #f8fafc;
                  }
                  .viewer iframe,
                  .viewer img {
                    width: 100%;
                    min-height: calc(100vh - 49px);
                    object-fit: contain;
                    background: #f8fafc;
                  }
                </style>
              </head>
              <body>
                <div class="shell">
                  <div class="topbar">${safeFileName}</div>
                  <div class="viewer">${previewBody}</div>
                </div>
              </body>
            </html>
          `);
          previewWindow.document.close();
        } else {
          previewWindow.document.write(`
            <!doctype html>
            <html lang="en">
              <head>
                <meta charset="utf-8" />
                <title>${safeFileName}</title>
                <style>
                  body {
                    margin: 0;
                    min-height: 100vh;
                    display: grid;
                    place-items: center;
                    padding: 24px;
                    font-family: Arial, sans-serif;
                    background: #f8fafc;
                    color: #0f172a;
                  }
                  .card {
                    width: min(520px, 100%);
                    padding: 24px 28px;
                    border-radius: 18px;
                    background: white;
                    border: 1px solid #e2e8f0;
                    box-shadow: 0 12px 40px rgba(15, 23, 42, 0.08);
                  }
                  h1 {
                    margin: 0 0 12px;
                    font-size: 20px;
                  }
                  p {
                    margin: 0 0 16px;
                    line-height: 1.6;
                    color: #475569;
                  }
                  a {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    padding: 12px 18px;
                    border-radius: 999px;
                    background: #0f172a;
                    color: white;
                    text-decoration: none;
                    font-weight: 600;
                  }
                </style>
              </head>
              <body>
                <div class="card">
                  <h1>${safeFileName}</h1>
                  <p>This file type cannot be previewed directly in the browser. Use the button below to download and open it.</p>
                  <a href="${objectUrl}" download="${safeFileName}">Download file</a>
                </div>
              </body>
            </html>
          `);
          previewWindow.document.close();
        }
      } else {
        window.open(objectUrl, '_blank', 'noopener,noreferrer');
      }

      window.setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
      }, 300_000);
    } catch (err) {
      if (previewWindow) {
        previewWindow.close();
      }
      setError(err.message || 'Unable to open uploaded document.');
    } finally {
      setOpeningDocumentKey((prev) => (prev === key ? '' : prev));
    }
  }

  function handleAdmissionRemoved(data, admissionId, fallbackMessage) {
    setAdmissions((prev) => prev.filter((item) => item.id !== admissionId));
    if (data?.credentials?.length) {
      setProvisionedCredentials(data.credentials || []);
    }

    const promoted = Boolean(data?.student || data?.credentials?.length || data?.archived?.reason === 'promoted');
    setSuccess(
      promoted
        ? (data?.message || 'Student fully admitted and portal credentials delivered.')
        : (fallbackMessage || (data?.archived ? 'Admission archived and removed from active desk.' : 'Admission removed from active desk.'))
    );
  }

  const loadAdmissions = useCallback(async () => {
    const seq = ++loadAdmissionsSeq.current;
    setLoading(true);
    setError('');
    setSuccess('');
    setAdmissions([]);
    setProvisionedCredentials([]);
    setExpandedAdmissions({});

    try {
      const [data, periodData] = await Promise.all([
        apiJson(`${managementBase}/admissions`),
        isAdmissionsDesk ? Promise.resolve({ admissionPeriod: null }) : apiJson('/admin/admissions/period')
      ]);
      if (seq !== loadAdmissionsSeq.current) return;
      setAdmissions(data.admissions || []);
      if (!isAdmissionsDesk && periodData.admissionPeriod) {
        const p = periodData.admissionPeriod;
        const programs = p.programs || {};
        setAdmissionPeriod({
          enabled: p.enabled !== false,
          startDate: p.startDate ? p.startDate.slice(0, 16) : '',
          endDate: p.endDate ? p.endDate.slice(0, 16) : '',
          programs: {
            modern: {
              enabled: programs.modern?.enabled !== false,
              startDate: programs.modern?.startDate ? programs.modern.startDate.slice(0, 16) : '',
              endDate: programs.modern?.endDate ? programs.modern.endDate.slice(0, 16) : ''
            },
            madrasa: {
              enabled: programs.madrasa?.enabled !== false,
              startDate: programs.madrasa?.startDate ? programs.madrasa.startDate.slice(0, 16) : '',
              endDate: programs.madrasa?.endDate ? programs.madrasa.endDate.slice(0, 16) : ''
            },
            memorization: {
              enabled: programs.memorization?.enabled !== false,
              startDate: programs.memorization?.startDate ? programs.memorization.startDate.slice(0, 16) : '',
              endDate: programs.memorization?.endDate ? programs.memorization.endDate.slice(0, 16) : ''
            }
          }
        });
      }
    } catch (err) {
      if (seq !== loadAdmissionsSeq.current) return;
      setError(err.message || 'Unable to fetch admissions.');
    } finally {
      if (seq === loadAdmissionsSeq.current) {
        setLoading(false);
      }
    }
  }, [apiJson, isAdmissionsDesk, managementBase]);

  useEffect(() => {
    loadAdmissions();
  }, [loadAdmissions]);

  useEffect(() => {
    let active = true;
    const seq = ++admissionsQuerySeq.current;
    const params = new URLSearchParams();
    if (institutionFilter !== 'all') params.set('institution', institutionFilter);
    if (filter !== 'all') params.set('status', filter);
    if (paymentFilter !== 'all') params.set('paymentStatus', paymentFilter);
    if (classFilter) params.set('classId', classFilter);
    if (debouncedSearch) params.set('q', debouncedSearch);
    if (sortBy === 'submitted-desc') params.set('sort', 'submitted_desc');
    if (sortBy === 'submitted-asc') params.set('sort', 'submitted_asc');
    if (sortBy === 'name-asc') params.set('sort', 'name_asc');
    if (sortBy === 'name-desc') params.set('sort', 'name_desc');

    async function refreshAdmissions() {
      try {
        const query = params.toString();
        const data = await apiJson(`${managementBase}/admissions${query ? `?${query}` : ''}`);
        if (!active || seq !== admissionsQuerySeq.current) return;
        setAdmissions(data.admissions || []);
      } catch {
        // keep last loaded list on transient errors
      }
    }

    refreshAdmissions();
    return () => {
      active = false;
    };
  }, [apiJson, classFilter, debouncedSearch, filter, institutionFilter, managementBase, paymentFilter, sortBy]);

  async function saveAdmissionPeriod(event) {
    event.preventDefault();
    setPeriodSaving(true);
    setError('');
    setSuccess('');
    try {
      const data = await apiJson('/admin/admissions/period', {
        method: 'PUT',
        body: admissionPeriod
      });
      const period = data.admissionPeriod || admissionPeriod;
      const programs = period.programs || {};
      setAdmissionPeriod({
        enabled: period.enabled !== false,
        startDate: period.startDate ? period.startDate.slice(0, 16) : '',
        endDate: period.endDate ? period.endDate.slice(0, 16) : '',
        programs: {
          modern: {
            enabled: programs.modern?.enabled !== false,
            startDate: programs.modern?.startDate ? programs.modern.startDate.slice(0, 16) : '',
            endDate: programs.modern?.endDate ? programs.modern.endDate.slice(0, 16) : ''
          },
          madrasa: {
            enabled: programs.madrasa?.enabled !== false,
            startDate: programs.madrasa?.startDate ? programs.madrasa.startDate.slice(0, 16) : '',
            endDate: programs.madrasa?.endDate ? programs.madrasa.endDate.slice(0, 16) : ''
          },
          memorization: {
            enabled: programs.memorization?.enabled !== false,
            startDate: programs.memorization?.startDate ? programs.memorization.startDate.slice(0, 16) : '',
            endDate: programs.memorization?.endDate ? programs.memorization.endDate.slice(0, 16) : ''
          }
        }
      });
      setSuccess('Admission period saved.');
    } catch (err) {
      setError(err.message || 'Unable to save period.');
    } finally {
      setPeriodSaving(false);
    }
  }

  async function updateStatus(admissionId, status) {
    const actionKey = `status:${admissionId}:${status}`;
    setError('');
    setSuccess('');
    if (status !== 'approved') {
      setProvisionedCredentials([]);
    }

    try {
      setBusyActionKey(actionKey);
      const data = await apiJson(`${managementBase}/admissions/${admissionId}`, {
        method: 'PUT',
        body: { status }
      });
      if (data.deleted) {
        handleAdmissionRemoved(data, admissionId);
        return;
      }
      if (data.admission) {
        setAdmissions((prev) => prev.map((item) => (item.id === admissionId ? data.admission : item)));
      }
      if (status === 'approved') {
        setProvisionedCredentials([]);
        const delivery = data?.delivery || null;
        const sentCount = Number(delivery?.sent || 0);
        const failedCount = Number(delivery?.failed || 0);
        const skippedCount = Number(delivery?.skipped || 0) + Number(delivery?.disabled || 0);
        const baseMessage = isAdmissionsDesk
          ? 'Admission approved and forwarded to admin for full admission.'
          : 'Admission approved. Confirm payment and requirements to fully admit.';

        if (sentCount > 0 && failedCount === 0) {
          setSuccess(`${baseMessage} Approval notice email sent.`);
        } else if (sentCount > 0 && failedCount > 0) {
          setSuccess(`${baseMessage} Some approval emails were sent, but one or more deliveries failed.`);
        } else if (skippedCount > 0 && sentCount === 0 && failedCount === 0) {
          setSuccess(`${baseMessage} Email notice was not sent in this environment.`);
        } else if (failedCount > 0) {
          setSuccess(`${baseMessage} Email delivery failed.`);
        } else {
          setSuccess(baseMessage);
        }
      }
    } catch (err) {
      setError(err.message || 'Unable to update status.');
    } finally {
      setBusyActionKey((prev) => (prev === actionKey ? '' : prev));
    }
  }

  async function promoteAdmission(admission) {
    const actionKey = `promote:${admission?.id || ''}`;
    setError('');
    setSuccess('');
    const paymentStatus = admission?.paymentStatus || 'pending';
    const verificationStatus = admission?.verificationStatus || 'pending';
    const canConfirm =
      admission?.status === 'approved' &&
      verificationStatus === 'verified' &&
      paymentStatus === 'confirmed';

    if (!canConfirm) {
      setError('Confirm verification and payment before issuing full admission.');
      return;
    }

    try {
      setBusyActionKey(actionKey);
      const data = await apiJson(`/admin/admissions/${admission.id}/promote`, { method: 'POST' });
      if (data.deleted) {
        setAdmissions((prev) => prev.filter((item) => item.id !== admission.id));
      }
      setProvisionedCredentials(data.credentials || []);
      setSuccess('Student fully admitted and portal credentials delivered.');
    } catch (err) {
      setError(err.message || 'Unable to promote admission.');
    } finally {
      setBusyActionKey((prev) => (prev === actionKey ? '' : prev));
    }
  }

  async function deleteAdmission(admissionId) {
    const actionKey = `delete:${admissionId}`;
    setError('');
    setSuccess('');
    if (!window.confirm('Delete this admission record? It will be archived for reference.')) return;

    try {
      setBusyActionKey(actionKey);
      const data = await apiJson(`/admin/admissions/${admissionId}`, { method: 'DELETE' });
      if (data.deleted) {
        setAdmissions((prev) => prev.filter((item) => item.id !== admissionId));
        setSuccess('Admission deleted and archived.');
      }
    } catch (err) {
      setError(err.message || 'Unable to delete admission.');
    } finally {
      setBusyActionKey((prev) => (prev === actionKey ? '' : prev));
    }
  }

  async function updateVerification(admissionId, verificationStatus) {
    const actionKey = `verification:${admissionId}:${verificationStatus}`;
    setError('');
    try {
      const notes = String(window.prompt('Verification notes (optional):', '') || '').trim();
      setBusyActionKey(actionKey);
      const data = await apiJson(`${managementBase}/admissions/${admissionId}/verification`, {
        method: 'PUT',
        body: { verificationStatus, notes }
      });
      if (data.deleted) {
        handleAdmissionRemoved(data, admissionId);
        return;
      }
      if (data.admission) {
        setAdmissions((prev) => prev.map((item) => (item.id === admissionId ? data.admission : item)));
      }
    } catch (err) {
      setError(err.message || 'Unable to update verification.');
    } finally {
      setBusyActionKey((prev) => (prev === actionKey ? '' : prev));
    }
  }

  async function updatePaymentStatus(admissionId, paymentStatus) {
    const actionKey = `payment:${admissionId}:${paymentStatus}`;
    setError('');
    setSuccess('');
    try {
      const notes = String(window.prompt('Payment notes (optional):', '') || '').trim();
      setBusyActionKey(actionKey);
      const data = await apiJson(`${managementBase}/admissions/${admissionId}/payment`, {
        method: 'PUT',
        body: { paymentStatus, notes }
      });
      if (data.deleted) {
        setAdmissions((prev) => prev.filter((item) => item.id !== admissionId));
        if (data.credentials) {
          setProvisionedCredentials(data.credentials || []);
        }
        setSuccess('Payment confirmed. Portal access was issued and the student is now fully registered.');
        return;
      }
      if (data.admission) {
        setAdmissions((prev) => prev.map((item) => (item.id === admissionId ? data.admission : item)));
      }
      if (data.credentials?.length) {
        setProvisionedCredentials(data.credentials || []);
      }
      setSuccess(paymentStatus === 'confirmed' ? 'Payment confirmed for this admission.' : 'Payment status reset to pending.');
    } catch (err) {
      setError(err.message || 'Unable to update payment.');
    } finally {
      setBusyActionKey((prev) => (prev === actionKey ? '' : prev));
    }
  }

  async function updateDeliveryStatus(admissionId, portalDeliveryStatus) {
    const actionKey = `delivery:${admissionId}:${portalDeliveryStatus}`;
    setError('');
    setSuccess('');
    try {
      const notes = String(window.prompt('Delivery notes (optional):', '') || '').trim();
      setBusyActionKey(actionKey);
      const data = await apiJson(`/admin/admissions/${admissionId}/delivery`, {
        method: 'PUT',
        body: { portalDeliveryStatus, notes }
      });
      if (data.admission) {
        setAdmissions((prev) => prev.map((item) => (item.id === admissionId ? data.admission : item)));
      }
      setSuccess('Portal delivery status updated.');
    } catch (err) {
      setError(err.message || 'Unable to update delivery status.');
    } finally {
      setBusyActionKey((prev) => (prev === actionKey ? '' : prev));
    }
  }

  async function scheduleInterview(admissionId) {
    const actionKey = `interview:${admissionId}`;
    setError('');
    setSuccess('');
    try {
      const interviewDate = String(window.prompt('Interview date/time (YYYY-MM-DD HH:mm):', '') || '').trim();
      if (!interviewDate) return;
      const interviewMode = String(window.prompt('Interview mode (Physical/Online/Phone):', 'Physical') || '').trim();
      if (!interviewMode) return;

      setBusyActionKey(actionKey);
      const data = await apiJson(`${managementBase}/admissions/${admissionId}/interview`, {
        method: 'PUT',
        body: { interviewDate, interviewMode }
      });
      setAdmissions((prev) => prev.map((item) => (item.id === admissionId ? data.admission : item)));
      const deliveryStatus = String(data?.delivery?.status || '').trim();
      if (deliveryStatus === 'sent') {
        setSuccess('Interview scheduled and guardian email sent.');
      } else if (deliveryStatus === 'disabled' || deliveryStatus === 'skipped') {
        setSuccess('Interview scheduled. Guardian email was not sent in this environment.');
      } else if (deliveryStatus === 'failed') {
        setSuccess('Interview scheduled, but guardian email delivery failed.');
      } else {
        setSuccess('Interview scheduled.');
      }
    } catch (err) {
      setError(err.message || 'Unable to schedule interview.');
    } finally {
      setBusyActionKey((prev) => (prev === actionKey ? '' : prev));
    }
  }

  async function generateOffer(admissionId) {
    const actionKey = `offer:${admissionId}`;
    setError('');
    setSuccess('');
    try {
      setBusyActionKey(actionKey);
      const data = await apiJson(`${managementBase}/admissions/${admissionId}/offer`, {
        method: 'POST',
        body: { offerStatus: 'sent' }
      });
      setAdmissions((prev) => prev.map((item) => (item.id === admissionId ? data.admission : item)));
      setSuccess('Offer generated.');
    } catch (err) {
      setError(err.message || 'Unable to generate offer.');
    } finally {
      setBusyActionKey((prev) => (prev === actionKey ? '' : prev));
    }
  }

  function toggleExpanded(admissionId) {
    setExpandedAdmissions((prev) => ({ ...prev, [admissionId]: !prev[admissionId] }));
  }

  const classFilterOptions = useMemo(() => {
    const map = new Map();
    admissions.forEach((item) => {
      const label = item.classLabel || item.level || 'Unassigned';
      if (!map.has(item.classId || label)) {
        map.set(item.classId || label, { id: item.classId || label, label });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [admissions]);

  const filteredAdmissions = useMemo(
    () =>
      admissions
        .filter((item) => {
          const byStatus = filter === 'all' ? true : item.status === filter;
          const byInstitution = institutionFilter === 'all'
            ? true
            : canonicalInstitution(item.institution) === canonicalInstitution(institutionFilter);
          const byClass = classFilter ? (item.classId || item.classLabel || item.level || '') === classFilter : true;
          const paymentStatus = item.paymentStatus || 'pending';
          const byPayment = paymentFilter === 'all' ? true : paymentStatus === paymentFilter;
          const query = debouncedSearch.trim().toLowerCase();
          const bySearch =
            !query ||
            `${item.fullName} ${item.guardianName} ${item.phone || ''} ${item.email || ''} ${item.studentEmail || ''}`
              .toLowerCase()
              .includes(query);
          return byStatus && byInstitution && byClass && byPayment && bySearch;
        })
        .sort((a, b) => {
          if (sortBy === 'name-asc') return a.fullName.localeCompare(b.fullName);
          if (sortBy === 'name-desc') return b.fullName.localeCompare(a.fullName);
          const timeA = new Date(a.submittedAt || a.createdAt || 0).getTime();
          const timeB = new Date(b.submittedAt || b.createdAt || 0).getTime();
          return sortBy === 'submitted-asc' ? timeA - timeB : timeB - timeA;
        }),
    [admissions, classFilter, debouncedSearch, filter, institutionFilter, paymentFilter, sortBy]
  );

  const groupedAdmissions = useMemo(() => {
    if (isAdmissionsDesk) {
      const grouped = new Map();
      const sorted = [...filteredAdmissions].sort((a, b) => {
        const institutionSort = String(a.institution || '').localeCompare(String(b.institution || ''));
        if (institutionSort !== 0) return institutionSort;
        const classA = a.classLabel || a.level || 'Unassigned';
        const classB = b.classLabel || b.level || 'Unassigned';
        const classSort = String(classA).localeCompare(String(classB));
        if (classSort !== 0) return classSort;
        return String(a.fullName || '').localeCompare(String(b.fullName || ''));
      });

      sorted.forEach((item) => {
        const classLabel = item.classLabel || item.level || 'Unassigned';
        const key = `${item.institution || 'Unknown'}::${classLabel}`;
        if (!grouped.has(key)) {
          grouped.set(key, { institution: item.institution || 'Unknown', classLabel, rows: [] });
        }
        grouped.get(key).rows.push(item);
      });

      return Array.from(grouped.values());
    }

    return ADMIN_INSTITUTIONS
      .filter((institution) => institutionFilter === 'all' || institutionFilter === institution)
      .map((institution) => ({
        institution,
        rows: filteredAdmissions.filter((item) => canonicalInstitution(item.institution) === canonicalInstitution(institution))
      }));
  }, [filteredAdmissions, institutionFilter, isAdmissionsDesk]);

  return (
    <PortalLayout
      role={user?.role || 'admin'}
      title="Admission Operations"
      subtitle={
        isAdmissionsDesk
          ? 'Review documents, approve candidates, and confirm payments. Once approved + verified, confirming payment auto-issues portal access and completes registration.'
          : 'Review documents, approve, verify, or confirm payment. As soon as every requirement is satisfied, portal access is issued automatically and the student is fully admitted.'
      }
      actions={
        <div className="admin-toolbar">
          <label className="field-shell min-w-[11rem]">
            <span className="field-label">Status</span>
            <select value={filter} onChange={(e) => setFilter(e.target.value)} className="form-select">
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>
          <label className="field-shell min-w-[14rem]">
            <span className="field-label">Institution</span>
            <select
              value={institutionFilter}
              onChange={(e) => setInstitutionFilter(e.target.value)}
              className="form-select"
            >
              <option value="all">All Institutions</option>
              {ADMIN_INSTITUTIONS.map((institution) => (
                <option key={institution} value={institution}>
                  {institution}
                </option>
              ))}
            </select>
          </label>
          <label className="field-shell min-w-[12rem]">
            <span className="field-label">Class</span>
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="form-select"
            >
              <option value="">All Classes</option>
              {classFilterOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field-shell min-w-[11rem]">
            <span className="field-label">Payment</span>
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              className="form-select"
            >
              <option value="all">All Payments</option>
              <option value="confirmed">Confirmed</option>
              <option value="pending">Pending</option>
            </select>
          </label>
          <label className="field-shell min-w-[12rem]">
            <span className="field-label">Sort</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="form-select"
            >
              <option value="submitted-desc">Latest submitted</option>
              <option value="submitted-asc">Oldest submitted</option>
              <option value="name-asc">Name A-Z</option>
              <option value="name-desc">Name Z-A</option>
            </select>
          </label>
        </div>
      }
    >
      {loading && <div className="status-banner mt-4">Loading admissions...</div>}
      {error && <ErrorState compact title="Unable to manage admissions" message={error} className="mt-4" onRetry={loadAdmissions} />}
      {success && <div className="status-banner mt-4">{success}</div>}
      <ProvisioningPanel
        title="Full admission access issued"
        description="After confirmation, the student and parent can sign in immediately with these temporary credentials and will be forced to set new passwords."
        records={provisionedCredentials}
      />
      {!isAdmissionsDesk && periodValidationError && (
        <p className="status-banner status-banner--warning mt-4">{periodValidationError}</p>
      )}

      {!isAdmissionsDesk && (
        <div className="admin-surface mt-4">
          <h3 className="text-sm font-semibold text-slate-800">Admission Period</h3>
          <p className="mt-1 text-xs text-slate-600">Applicants can upload documents only within the configured window when enabled.</p>
          <form onSubmit={saveAdmissionPeriod} className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="dashboard-tile lg:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">Master Admissions Switch</h3>
                  <p className="mt-1 text-xs text-slate-600">Turn this off to close all public admissions, even if program windows are otherwise open.</p>
                </div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={admissionPeriod.enabled !== false}
                    onChange={(e) =>
                      setAdmissionPeriod((prev) => ({
                        ...prev,
                        enabled: e.target.checked
                      }))
                    }
                  />
                  Admissions enabled
                </label>
              </div>
            </div>
            <div className="dashboard-tile">
              <h3 className="text-sm font-semibold text-slate-800">ATTAUFEEQ Model Academy (Modern)</h3>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={admissionPeriod.programs?.modern?.enabled !== false}
                    disabled={!admissionPeriod.enabled}
                    onChange={(e) =>
                      setAdmissionPeriod((prev) => ({
                        ...prev,
                        programs: {
                          ...prev.programs,
                          modern: { ...prev.programs.modern, enabled: e.target.checked }
                        }
                      }))
                    }
                  />
                  Window enabled
                </label>
                <input
                  type="datetime-local"
                  value={admissionPeriod.programs?.modern?.startDate || ''}
                  disabled={!admissionPeriod.enabled}
                  onChange={(e) =>
                    setAdmissionPeriod((prev) => ({
                      ...prev,
                      programs: {
                        ...prev.programs,
                        modern: { ...prev.programs.modern, startDate: e.target.value }
                      }
                    }))
                  }
                  className="form-field"
                />
                <input
                  type="datetime-local"
                  value={admissionPeriod.programs?.modern?.endDate || ''}
                  disabled={!admissionPeriod.enabled}
                  onChange={(e) =>
                    setAdmissionPeriod((prev) => ({
                      ...prev,
                      programs: {
                        ...prev.programs,
                        modern: { ...prev.programs.modern, endDate: e.target.value }
                      }
                    }))
                  }
                  className="form-field"
                />
              </div>
            </div>
            <div className="dashboard-tile">
              <h3 className="text-sm font-semibold text-slate-800">Madrastul ATTAUFEEQ (Madrasa)</h3>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={admissionPeriod.programs?.madrasa?.enabled !== false}
                    disabled={!admissionPeriod.enabled}
                    onChange={(e) =>
                      setAdmissionPeriod((prev) => ({
                        ...prev,
                        programs: {
                          ...prev.programs,
                          madrasa: { ...prev.programs.madrasa, enabled: e.target.checked }
                        }
                      }))
                    }
                  />
                  Window enabled
                </label>
                <input
                  type="datetime-local"
                  value={admissionPeriod.programs?.madrasa?.startDate || ''}
                  disabled={!admissionPeriod.enabled}
                  onChange={(e) =>
                    setAdmissionPeriod((prev) => ({
                      ...prev,
                      programs: {
                        ...prev.programs,
                        madrasa: { ...prev.programs.madrasa, startDate: e.target.value }
                      }
                    }))
                  }
                  className="form-field"
                />
                <input
                  type="datetime-local"
                  value={admissionPeriod.programs?.madrasa?.endDate || ''}
                  disabled={!admissionPeriod.enabled}
                  onChange={(e) =>
                    setAdmissionPeriod((prev) => ({
                      ...prev,
                      programs: {
                        ...prev.programs,
                        madrasa: { ...prev.programs.madrasa, endDate: e.target.value }
                      }
                    }))
                  }
                  className="form-field"
                />
              </div>
            </div>
            <div className="dashboard-tile">
              <h3 className="text-sm font-semibold text-slate-800">Quran Memorization</h3>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={admissionPeriod.programs?.memorization?.enabled !== false}
                    disabled={!admissionPeriod.enabled}
                    onChange={(e) =>
                      setAdmissionPeriod((prev) => ({
                        ...prev,
                        programs: {
                          ...prev.programs,
                          memorization: { ...prev.programs.memorization, enabled: e.target.checked }
                        }
                      }))
                    }
                  />
                  Window enabled
                </label>
                <input
                  type="datetime-local"
                  value={admissionPeriod.programs?.memorization?.startDate || ''}
                  disabled={!admissionPeriod.enabled}
                  onChange={(e) =>
                    setAdmissionPeriod((prev) => ({
                      ...prev,
                      programs: {
                        ...prev.programs,
                        memorization: { ...prev.programs.memorization, startDate: e.target.value }
                      }
                    }))
                  }
                  className="form-field"
                />
                <input
                  type="datetime-local"
                  value={admissionPeriod.programs?.memorization?.endDate || ''}
                  disabled={!admissionPeriod.enabled}
                  onChange={(e) =>
                    setAdmissionPeriod((prev) => ({
                      ...prev,
                      programs: {
                        ...prev.programs,
                        memorization: { ...prev.programs.memorization, endDate: e.target.value }
                      }
                    }))
                  }
                  className="form-field"
                />
              </div>
            </div>
            <div className="lg:col-span-2">
              <button
                type="submit"
                disabled={!canSavePeriod}
                className="interactive-button"
              >
                {periodSaving ? 'Saving...' : 'Save Period'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="admin-surface mt-4">
        <label className="field-shell">
          <span className="field-label">Search</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search applicant, guardian, or phone"
            className="form-field w-full"
          />
          <span className="field-help">Search across applicant, guardian, phone, and email details.</span>
        </label>
      </div>

      <div className="mt-8 space-y-6">
        {groupedAdmissions.map((group) => (
          <section key={isAdmissionsDesk ? `${group.institution}::${group.classLabel}` : group.institution} className="admin-surface">
            <div className="admin-toolbar">
              <div>
                <h2 className="font-heading text-2xl text-primary">
                  {isAdmissionsDesk ? (group.classLabel || 'Unassigned class') : group.institution}
                </h2>
                {isAdmissionsDesk && (
                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">{group.institution}</p>
                )}
                <p className="mt-2 text-sm text-slate-600">Open a record to review uploaded documents and the full workflow history.</p>
              </div>
              <span className={`rounded-full border px-3 py-2 text-xs font-semibold ${institutionAccent(group.institution)}`}>
                {group.rows.length} applications
              </span>
            </div>

            <div className="data-table-shell mt-5">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="px-4 py-3">Applicant</th>
                    <th className="px-4 py-3">Class</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Verification</th>
                    <th className="px-4 py-3">Payment</th>
                    <th className="px-4 py-3">Portal Delivery</th>
                    <th className="px-4 py-3">Documents</th>
                    <th className="px-4 py-3">Workflow</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((admission) => {
                    const open = Boolean(expandedAdmissions[admission.id]);
                    const paymentStatus = admission.paymentStatus || 'pending';
                    const verificationStatus = admission.verificationStatus || 'pending';
                    const deliveryStatus = admission.portalDeliveryStatus || admission.portalDeliverySummary?.status || 'pending';
                    const hasPortalDelivery = Boolean(admission.portalDelivery?.length);
                    const isPromoted = Boolean(admission.promotedStudentId);
                    const canApprove = admission.status !== 'approved';
                    const canReject = admission.status !== 'rejected' && !isPromoted;
                    const canVerify = verificationStatus !== 'verified';
                    const canRejectDocuments = verificationStatus !== 'rejected';
                    const canConfirmPayment = paymentStatus !== 'confirmed';
                    const canResetPayment = paymentStatus === 'confirmed';
                    const canScheduleInterview = admission.status !== 'rejected' && !isPromoted;
                    const canGenerateOffer =
                      admission.status === 'approved' &&
                      verificationStatus === 'verified' &&
                      !isPromoted &&
                      !['sent', 'accepted', 'declined'].includes(admission.offerStatus || '');
                    const canConfirmDelivery = !isAdmissionsDesk && hasPortalDelivery && deliveryStatus !== 'confirmed';
                    const canConfirm =
                      !isAdmissionsDesk &&
                      admission.status === 'approved' &&
                      verificationStatus === 'verified' &&
                      paymentStatus === 'confirmed' &&
                      !isPromoted;
                    const rowBusy = busyActionKey.includes(`:${admission.id}`) || busyActionKey.endsWith(admission.id);

                    return (
                      <Fragment key={admission.id}>
                        <tr className="border-t border-slate-100">
                          <td className="px-4 py-3">
                            <p className="font-semibold text-slate-800">{admission.fullName}</p>
                            <p className="mt-1 text-xs text-slate-500">{admission.guardianName} • {admission.phone}</p>
                            {admission.forwardedToAdminAt && (
                              <p className="mt-1 text-xs text-emerald-700">
                                Forwarded to admin on {new Date(admission.forwardedToAdminAt).toLocaleString()}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3">{admission.classLabel || admission.level}</td>
                          <td className="px-4 py-3"><StatusBadge status={admission.status} /></td>
                          <td className="px-4 py-3"><VerificationBadge status={admission.verificationStatus} /></td>
                          <td className="px-4 py-3"><PaymentBadge status={admission.paymentStatus || 'pending'} /></td>
                          <td className="px-4 py-3"><DeliveryBadge status={deliveryStatus} /></td>
                          <td className="px-4 py-3">{admission.documents?.length || 0}</td>
                          <td className="px-4 py-3">{admission.workflowHistory?.length || 0} events</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-2">
                              <button type="button" onClick={() => toggleExpanded(admission.id)} className="interactive-button">
                                {open ? 'Hide' : 'Open'}
                              </button>
                              <button type="button" disabled={!canApprove || rowBusy} onClick={() => updateStatus(admission.id, 'approved')} className="interactive-button border-emerald-300 text-emerald-700">
                                Approve
                              </button>
                              <button type="button" disabled={!canReject || rowBusy} onClick={() => updateStatus(admission.id, 'rejected')} className="interactive-button border-red-300 text-red-700">
                                Reject
                              </button>
                              <button type="button" disabled={!canVerify || rowBusy} onClick={() => updateVerification(admission.id, 'verified')} className="interactive-button">
                                Verify
                              </button>
                            </div>
                          </td>
                        </tr>
                        {open && (
                          <tr className="border-t border-slate-100 bg-slate-50/70">
                            <td className="px-4 py-4" colSpan={9}>
                              <div className="grid gap-4 xl:grid-cols-4">
                                <article className="dashboard-tile">
                                  <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Uploaded documents</h3>
                                  <div className="mt-3 space-y-2">
                                    {admission.documents?.map((document, index) => (
                                      <div key={`${admission.id}-doc-${index}`} className="rounded-xl border border-slate-200 px-3 py-3 text-sm text-slate-700">
                                        {document?.url ? (
                                          <button
                                            type="button"
                                            onClick={() => openAdmissionDocument(document, admission.id, index)}
                                            disabled={openingDocumentKey === `${admission.id}:${index}`}
                                            className="interactive-link font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                                          >
                                            {openingDocumentKey === `${admission.id}:${index}`
                                              ? 'Opening...'
                                              : (document.name || `Document ${index + 1}`)}
                                          </button>
                                        ) : (
                                          <span>{typeof document === 'string' ? document : document?.name || `Document ${index + 1}`}</span>
                                        )}
                                      </div>
                                    ))}
                                    {!admission.documents?.length && <p className="text-sm text-slate-500">No documents uploaded yet.</p>}
                                  </div>
                                </article>

                                <article className="dashboard-tile">
                                  <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Workflow history</h3>
                                  <div className="mt-3 space-y-3">
                                    {admission.workflowHistory?.map((event) => (
                                      <div key={event.id} className="rounded-xl border border-slate-200 px-3 py-3">
                                        <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{event.action}</p>
                                        <p className="mt-1 text-sm text-slate-700">{event.detail}</p>
                                        <p className="mt-1 text-xs text-slate-500">{new Date(event.createdAt).toLocaleString()}</p>
                                      </div>
                                    ))}
                                    {!admission.workflowHistory?.length && <p className="text-sm text-slate-500">No workflow events recorded yet.</p>}
                                  </div>
                                </article>

                                <article className="dashboard-tile">
                                  <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Applicant contact</h3>
                                  <div className="mt-3 space-y-3 text-sm text-slate-700">
                                    <div>
                                      <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Guardian</p>
                                      <p className="mt-1 font-semibold">{admission.guardianName || 'N/A'}</p>
                                    </div>
                                    <div>
                                      <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Phone</p>
                                      <p className="mt-1">{admission.phone || 'N/A'}</p>
                                    </div>
                                    <div>
                                      <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Email</p>
                                      <p className="mt-1">{admission.email || 'N/A'}</p>
                                    </div>
                                    <div>
                                      <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Student Email</p>
                                      <p className="mt-1">{admission.studentEmail || 'N/A'}</p>
                                    </div>
                                    <div className="flex flex-wrap gap-2 pt-2">
                                      {normalizePhoneLink(admission.phone) && (
                                        <a
                                          href={`tel:${normalizePhoneLink(admission.phone)}`}
                                          className="interactive-button border-emerald-200 text-emerald-700"
                                        >
                                          Call guardian
                                        </a>
                                      )}
                                      {buildMailtoLink(admission.email, admission.fullName) && (
                                        <a
                                          href={buildMailtoLink(admission.email, admission.fullName)}
                                          className="interactive-button"
                                        >
                                          Email guardian
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                </article>

                                <article className="dashboard-tile">
                                  <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Portal delivery</h3>
                                  <div className="mt-3 space-y-3 text-sm text-slate-700">
                                    <div>
                                      <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Status</p>
                                      <p className="mt-1 font-semibold">{deliveryStatus}</p>
                                      {admission.portalDeliveryAt && (
                                        <p className="mt-1 text-xs text-slate-500">
                                          Last update: {new Date(admission.portalDeliveryAt).toLocaleString()}
                                        </p>
                                      )}
                                    </div>
                                    <div className="space-y-2">
                                      {(admission.portalDelivery || []).map((record) => (
                                        <div key={`${admission.id}-${record.userId}`} className="rounded-xl border border-slate-200 px-3 py-2">
                                          <p className="text-xs uppercase tracking-[0.14em] text-slate-500">{record.label}</p>
                                          <p className="mt-1 font-semibold">{record.email}</p>
                                          <p className="mt-1 text-xs text-slate-600">Delivery: {record.emailDeliveryStatus}</p>
                                        </div>
                                      ))}
                                      {!admission.portalDelivery?.length && (
                                        <p className="text-sm text-slate-500">No portal delivery recorded yet.</p>
                                      )}
                                    </div>
                                    {!isAdmissionsDesk && (
                                      <div className="flex flex-wrap gap-2 pt-2">
                                        <button
                                          type="button"
                                          disabled={!canConfirmDelivery || rowBusy}
                                          onClick={() => updateDeliveryStatus(admission.id, 'confirmed')}
                                          className="interactive-button border-emerald-200 text-emerald-700"
                                        >
                                          Mark Delivery Confirmed
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </article>
                              </div>

                              <div className="mt-4 flex flex-wrap gap-2">
                                <button type="button" disabled={!canRejectDocuments || rowBusy} onClick={() => updateVerification(admission.id, 'rejected')} className="interactive-button border-red-300 text-red-700">
                                  Reject Documents
                                </button>
                                {paymentStatus === 'confirmed' ? (
                                  <button type="button" disabled={!canResetPayment || rowBusy} onClick={() => updatePaymentStatus(admission.id, 'pending')} className="interactive-button border-amber-300 text-amber-700">
                                    Reset Payment
                                  </button>
                                ) : (
                                  <button type="button" disabled={!canConfirmPayment || rowBusy} onClick={() => updatePaymentStatus(admission.id, 'confirmed')} className="interactive-button border-emerald-300 text-emerald-700">
                                    Confirm Payment
                                  </button>
                                )}
                                <button type="button" disabled={!canScheduleInterview || rowBusy} onClick={() => scheduleInterview(admission.id)} className="interactive-button">
                                  Schedule Interview
                                </button>
                                <button type="button" disabled={!canGenerateOffer || rowBusy} onClick={() => generateOffer(admission.id)} className="interactive-button">
                                  Generate Offer
                                </button>
                                {!isAdmissionsDesk && (
                                  <button
                                    type="button"
                                    onClick={() => promoteAdmission(admission)}
                                    disabled={!canConfirm || rowBusy}
                                    className="interactive-button"
                                  >
                                    Confirm Full Admission
                                  </button>
                                )}
                                {!isAdmissionsDesk && (
                                  <button
                                    type="button"
                                    onClick={() => deleteAdmission(admission.id)}
                                    disabled={rowBusy}
                                    className="interactive-button border-red-300 text-red-700"
                                  >
                                    Delete Admission
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  {!group.rows.length && (
                    <tr>
                      <td className="px-4 py-8 text-center text-slate-500" colSpan={9}>
                        No admissions found for this institution and filter set.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </PortalLayout>
  );
}

export default ManageAdmissions;
