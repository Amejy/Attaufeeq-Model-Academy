import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import ErrorState from '../components/ErrorState';
import PasswordField from '../components/PasswordField';
import SmartImage from '../components/SmartImage';
import { useSiteContent } from '../context/SiteContentContext';
import { apiJson } from '../utils/publicApi';

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function ForgotPassword() {
  const [searchParams] = useSearchParams();
  const { siteContent } = useSiteContent();
  const branding = siteContent.branding || {};
  const brandLogo = branding.logoUrl || '/images/logo.png';
  const schoolName = branding.name || 'School';
  const variant = searchParams.get('variant') === 'staff' ? 'staff' : 'family';
  const roleParam = String(searchParams.get('role') || '').trim().toLowerCase();
  const validFamilyRoles = new Set(['student', 'parent']);
  const validStaffRoles = new Set(['admin', 'teacher', 'admissions']);
  const defaultRole = variant === 'staff' ? 'admin' : 'student';
  const role = (
    (variant === 'staff' && validStaffRoles.has(roleParam)) ||
    (variant === 'family' && validFamilyRoles.has(roleParam))
  ) ? roleParam : defaultRole;
  const loginHref = variant === 'staff' ? `/staff-access/${role}` : `/login/${role}`;
  const [email, setEmail] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [requestMessage, setRequestMessage] = useState('');
  const [requestError, setRequestError] = useState('');
  const [resetCode, setResetCode] = useState('');

  const [resetForm, setResetForm] = useState({
    email: '',
    code: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [resetting, setResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const [resetError, setResetError] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const requestEmailError = email && !isValidEmail(email) ? 'Email format is incorrect.' : '';
  const resetEmailError = resetForm.email && !isValidEmail(resetForm.email) ? 'Email format is incorrect.' : '';
  const confirmPasswordError =
    resetForm.confirmPassword && resetForm.newPassword !== resetForm.confirmPassword
      ? 'Passwords do not match.'
      : '';
  const canRequestReset = isValidEmail(email);
  const canSubmitReset =
    isValidEmail(resetForm.email) &&
    String(resetForm.code || '').trim() &&
    String(resetForm.newPassword || '').length >= 10 &&
    resetForm.newPassword === resetForm.confirmPassword;

  const onResetChange = (event) => {
    const { name, value } = event.target;
    setResetForm((prev) => ({ ...prev, [name]: value }));
  };

  async function requestReset(event) {
    event.preventDefault();
    if (!canRequestReset) return;
    const normalizedEmail = String(email || '').trim();
    setRequesting(true);
    setRequestMessage('');
    setRequestError('');
    setResetMessage('');
    setResetError('');

    try {
      const data = await apiJson('/auth/forgot-password', {
        method: 'POST',
        body: { email: normalizedEmail }
      });

      setRequestMessage(data.message || 'Reset code sent if the account exists.');
      setResetCode(data.resetCode || '');
      setResetForm((prev) => ({
        ...prev,
        email: normalizedEmail
      }));
    } catch (err) {
      setRequestError(err.message || 'Unable to request reset.');
    } finally {
      setRequesting(false);
    }
  }

  async function submitReset(event) {
    event.preventDefault();
    if (!canSubmitReset) return;
    const payload = {
      ...resetForm,
      email: String(resetForm.email || '').trim(),
      code: String(resetForm.code || '').trim()
    };
    setResetting(true);
    setResetMessage('');
    setResetError('');

    try {
      const data = await apiJson('/auth/reset-password', {
        method: 'POST',
        body: payload
      });

      setResetMessage(data.message || 'Password reset successfully. You can log in now.');
      setResetForm({
        email: payload.email,
        code: '',
        newPassword: '',
        confirmPassword: ''
      });
    } catch (err) {
      setResetError(err.message || 'Unable to reset password.');
    } finally {
      setResetting(false);
    }
  }

  return (
    <main className="section-wrap py-16">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.1fr,0.9fr]">
        <section className="glass-panel min-w-0 overflow-hidden p-6 sm:p-9">
          <div className="login-logo-row">
            <SmartImage
              src={brandLogo}
              fallbackSrc="/images/logo.png"
              alt={`${branding.name || 'School'} logo`}
              className="login-logo"
            />
            <div className="min-w-0">
              <p className="login-logo__label break-words">{schoolName}</p>
              <p className="login-logo__motto break-words">{branding.motto}</p>
            </div>
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Account Recovery</p>
          <h1 className="mt-4 break-words font-heading text-4xl text-primary sm:text-5xl">Forgot Password</h1>
          <p className="mt-4 max-w-xl text-sm leading-8 text-slate-700">
            Enter the email address linked to your portal account. We will send a short reset code that allows you to set a new password.
          </p>

          <div className="mt-8 rounded-[28px] bg-[linear-gradient(135deg,rgba(15,81,50,0.92),rgba(217,179,84,0.85))] p-5 text-white">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">Need help?</p>
            <p className="mt-3 text-sm leading-7 text-white/90">
              If you no longer have access to your email, contact school administration to reset the account from the staff portal.
            </p>
          </div>
        </section>

        <section className="glass-card interactive-card min-w-0 p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Step 1</p>
          <h2 className="mt-3 break-words font-heading text-3xl text-primary">Request reset code</h2>
          <form className="mt-5 space-y-4" onSubmit={requestReset}>
            <label className="field-shell block text-sm">
              <span className="field-label">Email</span>
              <input
                name="email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={`form-field ${requestEmailError ? 'form-field--error' : ''}`.trim()}
                placeholder="you@example.com"
              />
              {requestEmailError ? <p className="field-error">{requestEmailError}</p> : <p className="field-help">Use the email currently attached to your portal account.</p>}
            </label>
            {requestError && (
              <ErrorState
                compact
                title="Reset code not sent"
                message={requestError}
                onRetry={() => setRequestError('')}
              />
            )}
            {requestMessage && <p className="status-banner text-sm">{requestMessage}</p>}
            {resetCode && (
              <div className="status-banner status-banner--warning text-sm">
                Reset code: <span className="font-semibold">{resetCode}</span>
              </div>
            )}
            <button
              type="submit"
              disabled={requesting || !canRequestReset}
              className="interactive-button w-full rounded-full bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {requesting ? 'Sending...' : 'Send reset code'}
            </button>
          </form>

          <div className="my-8 h-px bg-slate-200" />

          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Step 2</p>
          <h2 className="mt-3 break-words font-heading text-3xl text-primary">Set a new password</h2>
          <form className="mt-5 space-y-4" onSubmit={submitReset}>
            <label className="field-shell block text-sm">
              <span className="field-label">Email</span>
              <input
                name="email"
                type="email"
                required
                value={resetForm.email}
                onChange={onResetChange}
                className={`form-field ${resetEmailError ? 'form-field--error' : ''}`.trim()}
                placeholder="you@example.com"
              />
              {resetEmailError && <p className="field-error">{resetEmailError}</p>}
            </label>
            <label className="field-shell block text-sm">
              <span className="field-label">Reset Code</span>
              <input
                name="code"
                required
                value={resetForm.code}
                onChange={onResetChange}
                className="form-field"
                placeholder="Enter the 6-digit code"
              />
            </label>
            <PasswordField
              label="New Password"
              name="newPassword"
              required
              value={resetForm.newPassword}
              onChange={onResetChange}
              placeholder="Minimum 10 characters"
              showPassword={showNewPassword}
              onToggleVisibility={() => setShowNewPassword((prev) => !prev)}
              autoComplete="new-password"
              helperText="Choose at least 10 characters for better security."
            />
            <PasswordField
              label="Confirm Password"
              name="confirmPassword"
              required
              value={resetForm.confirmPassword}
              onChange={onResetChange}
              placeholder="Re-enter password"
              showPassword={showConfirmPassword}
              onToggleVisibility={() => setShowConfirmPassword((prev) => !prev)}
              autoComplete="new-password"
              error={confirmPasswordError}
            />
            {resetError && (
              <ErrorState
                compact
                title="Password not updated"
                message={resetError}
                onRetry={() => setResetError('')}
              />
            )}
            {resetMessage && <p className="status-banner text-sm">{resetMessage}</p>}
            <button
              type="submit"
              disabled={resetting || !canSubmitReset}
              className="interactive-button w-full rounded-full bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {resetting ? 'Updating...' : 'Update password'}
            </button>
          </form>

          <div className="mt-6 break-words text-sm text-slate-600">
            Back to login?{' '}
            <Link to={loginHref} className="interactive-link font-semibold text-primary hover:underline">
              Sign in here
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

export default ForgotPassword;
