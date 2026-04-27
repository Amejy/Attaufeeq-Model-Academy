import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSiteContent } from '../context/SiteContentContext';
import { apiJson } from '../utils/publicApi';
import PasswordField from '../components/PasswordField';
import SmartImage from '../components/SmartImage';
import ErrorState from '../components/ErrorState';

const ROLE_LABELS = { student: 'Student', teacher: 'Teacher', parent: 'Parent', admin: 'Admin', admissions: 'Admissions' };
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
  const roleAccessTitle = `${ROLE_LABELS[roleHint]} Access`;
  const displayTitle = isGenericPortalRoute ? variantConfig.title : roleAccessTitle;
  const displaySubtitle = isGenericPortalRoute
    ? variantConfig.subtitle
    : `Secure access for ${ROLE_LABELS[roleHint].toLowerCase()} users inside the ${variant === 'family' ? 'family portal' : 'staff operations portal'}.`;

  const { isAuthenticated, login, user } = useAuth();
  const { siteContent } = useSiteContent();
  const branding = siteContent.branding || {};
  const brandLogo = branding.logoUrl || '/images/logo.png';
  const schoolName = branding.name || 'School';
  const [form, setForm] = useState({ email: '', password: '' });
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
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

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
        setError('Cannot reach backend API. Check VITE_API_BASE_URL (or VITE_API_URL) in your frontend env and confirm the backend is running.');
      } else {
        setError(err.message || 'Unable to login.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="section-wrap py-10 sm:py-16">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.05fr,0.95fr]">
        <section className="glass-panel min-w-0 overflow-hidden p-5 sm:p-9">
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
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">{variantConfig.heroLabel}</p>
          <h1 className="mt-3 break-words font-heading text-3xl text-primary sm:mt-4 sm:text-5xl">{displayTitle}</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-700 sm:mt-4 sm:leading-8">{displaySubtitle}</p>

          <div className="mt-6 rounded-[24px] border border-white/60 bg-white/65 p-4 sm:mt-8 sm:rounded-[28px] sm:p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Current URL</p>
            <p className="text-wrap-safe mt-2 text-base font-semibold text-slate-900 sm:mt-3 sm:text-lg">{location.pathname}</p>
            <p className="mt-2 text-sm leading-6 text-slate-600 sm:leading-7">{variantConfig.heroNote}</p>
          </div>

          <div className="mt-6 grid gap-3 sm:mt-8 sm:gap-4 sm:grid-cols-2">
            {variantConfig.allowedRoles.map((role) => (
              <Link
                key={role}
                to={`${variantConfig.primaryRoute}/${role}`}
                className={`rounded-[20px] border px-4 py-3 text-left transition sm:rounded-[24px] sm:px-5 sm:py-4 ${
                  roleHint === role
                    ? 'border-transparent bg-primary text-white shadow-[0_18px_36px_rgba(15,81,50,0.22)]'
                    : 'border-white/60 bg-white/68 text-slate-700 hover:bg-white'
                }`}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-80">Access Role</p>
                <p className="mt-2 break-words text-base font-semibold sm:text-lg">{ROLE_LABELS[role]}</p>
              </Link>
            ))}
          </div>

        </section>

        <section className="glass-card interactive-card min-w-0 p-5 sm:p-8">
          {sessionMessage && (
            <div className="status-banner status-banner--warning mb-4 text-sm">
              {sessionMessage}
            </div>
          )}
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Sign In</p>
          <h2 className="mt-2 break-words font-heading text-2xl text-primary sm:mt-3 sm:text-3xl">
            Enter Credentials
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600 sm:leading-7">
            Enter your credentials to continue into the {ROLE_LABELS[roleHint].toLowerCase()} workspace.
          </p>

          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
            <label className="field-shell block text-sm">
              <span className="field-label">Email</span>
              <input
                name="email"
                type="email"
                required
                value={form.email}
                onChange={onChange}
                className={`form-field ${emailError ? 'form-field--error' : ''}`.trim()}
                placeholder="you@example.com"
              />
              {emailError ? <p className="field-error">{emailError}</p> : <p className="field-help">Use the exact email issued for this portal.</p>}
            </label>
            <PasswordField
              label="Password"
              name="password"
              required
              value={form.password}
              onChange={onChange}
              placeholder="Enter password"
              showPassword={showPassword}
              onToggleVisibility={() => setShowPassword((prev) => !prev)}
              autoComplete="current-password"
              helperText="Passwords are case-sensitive."
            />

            {error && (
              <ErrorState
                compact
                title="Sign-in failed"
                message={error}
                onRetry={() => setError('')}
              />
            )}

            <button
              type="submit"
              disabled={loading || !canSubmit || Boolean(emailError)}
              className="interactive-button w-full rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-70 sm:py-3"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-600">
            Forgot your password?{' '}
            <Link
              to={`/forgot-password?variant=${encodeURIComponent(variant)}&role=${encodeURIComponent(roleHint)}`}
              className="interactive-link font-semibold text-primary hover:underline"
            >
              Reset it here
            </Link>
          </p>

          <div className="mt-5 text-sm text-slate-600">
            {variant === 'family' ? (
              <>
                Internal school operations account?{' '}
                <Link to="/staff-access" className="interactive-link font-semibold text-primary hover:underline">
                  Open staff access
                </Link>
              </>
            ) : (
              <>
                Student or parent account?{' '}
                <Link to="/login" className="interactive-link font-semibold text-primary hover:underline">
                  Open family login
                </Link>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

export default Login;
