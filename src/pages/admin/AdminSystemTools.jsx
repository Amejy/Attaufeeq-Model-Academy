import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import PortalLayout from '../../components/PortalLayout';

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function AdminSystemTools() {
  const { apiJson } = useAuth();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [bulkFixing, setBulkFixing] = useState(false);
  const [reconcilingPreview, setReconcilingPreview] = useState(false);
  const [reconcilingApply, setReconcilingApply] = useState(false);
  const [bulkOptions, setBulkOptions] = useState({
    copyGuardianEmail: false,
    setMissingPaymentStatus: true
  });
  const [bulkReport, setBulkReport] = useState(null);
  const [reconcileReport, setReconcileReport] = useState(null);
  const canRunBulkFix = bulkOptions.copyGuardianEmail || bulkOptions.setMissingPaymentStatus;

  async function forceSave() {
    setError('');
    setSuccess('');
    setSaving(true);

    try {
      await apiJson('/admin/system/save', { method: 'POST' });
      setSuccess('Store saved to disk successfully.');
    } catch (err) {
      setError(err.message || 'Unable to save store.');
    } finally {
      setSaving(false);
    }
  }

  async function downloadBackup() {
    setError('');
    setSuccess('');
    setBackingUp(true);

    try {
      const data = await apiJson('/admin/system/backup');

      const stamp = String(data.generatedAt || new Date().toISOString()).replace(/[:.]/g, '-');
      downloadJson(`attaufiq-backup-${stamp}.json`, data);
      setSuccess('Backup downloaded successfully.');
    } catch (err) {
      setError(err.message || 'Unable to generate backup.');
    } finally {
      setBackingUp(false);
    }
  }

  async function refreshPortalState() {
    setError('');
    setSuccess('');
    setRefreshing(true);

    try {
      await apiJson('/admin/system/refresh', { method: 'POST' });
      setSuccess('Portal state refreshed successfully.');
    } catch (err) {
      setError(err.message || 'Unable to refresh portal state.');
    } finally {
      setRefreshing(false);
    }
  }

  async function runBulkFix() {
    if (!canRunBulkFix) {
      setError('Select at least one bulk-fix action before running the update.');
      setSuccess('');
      return;
    }
    setError('');
    setSuccess('');
    setBulkFixing(true);
    setBulkReport(null);

    try {
      const data = await apiJson('/admin/admissions/bulk-fix', {
        method: 'POST',
        body: bulkOptions
      });
      setBulkReport(data);
      setSuccess('Bulk update completed.');
    } catch (err) {
      setError(err.message || 'Unable to run bulk update.');
    } finally {
      setBulkFixing(false);
    }
  }

  async function runReconciliation({ dryRun }) {
    setError('');
    setSuccess('');
    if (dryRun) {
      setReconcilingPreview(true);
    } else {
      setReconcilingApply(true);
    }

    try {
      const data = await apiJson('/admin/system/reconcile-students', {
        method: 'POST',
        body: { dryRun }
      });
      setReconcileReport(data.report || null);
      setSuccess(data.message || (dryRun ? 'Reconciliation preview completed.' : 'Reconciliation completed.'));
    } catch (err) {
      setError(err.message || 'Unable to reconcile admissions and students.');
    } finally {
      if (dryRun) {
        setReconcilingPreview(false);
      } else {
        setReconcilingApply(false);
      }
    }
  }

  return (
    <PortalLayout
      role="admin"
      title="System Tools"
      subtitle="Persistence and backup utilities for the admin."
    >

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-heading text-2xl text-primary">Data Persistence</h2>
        <p className="mt-2 text-sm text-slate-700">
          Force a persistence sync and download an administrative backup snapshot for offline review.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={forceSave}
            disabled={saving}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Run Persistence Sync'}
          </button>
          <button
            type="button"
            onClick={refreshPortalState}
            disabled={refreshing}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshing ? 'Refreshing...' : 'Refresh Portal State'}
          </button>
          <button
            type="button"
            onClick={downloadBackup}
            disabled={backingUp}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {backingUp ? 'Preparing...' : 'Download Backup Snapshot'}
          </button>
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-heading text-2xl text-primary">Admission Data Fixer</h2>
        <p className="mt-2 text-sm text-slate-700">
          Bulk-fix legacy admissions missing student emails or payment status fields.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={bulkOptions.copyGuardianEmail}
              onChange={(e) => setBulkOptions((prev) => ({ ...prev, copyGuardianEmail: e.target.checked }))}
            />
            Copy guardian email into missing student email fields.
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={bulkOptions.setMissingPaymentStatus}
              onChange={(e) => setBulkOptions((prev) => ({ ...prev, setMissingPaymentStatus: e.target.checked }))}
            />
            Set missing payment status to pending.
          </label>
        </div>
        <div className="mt-4">
          <button
            type="button"
            onClick={runBulkFix}
            disabled={bulkFixing || !canRunBulkFix}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {bulkFixing ? 'Updating...' : 'Run Admission Bulk Fix'}
          </button>
        </div>
        {!canRunBulkFix && (
          <p className="mt-3 text-sm text-amber-700">
            Select at least one bulk-fix action before running the update.
          </p>
        )}
        {bulkReport && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <p>Scanned: {bulkReport.updated?.scanned ?? 0}</p>
            <p>Student emails filled: {bulkReport.updated?.studentEmailFilled ?? 0}</p>
            <p>Payment statuses set: {bulkReport.updated?.paymentStatusSet ?? 0}</p>
            <p>Missing student emails: {bulkReport.remaining?.missingStudentEmail?.length ?? 0}</p>
            <p>Missing payment status: {bulkReport.remaining?.missingPaymentStatus?.length ?? 0}</p>
          </div>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-heading text-2xl text-primary">Student Lifecycle Reconciliation</h2>
        <p className="mt-2 text-sm text-slate-700">
          Repair broken portal links, normalize legacy student lifecycle status, promote old fully qualified admissions, and relink archived admissions to the real student register.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => runReconciliation({ dryRun: true })}
            disabled={reconcilingPreview || reconcilingApply}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {reconcilingPreview ? 'Scanning...' : 'Preview Reconciliation'}
          </button>
          <button
            type="button"
            onClick={() => runReconciliation({ dryRun: false })}
            disabled={reconcilingApply || reconcilingPreview}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {reconcilingApply ? 'Reconciling...' : 'Run Reconciliation'}
          </button>
        </div>
        {reconcileReport && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <p>Students scanned: {reconcileReport.studentsScanned ?? 0}</p>
            <p>Student portal repairs: {reconcileReport.studentsPortalRepaired ?? 0}</p>
            <p>Student status normalized: {reconcileReport.studentsStatusNormalized ?? 0}</p>
            <p>Admissions scanned: {reconcileReport.admissionsScanned ?? 0}</p>
            <p>Admissions promoted: {reconcileReport.admissionsPromoted ?? 0}</p>
            <p>Admissions archived after link repair: {reconcileReport.admissionsArchivedAfterLink ?? 0}</p>
            <p>Archive links repaired: {reconcileReport.archiveLinksRepaired ?? 0}</p>
            <p>Credentials queued: {reconcileReport.credentialsQueued ?? 0}</p>
            <p>Unresolved admissions: {reconcileReport.unresolvedAdmissions?.length ?? 0}</p>
          </div>
        )}
      </section>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {success && <p className="mt-4 text-sm text-emerald-700">{success}</p>}
    </PortalLayout>
  );
}

export default AdminSystemTools;
