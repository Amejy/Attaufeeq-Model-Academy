import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSiteContent } from '../context/SiteContentContext';
import { apiJson } from '../utils/publicApi';
import { sanitizeUserMessage } from '../utils/userMessage';
import PasswordField from '../components/PasswordField';
import SmartImage from '../components/SmartImage';
import ErrorState from '../components/ErrorState';

const ROLE_LABELS = { student: 'Student', teacher: 'Teacher', parent: 'Parent', admin: 'Admin', admissions: 'Admissions' };
const PORTAL_TABS = [
  { key: 'student', label: 'Student', route: '/login/student', portal: 'family' },
  { key: 'parent', label: 'Parent', route: '/login/parent', portal: 'family' },
  { key: 'staff', label: 'Staff', route: '/staff-access', portal: 'staff' }
];
const LOGIN_VARIANTS = {
  family: {
    title: 'Family Portal',
    subtitle: 'Secure access for students and parents with a calm, direct sign-in flow.',
    allowedRoles: ['student', 'parent'],
    heroLabel: 'Family Access URL',
    heroNote: 'This public login surface is reserved for students and parents.',
    primaryRoute: '/login',
    alternateRoute: '/staff-access'
  },
  staff: {
    title: 'Staff Operations Access',
    subtitle: 'Dedicated internal access for admin, teachers, and admissions operations.',
    allowedRoles: ['admin', 'teacher', 'admissions'],
    heroLabel: 'Internal Access URL',
    heroNote: 'This internal login surface is reserved for school operations staff.',
    primaryRoute: '/staff-access',
    alternateRoute: '/login'
  }
};

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path
        d="M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m4 8 8 6 8-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StudentIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <circle cx="12" cy="8" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5.5 18.2c1.4-2.8 4-4.2 6.5-4.2s5.1 1.4 6.5 4.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ParentIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <circle cx="9" cy="8.2" r="2.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="16.8" cy="9.1" r="2.1" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4.6 18.1c1.1-2.5 3.3-3.9 5.9-3.9 2.1 0 4 1 5.2 2.9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function StaffIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <rect x="4" y="7" width="16" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9 7V5.8A1.8 1.8 0 0 1 10.8 4h2.4A1.8 1.8 0 0 1 15 5.8V7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M4 11.5h16" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path d="M12 3.8 18 6v5.3c0 4-2.4 7-6 8.9-3.6-1.9-6-4.9-6-8.9V6l6-2.2Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="m10.2 11.8 1.3 1.3 2.5-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HeadsetIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path d="M5 12a7 7 0 1 1 14 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <rect x="4" y="11.5" width="3.2" height="6" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <rect x="16.8" y="11.5" width="3.2" height="6" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M17 19c-.8 1.2-2 1.8-3.6 1.8H12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function Login({ variant = 'family', defaultRole = '' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const variantConfig = LOGIN_VARIANTS[variant] || LOGIN_VARIANTS.family;
  const queryRole = searchParams.get('role') || '';
  const routeRole = defaultRole || '';
  const isGenericPortalRoute = location.pathname === variantConfig.primaryRoute;
  const preferredRole = isGenericPortalRoute
    ? queryRole || routeRole
    : routeRole || queryRole;
  const roleHint = variantConfig.allowedRoles.includes(preferredRole) ? preferredRole : variantConfig.allowedRoles[0];

  const { isAuthenticated, login, user } = useAuth();
  const { siteContent } = useSiteContent();
  const branding = siteContent.branding || {};
  const brandLogo = branding.logoUrl || '/images/logo.png';
  const schoolName = branding.name || 'School';
  const [form, setForm] = useState({ email: '', password: '', rememberMe: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sessionMessage, setSessionMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const emailError =
    form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(form.email || '').trim())
      ? 'Email format is incorrect.'
      : '';
  const canSubmit = Boolean(String(form.email || '').trim() && String(form.password || '').trim());

  useEffect(() => {
    const expiredFlag = location.state?.sessionExpired || false;
    const storedFlag = (() => {
      try {
        return sessionStorage.getItem('session-expired') === '1';
      } catch {
        return false;
      }
    })();
    if (expiredFlag || storedFlag) {
      setSessionMessage('Your session expired. Please log in again.');
      try {
        sessionStorage.removeItem('session-expired');
      } catch {
        // ignore storage failures
      }
    }
  }, [location.state]);

  if (isAuthenticated) {
    return <Navigate to={user?.mustChangePassword ? '/portal/change-password' : '/portal'} replace />;
  }

  const onChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const activePortalTab = variant === 'family'
    ? (roleHint === 'parent' ? 'parent' : 'student')
    : 'staff';

  const onSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setSessionMessage('');

    try {
      const data = await apiJson('/auth/login', {
        method: 'POST',
        credentials: 'include',
        body: {
          email: String(form.email || '').trim(),
          password: form.password
        }
      });

      const authenticatedRole = data.user?.role || '';
      if (!variantConfig.allowedRoles.includes(authenticatedRole)) {
        const correctPortal = LOGIN_VARIANTS.family.allowedRoles.includes(authenticatedRole)
          ? '/login'
          : '/staff-access';
        try {
          await apiJson('/auth/logout', {
            method: 'POST',
            credentials: 'include'
          });
        } catch {
          // Best-effort cleanup. The portal mismatch message is still the primary signal.
        }
        throw new Error(
          `This account belongs to the ${correctPortal === '/login' ? 'family portal' : 'staff operations portal'}. Use ${correctPortal} instead.`
        );
      }

      login(data);
      navigate(data.user?.mustChangePassword ? '/portal/change-password' : `/portal/${data.user?.role || 'student'}`, { replace: true });
    } catch (err) {
      const message = String(err?.message || '');
      if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
        setError('We could not reach the school portal right now. Please check your connection and try again.');
      } else {
        setError(sanitizeUserMessage(err.message, 'We could not sign you in right now.'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-shell section-wrap py-6 sm:py-8 lg:py-10">
      <div className="login-reference-shell mx-auto max-w-7xl">
        <div className="login-reference-card">
        <section className="login-display-panel min-w-0 overflow-hidden p-6 sm:p-8 lg:p-10">
          <div className="login-logo-row">
            <SmartImage
              src={brandLogo}
              fallbackSrc="/images/logo.png"
              alt={`${branding.name || 'School'} logo`}
              className="login-logo"
            />
            <div className="min-w-0">
              <p className="login-logo__label text-label-clamp" title={schoolName}>{schoolName}</p>
              <p className="login-logo__motto text-label-clamp" title={branding.motto}>{branding.motto}</p>
            </div>
          </div>
          <div className="login-welcome-copy">
            <h1 className="login-display-title">Welcome Back</h1>
            <p className="login-display-copy">
              Sign in to continue your learning journey.
            </p>
          </div>

          <div className="login-campus-illustration" aria-hidden="true">
            <div className="login-cloud login-cloud--one" />
            <div className="login-cloud login-cloud--two" />
            <div className="login-cloud login-cloud--three" />
            <div className="login-campus-illustration__birds">
              <span />
              <span />
              <span />
            </div>
            <div className="login-campus-illustration__ground" />
            <div className="login-campus-illustration__building">
              <div className="login-campus-illustration__roof" />
              <div className="login-campus-illustration__tower">
                <div className="login-campus-illustration__clock" />
              </div>
              <div className="login-campus-illustration__body">
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
              <div className="login-campus-illustration__door" />
            </div>
            <div className="login-tree login-tree--left" />
            <div className="login-tree login-tree--right" />
          </div>

          <div className="login-benefit-grid">
            <article className="login-benefit-card">
              <span className="login-benefit-card__icon"><StudentIcon /></span>
              <p className="login-benefit-card__title">Quality Education</p>
              <p className="login-benefit-card__copy">Excellence in learning</p>
            </article>
            <article className="login-benefit-card">
              <span className="login-benefit-card__icon"><ShieldIcon /></span>
              <p className="login-benefit-card__title">Secure &amp; Safe</p>
              <p className="login-benefit-card__copy">Your data is protected</p>
            </article>
            <article className="login-benefit-card">
              <span className="login-benefit-card__icon"><ParentIcon /></span>
              <p className="login-benefit-card__title">Connected Community</p>
              <p className="login-benefit-card__copy">Students, parents, staff</p>
            </article>
          </div>

        </section>

        <section className="login-auth-panel login-auth-card min-w-0 p-5 sm:p-7 lg:p-8">
          {sessionMessage && (
            <div className="status-banner status-banner--warning mb-4 text-sm">
              {sessionMessage}
            </div>
          )}
          <div className="login-auth-panel__intro">
            <div>
              <h2 className="login-auth-title">
                Sign In
              </h2>
              <div className="login-auth-divider" aria-hidden="true">
                <span />
                <span className="login-auth-divider__badge"><ShieldIcon /></span>
                <span />
              </div>
            </div>
            <p className="login-auth-copy">
              Choose your portal and sign in to continue.
            </p>
          </div>

          <div className="login-portal-tabs" role="tablist" aria-label="Portal access options">
            {PORTAL_TABS.map((tab) => {
              const isActive = activePortalTab === tab.key;
              const icon = tab.key === 'student' ? <StudentIcon /> : tab.key === 'parent' ? <ParentIcon /> : <StaffIcon />;
              return (
                <Link
                  key={tab.key}
                  to={tab.route}
                  role="tab"
                  aria-selected={isActive}
                  className={`login-portal-tab ${isActive ? 'login-portal-tab--active' : ''}`}
                >
                  {icon}
                  <span>{tab.label}</span>
                </Link>
              );
            })}
          </div>

          <form className="login-auth-panel__form" onSubmit={onSubmit}>
            <label className="field-shell block text-sm">
              <span className="field-label login-field-label">Email Address</span>
              <div className="login-field-shell">
                <span className="login-field-icon"><MailIcon /></span>
                <input
                  name="email"
                  type="email"
                  required
                  value={form.email}
                  onChange={onChange}
                  className={`form-field login-form-field ${emailError ? 'form-field--error' : ''}`.trim()}
                  placeholder="Enter your email address"
                />
              </div>
              {emailError ? <p className="field-error">{emailError}</p> : null}
            </label>
            <PasswordField
              label="Password"
              name="password"
              required
              value={form.password}
              onChange={onChange}
              placeholder="Enter your password"
              showPassword={showPassword}
              onToggleVisibility={() => setShowPassword((prev) => !prev)}
              autoComplete="current-password"
              className="form-field login-form-field login-form-field--password w-full pr-20 text-sm"
              helperText=""
            />

            {error && (
              <ErrorState
                compact
                title="Sign-in failed"
                message={error}
                onRetry={() => setError('')}
              />
            )}

            <div className="login-form-row">
              <label className="login-remember-toggle">
                <input
                  type="checkbox"
                  name="rememberMe"
                  checked={Boolean(form.rememberMe)}
                  onChange={onChange}
                />
                <span>Remember me</span>
              </label>
              <Link
                to={`/forgot-password?variant=${encodeURIComponent(variant)}&role=${encodeURIComponent(roleHint)}`}
                className="interactive-link login-forgot-link"
              >
                Forgot Password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading || !canSubmit || Boolean(emailError)}
              className="interactive-button login-submit-button"
            >
              <span>{loading ? 'Signing in...' : 'Sign In'}</span>
            </button>
          </form>

          <div className="login-auth-panel__meta">
            <div className="login-help-divider" aria-hidden="true">
              <span />
              <p>Need help?</p>
              <span />
            </div>
            <div className="login-help-card">
              <span className="login-help-card__icon"><HeadsetIcon /></span>
              <div>
                <p className="login-help-card__title">Having trouble signing in?</p>
                <p className="login-help-card__copy">
                  Contact the school administrator for assistance.
                </p>
              </div>
            </div>
          </div>
        </section>
        </div>
      </div>
    </main>
  );
}

export default Login;
