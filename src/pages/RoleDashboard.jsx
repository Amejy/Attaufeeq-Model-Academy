import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { buildStudentCode } from '../utils/studentCode';
import PortalLayout from '../components/PortalLayout';
import ChildScopePanel from '../components/ChildScopePanel';
import AnimatedCounter from '../components/AnimatedCounter';
import { InsightBars, OrbitChart } from '../components/InsightChart';
import { DashboardSkeleton } from '../components/Skeleton';
import useParentChildSelection from '../hooks/useParentChildSelection';
import SmartSearchPanel from '../components/dashboard/SmartSearchPanel';
import SmartImage from '../components/SmartImage';
import { buildQrCodeUrl, resolvePublicAppOrigin } from '../utils/resultVerification';

function filterActions(actions, scopeFeatures = [], role = '') {
  if (role === 'admin' || scopeFeatures.includes('all')) return actions;
  return actions.filter((action) => !action.feature || scopeFeatures.includes(action.feature));
}

function parseNumber(value) {
  const digits = String(value ?? '').replace(/[^0-9.]/g, '');
  return digits ? Number(digits) : 0;
}

function normalizeBadge(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  return normalized
    .replace(/\s+/g, ' ')
    .replace(/(^|\\s)lead(\\s|$)/i, ' Lead ')
    .replace(/(^|\\s)class\\s+lead(\\s|$)/i, 'Class Lead')
    .replace(/\\bassigned\\b/i, 'Assigned')
    .trim();
}

function formatCurrency(value) {
  const amount = Number(value || 0);
  return `N${amount.toLocaleString()}`;
}

function renderLeadRole(classLead) {
  return classLead?.assignmentRole || 'Not assigned yet';
}

function renderLeadContact(classLead) {
  return classLead?.email || 'Not assigned yet';
}

function MetricCard({ label, value, note, accent = 'linear-gradient(135deg, #0f5132, #d9b354)' }) {
  return (
    <article className="glass-card dashboard-tile dashboard-metric-card floating-card relative p-4 sm:p-5">
      <div className="absolute inset-x-4 top-0 h-1 rounded-full sm:inset-x-5" style={{ background: accent }} />
      <p className="pr-4 text-[10px] font-semibold uppercase tracking-[0.12em] leading-5 text-slate-500 [overflow-wrap:normal] [word-break:normal] sm:text-[11px] sm:tracking-[0.18em]">
        <span className="block text-wrap-balance">{label}</span>
      </p>
      <p className="text-wrap-safe text-code-break mt-3 font-heading text-[clamp(1.45rem,4.5vw,2.35rem)] leading-tight text-primary sm:mt-4">
        <AnimatedCounter value={value} />
      </p>
      {note && <p className="text-wrap-safe mt-2.5 text-sm leading-6 text-slate-600 sm:mt-3">{note}</p>}
    </article>
  );
}

function Panel({ title, eyebrow, children }) {
  return (
    <section className="glass-card admin-surface p-4 sm:p-6">
      {eyebrow && <p className="text-wrap-safe text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 sm:tracking-[0.24em]">{eyebrow}</p>}
      <h2 className="text-wrap-safe mt-2 font-heading text-[clamp(1.2rem,3.8vw,1.7rem)] leading-tight text-primary">{title}</h2>
      <div className="mt-5 sm:mt-6">{children}</div>
    </section>
  );
}

function normalizeOrigin(value) {
  const normalized = String(value || '').trim();
  return normalized ? normalized.replace(/\/+$/, '') : '';
}

function resolvePortalHomepageUrl() {
  const publicOrigin = normalizeOrigin(resolvePublicAppOrigin());
  if (publicOrigin) return `${publicOrigin}/`;

  if (typeof window === 'undefined') return '';

  return `${normalizeOrigin(window.location.origin)}/`;
}

function PortalQrPanel() {
  const [portalUrl] = useState(() => (typeof window !== 'undefined' ? resolvePortalHomepageUrl() : ''));
  const normalizedPortalUrl = String(portalUrl || '');
  const qrCodeUrl = useMemo(() => buildQrCodeUrl(normalizedPortalUrl, 260), [normalizedPortalUrl]);
  const isLocalPortalUrl =
    normalizedPortalUrl.startsWith('http://localhost') ||
    normalizedPortalUrl.startsWith('http://127.0.0.1') ||
    normalizedPortalUrl.startsWith('http://0.0.0.0');

  async function handleCopyLink() {
    if (!normalizedPortalUrl) return;

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(normalizedPortalUrl);
        if (typeof window !== 'undefined') {
          window.alert('Website link copied.');
        }
        return;
      }
    } catch {
      // Fall through to the prompt fallback below.
    }

    if (typeof window !== 'undefined') {
      window.prompt('Copy website link:', normalizedPortalUrl);
    }
  }

  return (
    <section className="relative overflow-hidden rounded-[30px] border border-emerald-100 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(236,253,245,0.92))] p-5 shadow-[0_22px_55px_rgba(15,23,42,0.08)] sm:p-6">
      <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-emerald-200/35 blur-3xl" aria-hidden="true" />
      <div className="absolute -bottom-16 left-8 h-36 w-36 rounded-full bg-amber-200/35 blur-3xl" aria-hidden="true" />
      <div className="relative grid gap-5 xl:grid-cols-[1.2fr,0.8fr] xl:items-center">
        <div className="min-w-0">
          <div className="inline-flex rounded-full border border-emerald-200 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-800">
            Portal QR Access
          </div>
          <h3 className="mt-4 font-heading text-2xl text-primary sm:text-[2rem]">Scan once and open the ATTAUFEEQ website instantly</h3>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
            This QR code opens the public school portal homepage directly, so parents, students, and visitors can get into the website even when they do not have the link saved.
          </p>
          {isLocalPortalUrl && (
            <p className="mt-3 rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
              This QR is currently using your local address `{portalUrl}`. It will open on this computer, but phones outside this machine will need a real deployed URL set in `VITE_PUBLIC_APP_URL`.
            </p>
          )}

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[24px] border border-white/70 bg-white/85 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Destination</p>
              <p className="mt-2 break-all text-sm font-semibold text-slate-900">
                {normalizedPortalUrl || 'Public website URL is not available.'}
              </p>
            </div>
            <div className="rounded-[24px] border border-white/70 bg-white/85 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Best Use</p>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                Share it at the front desk, on printed materials, or inside school offices for quick portal access.
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                if (normalizedPortalUrl) window.open(normalizedPortalUrl, '_blank', 'noopener,noreferrer');
              }}
              disabled={!normalizedPortalUrl}
              className="interactive-button rounded-full border border-emerald-200 bg-emerald-600 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Open Website
            </button>
            <button
              type="button"
              onClick={() => void handleCopyLink()}
              disabled={!normalizedPortalUrl}
              className="interactive-button rounded-full border border-slate-300 bg-white/85 px-5 py-3 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Copy Link
            </button>
            <a
              href={qrCodeUrl || undefined}
              target="_blank"
              rel="noreferrer"
              className={`interactive-button rounded-full border px-5 py-3 text-sm font-semibold ${
                qrCodeUrl ? 'border-amber-200 bg-amber-50 text-amber-900' : 'pointer-events-none border-slate-200 bg-slate-100 text-slate-400'
              }`}
            >
              Open QR Image
            </a>
            <a
              href={qrCodeUrl || undefined}
              download="attaufeeq-school-portal-qr.png"
              className={`interactive-button rounded-full border px-5 py-3 text-sm font-semibold ${
                qrCodeUrl ? 'border-sky-200 bg-sky-50 text-sky-900' : 'pointer-events-none border-slate-200 bg-slate-100 text-slate-400'
              }`}
            >
              Download PNG
            </a>
          </div>
        </div>

        <div className="justify-self-center">
          <div className="rounded-[32px] border border-slate-200 bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.08)] sm:p-5">
            {qrCodeUrl ? (
              <SmartImage
                src={qrCodeUrl}
                alt="QR code for the ATTAUFEEQ public website"
                className="h-[220px] w-[220px] rounded-[24px] bg-white object-contain sm:h-[250px] sm:w-[250px]"
              />
            ) : (
              <div className="flex h-[220px] w-[220px] items-center justify-center rounded-[24px] bg-slate-100 px-6 text-center text-sm leading-6 text-slate-500 sm:h-[250px] sm:w-[250px]">
                Public website URL not available yet.
              </div>
            )}
            <div className="mt-4 rounded-[22px] bg-slate-50 px-4 py-3 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Scan Result</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">Opens the ATTAUFEEQ public portal homepage</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ActionGrid({ actions }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {actions.map((action) => (
        <Link
          key={action.label}
          to={action.to}
          className="surface-outline interactive-card text-wrap-safe rounded-[22px] px-3.5 py-3.5 text-left text-sm font-semibold leading-6 text-slate-700 sm:px-4 sm:py-4"
        >
          {action.label}
        </Link>
      ))}
    </div>
  );
}

function DetailList({ items = [], emptyMessage }) {
  if (!items.length) {
    return <p className="text-sm text-slate-600">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <DetailListItem key={item.title} item={item} />
      ))}
    </div>
  );
}

function DetailListItem({ item }) {
  const badge = normalizeBadge(item.badge);

  return (
    <article className="surface-outline dashboard-tile rounded-[22px] px-3.5 py-3.5 sm:px-4 sm:py-4">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
        <div className="min-w-0">
          <p className="text-wrap-safe text-sm font-semibold text-slate-900">{item.title}</p>
          {item.description && <p className="text-wrap-safe mt-2 text-sm leading-6 text-slate-600">{item.description}</p>}
        </div>
        {badge && (
          <span className="max-w-full whitespace-normal break-words rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-800 sm:text-[11px]">
            {badge}
          </span>
        )}
      </div>
    </article>
  );
}

function AdminView({ data, onToggleTokenSales, tokenSalesBusy = false }) {
  const metrics = data?.metrics || {};
  const tokenSalesTerm = metrics.tokenSalesTerm || 'Active Term';
  const tokenSalesControls = useMemo(
    () => (Array.isArray(metrics.tokenSalesControls) ? metrics.tokenSalesControls : []),
    [metrics.tokenSalesControls]
  );
  const [selectedTokenSalesTerm, setSelectedTokenSalesTerm] = useState(tokenSalesTerm);
  const resolvedTokenSalesTerm = tokenSalesControls.some((item) => item.term === selectedTokenSalesTerm)
    ? selectedTokenSalesTerm
    : tokenSalesTerm;
  const selectedControl = tokenSalesControls.find((item) => item.term === resolvedTokenSalesTerm) || null;
  const tokenSalesEnabled = selectedControl ? Boolean(selectedControl.enabled) : Boolean(metrics.tokenSalesEnabled);
  const balanceItems = [
    { label: 'Model Enrolled', value: metrics.modernEnrolled ?? 0, color: 'linear-gradient(90deg, #0f766e, #14b8a6)' },
    { label: 'Madrasa Enrolled', value: metrics.madrasaEnrolled ?? 0, color: 'linear-gradient(90deg, #a16207, #f59e0b)' },
    { label: 'Memorization Enrolled', value: metrics.memorizationEnrolled ?? 0, color: 'linear-gradient(90deg, #1e3a8a, #60a5fa)' },
    { label: 'Model Admitted', value: metrics.modernAdmitted ?? 0, color: 'linear-gradient(90deg, #166534, #22c55e)' },
    { label: 'Madrasa Admitted', value: metrics.madrasaAdmitted ?? 0, color: 'linear-gradient(90deg, #7c2d12, #fb923c)' },
    { label: 'Memorization Admitted', value: metrics.memorizationAdmitted ?? 0, color: 'linear-gradient(90deg, #1e40af, #93c5fd)' }
  ];
  const totalAdmitted = (metrics.modernAdmitted ?? 0) + (metrics.madrasaAdmitted ?? 0) + (metrics.memorizationAdmitted ?? 0);
  const totalEnrolled = Math.max(metrics.totalStudents ?? 0, totalAdmitted, 1);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <MetricCard label="Model Enrolled" value={metrics.modernEnrolled ?? 0} note="Students already inside the academy register." />
        <MetricCard label="Madrasa Enrolled" value={metrics.madrasaEnrolled ?? 0} note="Students already active in the madrasa register." accent="linear-gradient(135deg, #7c2d12, #f59e0b)" />
        <MetricCard label="Memorization Enrolled" value={metrics.memorizationEnrolled ?? 0} note="Students active in the memorization register." accent="linear-gradient(135deg, #1e3a8a, #60a5fa)" />
        <MetricCard label="ATTAUFEEQ Admitted" value={metrics.modernAdmitted ?? 0} note="Fully admitted into ATTAUFEEQ Model Academy with portal access." accent="linear-gradient(135deg, #0f766e, #14b8a6)" />
        <MetricCard label="Madrasa Admitted" value={metrics.madrasaAdmitted ?? 0} note="Fully admitted into Madrastul ATTAUFEEQ." accent="linear-gradient(135deg, #92400e, #fbbf24)" />
        <MetricCard label="Memorization Admitted" value={metrics.memorizationAdmitted ?? 0} note="Fully admitted into Quran Memorization Academy." accent="linear-gradient(135deg, #1e40af, #93c5fd)" />
        <MetricCard label="Total Students" value={metrics.totalStudents ?? 0} note="Whole-school active count across both institutions." accent="linear-gradient(135deg, #0f172a, #475569)" />
        <MetricCard label="Pending Receipts" value={metrics.pendingReceiptUploads ?? 0} note="Receipt uploads waiting for admissions confirmation." accent="linear-gradient(135deg, #92400e, #f59e0b)" />
        <MetricCard label="Tokens Released" value={metrics.releasedTokens ?? 0} note="Scratch-card tokens already pushed to dashboard holders." accent="linear-gradient(135deg, #0f766e, #14b8a6)" />
        <MetricCard label={`${tokenSalesTerm} Tokens Sold`} value={metrics.tokenSalesCount ?? 0} note="Approved scratch-card purchases recorded in the active session for the current term." accent="linear-gradient(135deg, #7c3aed, #c084fc)" />
        <MetricCard label={`${tokenSalesTerm} Token Revenue`} value={formatCurrency(metrics.tokenSalesRevenue ?? 0)} note="Total amount collected from approved token purchases in the active term." accent="linear-gradient(135deg, #0f766e, #34d399)" />
        <MetricCard label={`${tokenSalesTerm} Pending Token Receipts`} value={metrics.tokenSalesPendingCount ?? 0} note="Uploads still waiting before they can count as sold token purchases." accent="linear-gradient(135deg, #9a3412, #fb923c)" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.15fr,0.85fr]">
        <InsightBars
          title="Institution Balance"
          subtitle="A quick read on where admitted and fully active numbers are sitting across Model and Madrasa."
          items={balanceItems}
        />
        <OrbitChart
          title="Admitted To Active"
          value={totalAdmitted}
          maxValue={totalEnrolled}
          detail="This ring compares approved admissions against the current active student base."
          ringColor="#0f5132"
          glowColor="rgba(15,81,50,0.2)"
        />
      </div>

      <Panel title="Admin Quick Actions" eyebrow="Operations">
        <ActionGrid
          actions={[
            { label: 'Manage Students', to: '/portal/admin/students' },
            { label: 'Manage Teachers', to: '/portal/admin/teachers' },
            { label: 'Manage Classes', to: '/portal/admin/classes' },
            { label: 'Manage Subjects', to: '/portal/admin/subjects' },
            { label: 'Teacher Assignments', to: '/portal/admin/teacher-assignments' },
            { label: 'Publish Results', to: '/portal/admin/results' },
            { label: 'Result Tokens', to: '/portal/admin/result-tokens' },
            { label: 'Receipt Upload Flows', to: '/portal/admin/fees' },
            { label: 'Promote Students', to: '/portal/admin/promotions' },
            { label: 'Library Management', to: '/portal/admin/library' },
            { label: 'Timetable Management', to: '/portal/admin/timetable' },
            { label: 'Attendance Overview', to: '/portal/admin/attendance' },
            { label: 'Notifications', to: '/portal/admin/notifications' },
            { label: 'News & Events', to: '/portal/admin/news' },
            { label: 'Messages', to: '/portal/admin/messages' },
            { label: 'Admissions Access', to: '/portal/admin/admissions-access' },
            { label: 'System Tools', to: '/portal/admin/system' },
            { label: 'Generate Reports', to: '/portal/admin/reports' }
          ]}
        />
      </Panel>

      <Panel title="Public Website QR" eyebrow="Access Point">
        <PortalQrPanel />
      </Panel>

      <Panel title="Result Token Sales Control" eyebrow="Revenue">
        <div className="flex flex-col gap-4 rounded-[22px] border border-slate-200 bg-white/75 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-wrap-safe text-sm font-semibold text-slate-900">
              {tokenSalesEnabled ? `${selectedTokenSalesTerm} token sales are open.` : `${selectedTokenSalesTerm} token sales are closed.`}
            </p>
            <p className="text-wrap-safe mt-2 text-sm text-slate-600">
              When this is enabled, students and parents can upload scratch-card receipts and the admissions desk can release approved result tokens for {selectedTokenSalesTerm}.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[14rem]">
            <select
              value={selectedTokenSalesTerm}
              onChange={(event) => setSelectedTokenSalesTerm(event.target.value)}
              className="rounded-2xl border border-slate-300 px-3 py-3 text-sm"
            >
              {['First Term', 'Second Term', 'Third Term'].map((term) => (
                <option key={term} value={term}>{term}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onToggleTokenSales?.(resolvedTokenSalesTerm, !tokenSalesEnabled)}
              disabled={tokenSalesBusy}
              className={`interactive-button w-full ${
                tokenSalesEnabled ? 'border-red-200 text-red-700' : 'border-emerald-200 text-emerald-800'
              }`}
            >
              {tokenSalesBusy ? 'Saving...' : tokenSalesEnabled ? 'Close Token Sales' : 'Open Token Sales'}
            </button>
          </div>
        </div>
      </Panel>

    </div>
  );
}

function AdmissionsView({ data, scopeFeatures = [] }) {
  const actions = filterActions(
    [
      { label: 'Review Applications', to: '/portal/admissions/review', feature: 'admissions' },
      { label: 'Student Roster', to: '/portal/admissions/students', feature: 'students' },
      { label: 'Fees', to: '/portal/admissions/fees', feature: 'fees' },
      { label: 'Receipt Upload Desk', to: '/portal/admissions/receipt-desk', feature: 'fees' },
      { label: 'Result Tokens', to: '/portal/admissions/result-tokens', feature: 'result-tokens' },
      { label: 'Publish News', to: '/portal/admissions/news', feature: 'news' },
      { label: 'Manage Library', to: '/portal/admissions/library', feature: 'library' },
      { label: 'Message Admin', to: '/portal/admissions/messages', feature: 'messages' }
    ],
    scopeFeatures
  );

  const metrics = data?.metrics || {};
  const tokenSalesTerm = metrics.tokenSalesTerm || 'Active Term';
  const workflowItems = [
    { label: 'Model Pending', value: metrics.modernPending ?? 0, color: 'linear-gradient(90deg, #155e75, #38bdf8)' },
    { label: 'Madrasa Pending', value: metrics.madrasaPending ?? 0, color: 'linear-gradient(90deg, #92400e, #f59e0b)' },
    { label: 'Memorization Pending', value: metrics.memorizationPending ?? 0, color: 'linear-gradient(90deg, #1e3a8a, #60a5fa)' },
    { label: 'Model Admitted', value: metrics.modernAdmitted ?? 0, color: 'linear-gradient(90deg, #166534, #22c55e)' },
    { label: 'Madrasa Admitted', value: metrics.madrasaAdmitted ?? 0, color: 'linear-gradient(90deg, #78350f, #fbbf24)' },
    { label: 'Memorization Admitted', value: metrics.memorizationAdmitted ?? 0, color: 'linear-gradient(90deg, #1e40af, #93c5fd)' }
  ];
  const totalPending = (metrics.modernPending ?? 0) + (metrics.madrasaPending ?? 0) + (metrics.memorizationPending ?? 0);
  const totalAdmitted = metrics.totalApprovedAdmissions ?? 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <MetricCard label="Model Pending" value={metrics.modernPending ?? 0} note="Applications waiting for desk review." accent="linear-gradient(135deg, #155e75, #38bdf8)" />
        <MetricCard label="Madrasa Pending" value={metrics.madrasaPending ?? 0} note="Islamic track submissions awaiting review." accent="linear-gradient(135deg, #92400e, #f59e0b)" />
        <MetricCard label="Memorization Pending" value={metrics.memorizationPending ?? 0} note="Memorization applications awaiting review." accent="linear-gradient(135deg, #1e3a8a, #60a5fa)" />
        <MetricCard label="ATTAUFEEQ Admitted" value={metrics.modernAdmitted ?? 0} note="Fully admitted into ATTAUFEEQ Model Academy classes." accent="linear-gradient(135deg, #166534, #22c55e)" />
        <MetricCard label="Madrasa Admitted" value={metrics.madrasaAdmitted ?? 0} note="Fully admitted into Madrastul ATTAUFEEQ classes." accent="linear-gradient(135deg, #78350f, #fbbf24)" />
        <MetricCard label="Memorization Admitted" value={metrics.memorizationAdmitted ?? 0} note="Fully admitted into Quran Memorization Academy." accent="linear-gradient(135deg, #1e40af, #93c5fd)" />
        <MetricCard label="Total Admitted" value={totalAdmitted} note="Students fully admitted with completed desk processing." accent="linear-gradient(135deg, #0f172a, #475569)" />
        <MetricCard label="Pending Receipts" value={metrics.pendingReceiptUploads ?? 0} note="Uploads waiting in the receipt desk queue." accent="linear-gradient(135deg, #92400e, #f59e0b)" />
        <MetricCard label="Token Ready" value={metrics.tokenReadyCount ?? 0} note="Approved payments that already have released result tokens." accent="linear-gradient(135deg, #0f766e, #14b8a6)" />
        <MetricCard label={`${tokenSalesTerm} Tokens Sold`} value={metrics.tokenSalesCount ?? 0} note="Approved token purchases for the active session and current term." accent="linear-gradient(135deg, #7c3aed, #c084fc)" />
        <MetricCard label={`${tokenSalesTerm} Token Revenue`} value={formatCurrency(metrics.tokenSalesRevenue ?? 0)} note="How much the school has made from token sales in the active term." accent="linear-gradient(135deg, #0f766e, #34d399)" />
        <MetricCard label={`${tokenSalesTerm} Tokens Released`} value={metrics.tokenSalesReleasedCount ?? 0} note="Sold token purchases that have already been delivered to students or parents." accent="linear-gradient(135deg, #155e75, #38bdf8)" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.15fr,0.85fr]">
        <InsightBars
          title="Admission Workflow"
          subtitle="Pending and approved counts split by institution, so workload stays visible at a glance."
          items={workflowItems}
        />
        <OrbitChart
          title="Approval Pace"
          value={totalAdmitted}
          maxValue={Math.max(totalAdmitted + totalPending, 1)}
          detail="As pending work drops, this ring moves closer to full completion."
          ringColor="#d9b354"
          glowColor="rgba(217,179,84,0.22)"
        />
      </div>

      <Panel title="Admissions Desk Actions" eyebrow="Workflow">
        <ActionGrid actions={actions} />
      </Panel>
    </div>
  );
}

function TeacherView({ data, scopeFeatures = [] }) {
  const actions = filterActions(
    [
      { label: 'Result Entry', to: '/portal/teacher/results', feature: 'results' },
      { label: 'Attendance', to: '/portal/teacher/attendance', feature: 'attendance' },
      { label: 'Timetable', to: '/portal/teacher/timetable', feature: 'timetable' },
      { label: 'Upcoming Items', to: '/portal/teacher/upcoming' },
      { label: 'Madrasa Records', to: '/portal/teacher/madrasa', feature: 'madrasa' },
      { label: 'Notifications', to: '/portal/teacher/notifications', feature: 'notifications' },
      { label: 'Messages', to: '/portal/teacher/messages', feature: 'messages' }
    ],
    scopeFeatures
  );

  const classLoads = data?.classLoads || [];
  const loadItems = classLoads.map((item) => ({
    label: item.classLabel,
    value: item.studentCount,
    color: item.isLead ? 'linear-gradient(90deg, #0f5132, #22c55e)' : 'linear-gradient(90deg, #334155, #94a3b8)'
  }));
  const maxLoad = Math.max(...classLoads.map((item) => item.studentCount), 1);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Assigned Classes" value={classLoads.length} note="Classes currently tied to your profile." />
        <MetricCard label="Students Handling" value={data?.totalStudents ?? 0} note="Current student load across all assigned classes." accent="linear-gradient(135deg, #0f766e, #14b8a6)" />
        <MetricCard label="Assigned Subjects" value={(data?.assignedSubjects || []).length} note="Subjects you are expected to teach or supervise." accent="linear-gradient(135deg, #92400e, #f59e0b)" />
        <MetricCard label="Lead Classes" value={classLoads.filter((item) => item.isLead).length} note="Classes where you are marked as class lead." accent="linear-gradient(135deg, #0f172a, #475569)" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.15fr,0.85fr]">
        <InsightBars
          title="Student Load By Class"
          subtitle="A teacher should be able to read the class burden immediately, especially when lead responsibility is involved."
          items={loadItems}
        />
        <OrbitChart
          title="Load Spread"
          value={data?.totalStudents ?? 0}
          maxValue={Math.max(maxLoad * Math.max(classLoads.length, 1), 1)}
          detail="This ring gives a rough sense of how full your combined class capacity feels."
          ringColor="#0f766e"
          glowColor="rgba(20,184,166,0.18)"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Teaching Load" eyebrow="Assignments">
          <DetailList
            items={classLoads.map((item) => ({
              title: item.classLabel,
              description: `${item.studentCount} students under your care.`,
              badge: item.isLead ? 'Class Lead' : 'Assigned'
            }))}
            emptyMessage="No class load assigned yet."
          />
        </Panel>
        <Panel title="Assigned Subjects" eyebrow="Curriculum">
          <DetailList
            items={(data?.assignedSubjects || []).map((item) => ({
              title: item,
              description: 'Available in your teaching scope.'
            }))}
            emptyMessage="No subjects assigned yet."
          />
        </Panel>
      </div>

      <Panel title="Pending Tasks" eyebrow="Next Actions">
        <DetailList
          items={(data?.pendingTasks || []).map((item) => ({
            title: item,
            description: 'Keep this moving so your class flow stays current.'
          }))}
          emptyMessage="No pending tasks."
        />
        <div className="mt-5">
          <ActionGrid actions={actions} />
        </div>
      </Panel>
    </div>
  );
}

function StudentView({ data, onSessionChange, selectedSessionId, sessions = [], scopeFeatures = [] }) {
  const actions = filterActions(
    [
      { label: 'My Results', to: '/portal/student/results', feature: 'results' },
      { label: 'Announcements', to: '/portal/student/announcements' },
      { label: 'Timetable', to: '/portal/student/timetable', feature: 'timetable' },
      { label: 'Attendance', to: '/portal/student/attendance', feature: 'attendance' },
      { label: 'School Fees', to: '/portal/student/fees', feature: 'fees' },
      { label: 'Scratch Card', to: '/portal/student/scratch-card', feature: 'fees' },
      { label: 'Receipt Upload', to: '/portal/student/receipt-upload', feature: 'fees' },
      { label: 'Notifications', to: '/portal/student/notifications', feature: 'notifications' },
      { label: 'Madrasa', to: '/portal/student/madrasa', feature: 'madrasa' },
      { label: 'Library', to: '/portal/student/library', feature: 'library' },
      { label: 'Messages', to: '/portal/student/messages', feature: 'messages' }
    ],
    scopeFeatures
  );

  const upcomingItems = data?.upcomingItems || [];
  const normalizedUpcoming = upcomingItems
    .map((item) => (typeof item === 'string' ? { title: item } : item))
    .filter(Boolean);
  const attendanceValue = parseNumber(data?.attendance);
  const normalizedInstitution = String(data?.institution || '').toLowerCase();
  const isIslamicTrack = normalizedInstitution.includes('madrastul')
    || normalizedInstitution.includes('quran');
  const chartMax = isIslamicTrack ? 10 : 100;
  const chartValue = isIslamicTrack ? normalizedUpcoming.length : attendanceValue;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <select
          value={selectedSessionId}
          onChange={(event) => onSessionChange(event.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm sm:w-auto"
        >
          {!sessions.length && <option value="">No sessions available</option>}
          {sessions.map((session) => (
            <option key={session.id} value={session.id}>
              {session.sessionName} {session.isActive ? '(Active)' : ''}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard label="Upcoming Items" value={normalizedUpcoming.length} note="Tests, submissions, or school tasks waiting ahead." accent="linear-gradient(135deg, #0f766e, #14b8a6)" />
        <MetricCard
          label={`Attendance${data?.attendanceTerm ? ` (${data.attendanceTerm})` : ''}${data?.sessionName ? ` • ${data.sessionName}` : ''}`}
          value={data?.attendance || 'N/A'}
          note="Current attendance reading from the school ledger."
          accent="linear-gradient(135deg, #92400e, #f59e0b)"
        />
        <MetricCard
          label="Class"
          value={data?.student?.classLabel || data?.student?.level || 'Pending'}
          note="Your active class placement."
          accent="linear-gradient(135deg, #0f172a, #475569)"
        />
      </div>
      <Panel title="Student Code" eyebrow="Identity">
        <div className="rounded-[22px] border border-white/55 bg-white/70 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Your student code</p>
          <p className="mt-3 text-2xl font-semibold text-primary">
            {buildStudentCode(data?.student || {})}
          </p>
          <p className="mt-2 text-xs text-slate-500">Keep this code handy for official records.</p>
        </div>
      </Panel>

      {data?.student?.accountStatus === 'graduated' && (
        <Panel title="Graduation Status" eyebrow="Alumni">
          <p className="text-sm text-slate-600">
            You have completed the highest class level in this track. Your results remain available in your portal history.
          </p>
        </Panel>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.15fr,0.85fr]">
        <Panel title="Upcoming Items" eyebrow="Focus">
          <DetailList
            items={normalizedUpcoming.map((item) => {
              const hasDate = item?.dueDate && !Number.isNaN(new Date(item.dueDate).getTime());
              const dueLabel = hasDate ? `Due ${new Date(item.dueDate).toLocaleDateString()}` : '';
              const teacherLabel = item?.teacherName ? `Posted by ${item.teacherName}` : 'Posted by class teacher';
              const description = dueLabel ? `${dueLabel} • ${teacherLabel}` : teacherLabel;
              return {
                title: item?.title || 'Upcoming item',
                description
              };
            })}
            emptyMessage="No upcoming items right now."
          />
        </Panel>
        <OrbitChart
          title={isIslamicTrack ? 'Upcoming Load' : 'Attendance Pulse'}
          value={chartValue}
          maxValue={chartMax}
          detail={isIslamicTrack
            ? 'This ring scales against a simple ten-item load so the dashboard still feels alive.'
            : 'Attendance is visualized so students can read consistency at a glance.'}
          ringColor={isIslamicTrack ? '#d9b354' : '#0f766e'}
          glowColor={isIslamicTrack ? 'rgba(217,179,84,0.2)' : 'rgba(20,184,166,0.18)'}
        />
      </div>

      <Panel title="Class Lead" eyebrow="Support">
        <div className="grid gap-4 sm:grid-cols-3">
          <article className="rounded-[22px] border border-white/60 bg-white/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Teacher</p>
            <p className="text-wrap-safe mt-2 text-lg font-semibold text-slate-900">{data?.classLead?.fullName || 'Not assigned yet'}</p>
          </article>
          <article className="rounded-[22px] border border-white/60 bg-white/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Role</p>
            <p className="text-wrap-safe mt-2 text-lg font-semibold text-slate-900">{renderLeadRole(data?.classLead)}</p>
          </article>
          <article className="rounded-[22px] border border-white/60 bg-white/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Contact</p>
            <p className="text-code-break mt-2 text-lg font-semibold text-slate-900">{renderLeadContact(data?.classLead)}</p>
          </article>
        </div>
        <div className="mt-5">
          <ActionGrid actions={actions} />
        </div>
      </Panel>
    </div>
  );
}

function ParentView({ data, onChildChange, onTermChange, onSessionChange, selectedTerm, selectedSessionId, sessions = [], scopeFeatures = [] }) {
  const children = data?.children || [];
  const child = data?.child || null;
  const actions = filterActions(
    [
      { label: 'View Timetable', to: '/portal/parent/timetable', feature: 'timetable' },
      { label: 'View Attendance', to: '/portal/parent/attendance', feature: 'attendance' },
      { label: 'View Results', to: '/portal/parent/results', feature: 'results' },
      { label: 'School Fees', to: '/portal/parent/fees', feature: 'fees' },
      { label: 'Scratch Card', to: '/portal/parent/scratch-card', feature: 'fees' },
      { label: 'Receipt Upload', to: '/portal/parent/receipt-upload', feature: 'fees' },
      { label: 'Notifications', to: '/portal/parent/notifications', feature: 'notifications' },
      { label: 'Madrasa Progress', to: '/portal/parent/madrasa', feature: 'madrasa' },
      { label: 'Messages', to: '/portal/parent/messages', feature: 'messages' },
      { label: 'Library', to: '/portal/parent/library', feature: 'library' }
    ],
    scopeFeatures
  );

  const attendanceValue = parseNumber(data?.attendance);

  return (
    <div className="space-y-6">
      <ChildScopePanel
        children={children}
        activeChildId={child?.id || ''}
        onChange={onChildChange}
        heading="Linked Children"
        description="Every parent view is pinned to the selected child, so overview, results, attendance, and fees stay aligned."
      />
      <div className="flex flex-wrap gap-2">
        <select
          value={selectedSessionId}
          onChange={(event) => onSessionChange(event.target.value)}
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
          value={selectedTerm}
          onChange={(event) => onTermChange(event.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm sm:w-auto"
        >
          <option value="">Latest Term</option>
          {['First Term', 'Second Term', 'Third Term'].map((term) => (
            <option key={term} value={term}>{term}</option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Linked Children" value={data?.linkedChildrenCount ?? children.length ?? 0} note="Total students connected to this parent account." />
        <MetricCard label="Active Child" value={child?.fullName || 'N/A'} note="The current child in focus across the portal." accent="linear-gradient(135deg, #0f766e, #14b8a6)" />
        <MetricCard
          label={`Attendance${data?.attendanceTerm ? ` (${data.attendanceTerm})` : ''}${data?.sessionName ? ` • ${data.sessionName}` : ''}`}
          value={data?.attendance || 'N/A'}
          note="Attendance readout for the selected child."
          accent="linear-gradient(135deg, #92400e, #f59e0b)"
        />
        <MetricCard
          label={`Payment Status${selectedTerm ? ` (${selectedTerm})` : ''}${data?.sessionName ? ` • ${data.sessionName}` : ''}`}
          value={data?.paymentStatus || 'N/A'}
          note="Fee position for the active child in the selected scope."
          accent="linear-gradient(135deg, #0f172a, #475569)"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.15fr,0.85fr]">
        <Panel title="Child Identity" eyebrow="Profile">
          {child ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <article className="rounded-[22px] border border-white/60 bg-white/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Class</p>
                <p className="text-wrap-safe mt-2 text-lg font-semibold text-slate-900">{child.classLabel || child.level || 'Pending'}</p>
              </article>
              <article className="rounded-[22px] border border-white/60 bg-white/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Institution</p>
                <p className="text-wrap-safe mt-2 text-lg font-semibold text-slate-900">{child.institution || 'Pending'}</p>
              </article>
              <article className="rounded-[22px] border border-white/60 bg-white/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Student Record</p>
                <p className="text-code-break mt-2 text-lg font-semibold text-slate-900">{child.id}</p>
              </article>
              {child.accountStatus === 'graduated' && (
                <article className="rounded-[22px] border border-amber-200 bg-amber-50/60 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Status</p>
                  <p className="mt-2 text-lg font-semibold text-amber-800">Graduated</p>
                </article>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-600">Select a child to view details.</p>
          )}
        </Panel>
        <OrbitChart
          title="Attendance Pulse"
          value={attendanceValue}
          maxValue={100}
          detail="Parents get a quick visual signal before they dive into the detailed attendance ledger."
          ringColor="#0f5132"
          glowColor="rgba(15,81,50,0.18)"
        />
      </div>

      <Panel title="Class Lead" eyebrow="School Contact">
        <div className="grid gap-4 sm:grid-cols-3">
          <article className="rounded-[22px] border border-white/60 bg-white/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Teacher</p>
            <p className="text-wrap-safe mt-2 text-lg font-semibold text-slate-900">{data?.classLead?.fullName || 'Not assigned yet'}</p>
          </article>
          <article className="rounded-[22px] border border-white/60 bg-white/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Role</p>
            <p className="text-wrap-safe mt-2 text-lg font-semibold text-slate-900">{renderLeadRole(data?.classLead)}</p>
          </article>
          <article className="rounded-[22px] border border-white/60 bg-white/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Contact</p>
            <p className="text-code-break mt-2 text-lg font-semibold text-slate-900">{renderLeadContact(data?.classLead)}</p>
          </article>
        </div>
      </Panel>

      <Panel title="Parent Actions" eyebrow="Shortcuts">
        <ActionGrid actions={actions} />
      </Panel>
    </div>
  );
}

function renderRoleContent(role, data, options = {}) {
  if (role === 'admin') {
    return <AdminView data={data} onToggleTokenSales={options.onToggleTokenSales} tokenSalesBusy={options.tokenSalesBusy} />;
  }
  if (role === 'admissions') return <AdmissionsView data={data} scopeFeatures={options.scopeFeatures} />;
  if (role === 'teacher') return <TeacherView data={data} scopeFeatures={options.scopeFeatures} />;
  if (role === 'student') {
    return <StudentView data={data} onSessionChange={options.onSessionChange} selectedSessionId={options.selectedSessionId} sessions={options.sessions} scopeFeatures={options.scopeFeatures} />;
  }
  if (role === 'parent') {
    return (
      <ParentView
        data={data}
        onChildChange={options.onChildChange}
        onTermChange={options.onTermChange}
        onSessionChange={options.onSessionChange}
        selectedTerm={options.selectedTerm}
        selectedSessionId={options.selectedSessionId}
        sessions={options.sessions}
        scopeFeatures={options.scopeFeatures}
      />
    );
  }
  return null;
}

function RoleDashboard({ role }) {
  const navigate = useNavigate();
  const { apiJson, logout, user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tokenSalesBusy, setTokenSalesBusy] = useState(false);
  const [selectedChildId, setSelectedChildId] = useParentChildSelection(role, user);
  const [selectedTerm, setSelectedTerm] = useState('');
  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');

  useEffect(() => {
    if (role !== 'parent') return;
    setSelectedTerm('');
  }, [role, selectedChildId]);

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);
      setError('');

      try {
        let effectiveSessionId = selectedSessionId;
        if (role === 'student' || role === 'parent') {
          const sessionsPayload = await apiJson('/results/sessions');
          const sessionRows = sessionsPayload.sessions || [];
          const activeSession = sessionsPayload.activeSession || sessionRows.find((item) => item.isActive) || sessionRows[0] || null;
          effectiveSessionId = selectedSessionId && sessionRows.some((item) => item.id === selectedSessionId)
            ? selectedSessionId
            : activeSession?.id || '';
          setSessions(sessionRows);
          if (selectedSessionId !== effectiveSessionId) {
            setSelectedSessionId(effectiveSessionId);
          }
        }
        const params = new URLSearchParams();
        if (role === 'parent' && selectedChildId) params.set('childId', selectedChildId);
        if (role === 'parent' && selectedTerm) params.set('term', selectedTerm);
        if ((role === 'student' || role === 'parent') && effectiveSessionId) params.set('sessionId', effectiveSessionId);
        const query = params.toString() ? `?${params.toString()}` : '';
        const payload = await apiJson(`/dashboard/${role}${query}`);

        setData(payload);
        if (role === 'parent' && payload.child?.id && payload.child.id !== selectedChildId) {
          setSelectedChildId(payload.child.id);
        }
      } catch (err) {
        setError(err.message || 'Unable to load dashboard.');
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, [role, apiJson, logout, navigate, selectedChildId, selectedSessionId, selectedTerm, setSelectedChildId]);

  async function handleToggleTokenSales(term, nextEnabled) {
    if (role !== 'admin' || !term) return;
    setTokenSalesBusy(true);
    setError('');

    try {
      await apiJson('/fees/admin/token-sales-control', {
        method: 'PUT',
        body: {
          term,
          enabled: nextEnabled
        }
      });

      const payload = await apiJson('/dashboard/admin');
      setData(payload);
    } catch (err) {
      setError(err.message || 'Unable to update token sales control.');
    } finally {
      setTokenSalesBusy(false);
    }
  }

  const subtitle = useMemo(() => {
    if (role === 'admin') return 'High-level school operations, admissions access control, and institution health in one view.';
    if (role === 'admissions') return 'Keep the review desk moving, split workload by institution, and watch approval flow in real time.';
    if (role === 'teacher') return 'Your class responsibility, subject scope, and next actions are organized into one calm workspace.';
    if (role === 'student') return 'A focused portal for learning, communication, and class guidance without clutter.';
    if (role === 'parent') return 'Track the selected child, view class leadership, and move quickly into the records that matter.';
    return 'Track activities, manage records, and move quickly between core school operations.';
  }, [role]);

  return (
    <PortalLayout
      role={role}
      title={`${role.charAt(0).toUpperCase()}${role.slice(1)} Dashboard`}
      subtitle={subtitle}
    >
      {loading && <DashboardSkeleton />}
      {error && <p className="rounded-[22px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {!loading && !error && data && (
        <div className="space-y-6">
          {renderRoleContent(role, data, {
            onToggleTokenSales: handleToggleTokenSales,
            tokenSalesBusy,
            onChildChange: setSelectedChildId,
            onSessionChange: setSelectedSessionId,
            onTermChange: setSelectedTerm,
            selectedSessionId,
            selectedTerm,
            sessions,
            scopeFeatures: user?.scope?.features || []
          })}
          <SmartSearchPanel role={role} apiJson={apiJson} classes={data?.classes || []} />
        </div>
      )}
    </PortalLayout>
  );
}

export default RoleDashboard;
