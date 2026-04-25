import { useEffect, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Tooltip from './Tooltip';

const LABEL_OVERRIDES = {
  portal: 'Dashboard',
  admin: 'Admin',
  teacher: 'Teacher',
  parent: 'Parent',
  student: 'Student',
  admissions: 'Admissions',
  'result-tokens': 'Result Tokens',
  'teacher-assignments': 'Assignments',
  'admissions-access': 'Admissions Access',
  settings: 'Settings',
  'change-password': 'Change Password'
};

function formatSegment(segment = '') {
  const clean = String(segment || '').trim();
  if (!clean) return '';
  return LABEL_OVERRIDES[clean] || clean
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function roleHome(role = '') {
  if (role && role !== 'student' && role !== 'parent' && role !== 'teacher' && role !== 'admissions' && role !== 'admin') {
    return '/portal';
  }

  if (!role) return '/portal';
  return `/portal/${role}`;
}

function readStoredHistory() {
  if (typeof window === 'undefined') return [];

  try {
    const parsed = JSON.parse(sessionStorage.getItem('portal-route-history') || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStoredHistory(entries) {
  if (typeof window === 'undefined') return;

  try {
    sessionStorage.setItem('portal-route-history', JSON.stringify(entries.slice(-24)));
  } catch {
    // Ignore storage failures.
  }
}

function PageHeader({ role = '', title, subtitle = '', actions = null }) {
  const location = useLocation();
  const navigate = useNavigate();
  const pathname = location.pathname;
  const queryKey = `${location.pathname}${location.search}`;

  useEffect(() => {
    const entries = readStoredHistory();
    const last = entries[entries.length - 1];
    if (last?.path === queryKey) return;

    writeStoredHistory([
      ...entries,
      {
        path: queryKey,
        pathname,
        label: title || formatSegment(pathname.split('/').filter(Boolean).slice(-1)[0] || 'portal')
      }
    ]);
  }, [pathname, queryKey, title]);

  const breadcrumbs = useMemo(() => {
    const segments = pathname.split('/').filter(Boolean);
    return segments.map((segment, index) => ({
      label: index === segments.length - 1 ? title || formatSegment(segment) : formatSegment(segment),
      to: `/${segments.slice(0, index + 1).join('/')}`,
      current: index === segments.length - 1
    }));
  }, [pathname, title]);

  const previousEntry = useMemo(() => {
    const entries = readStoredHistory();
    const currentIndex = entries.findIndex((item) => item.path === queryKey);
    if (currentIndex > 0) {
      return entries[currentIndex - 1];
    }
    if (entries.length > 1 && entries[entries.length - 1]?.path === queryKey) {
      return entries[entries.length - 2];
    }
    return null;
  }, [queryKey]);

  const backTarget = previousEntry?.pathname || roleHome(role);
  const backLabel = previousEntry?.label || 'Back to previous page';

  function handleBack() {
    if (typeof window !== 'undefined' && window.history.length > 1 && previousEntry?.path) {
      navigate(-1);
      return;
    }

    navigate(backTarget, { replace: true });
  }

  return (
    <div className="relative mb-5 sm:mb-6">
      <div className="page-header-toolbar">
        <Tooltip text={backLabel}>
          <button
            type="button"
            onClick={handleBack}
            className="interactive-button interactive-icon page-header-back"
            aria-label={backLabel}
          >
            <span aria-hidden="true">←</span>
          </button>
        </Tooltip>
        <nav aria-label="Breadcrumb" className="page-breadcrumbs">
          {breadcrumbs.map((crumb) => (
            crumb.current ? (
              <span key={crumb.to} className="page-breadcrumbs__current" aria-current="page">
                {crumb.label}
              </span>
            ) : (
              <span key={crumb.to} className="page-breadcrumbs__item">
                <Link to={crumb.to} className="interactive-link page-breadcrumbs__link">
                  {crumb.label}
                </Link>
                <span className="page-breadcrumbs__divider">/</span>
              </span>
            )
          ))}
        </nav>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="break-words font-heading text-2xl text-primary sm:text-4xl">{title}</h1>
          {subtitle && <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 sm:leading-7">{subtitle}</p>}
        </div>
        {actions && <div className="flex w-full flex-wrap justify-start gap-2 sm:w-auto sm:justify-end">{actions}</div>}
      </div>
    </div>
  );
}

export default PageHeader;
