function ProvisioningPanel({ title = 'Portal Access Ready', description = '', records = [] }) {
  if (!records.length) return null;

  return (
    <section className="mt-4 rounded-[28px] border border-emerald-200 bg-[linear-gradient(135deg,rgba(16,185,129,0.12),rgba(14,165,233,0.08))] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Provisioned access</p>
          <h3 className="mt-2 font-heading text-2xl text-primary">{title}</h3>
          {description && <p className="mt-2 max-w-3xl text-sm text-slate-600">{description}</p>}
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {records.map((record) => (
          <article key={`${record.role}-${record.email}-${record.label}`} className="rounded-[24px] border border-white/80 bg-white/90 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{record.label}</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">{record.email}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${record.reused ? 'bg-slate-100 text-slate-700' : 'bg-emerald-100 text-emerald-700'}`}>
                {record.reused ? 'Existing account linked' : 'New account'}
              </span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Role</p>
                <p className="mt-2 text-sm font-medium text-slate-800">{record.role}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Temporary password</p>
                <p className="mt-2 break-all text-sm font-medium text-slate-800">{record.password || 'Existing password remains active'}</p>
              </div>
            </div>

            <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Delivery</p>
              <p className="mt-2 text-sm font-medium text-slate-800">
                {record.emailDeliveryStatus === 'sent'
                  ? `Emailed to ${record.recipientEmail}`
                  : record.emailDeliveryStatus === 'queued'
                    ? `Queued for background delivery to ${record.recipientEmail}`
                  : record.emailDeliveryStatus === 'reused'
                    ? 'Existing account kept; no new email sent.'
                    : record.emailDeliveryStatus === 'manual-only'
                      ? (record.emailDeliveryMessage || 'Automatic delivery is blocked until a valid recipient email is added.')
                      : record.emailDeliveryStatus === 'not-required'
                        ? 'No new password email was required.'
                        : record.emailDeliveryMessage || 'Delivery status unavailable.'}
              </p>
            </div>

            <p className="mt-3 text-xs text-slate-600">
              {record.mustChangePassword
                ? 'This user will be forced to change the password on first login.'
                : 'No forced change is pending on this account.'}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

export default ProvisioningPanel;
