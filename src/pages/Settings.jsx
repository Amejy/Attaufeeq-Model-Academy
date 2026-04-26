import { useMemo, useRef, useState } from 'react';
import ErrorState from '../components/ErrorState';
import PasswordField from '../components/PasswordField';
import SmartImage from '../components/SmartImage';
import PortalLayout from '../components/PortalLayout';
import { useAuth } from '../context/AuthContext';
import { canonicalInstitution, institutionAccent } from '../utils/adminInstitution';
import { buildStudentCode } from '../utils/studentCode';

const AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const MAX_AVATAR_SIZE = 4 * 1024 * 1024;
const ROLE_LABELS = {
  admin: 'Administrator',
  admissions: 'Admissions Officer',
  teacher: 'Teacher',
  student: 'Student',
  parent: 'Parent'
};

function getInitials(name = '') {
  const value = String(name || '').trim();
  if (!value) return 'U';
  return value
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

function getPasswordStrength(password = '') {
  const checks = [
    password.length >= 10,
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password)
  ];
  const score = checks.filter(Boolean).length;

  if (!password) {
    return {
      label: 'Waiting for new password',
      tone: 'warning',
      message: 'Add at least 10 characters with a mix of letters, numbers, and symbols.'
    };
  }
  if (score <= 2) {
    return {
      label: 'Weak password',
      tone: 'warning',
      message: 'Increase the length and add upper-case letters, numbers, or symbols.'
    };
  }
  if (score === 3 || score === 4) {
    return {
      label: 'Good password',
      tone: 'neutral',
      message: 'This is better. A symbol or a longer phrase would make it stronger.'
    };
  }
  return {
    label: 'Strong password',
    tone: 'success',
    message: 'This password has a healthy mix of characters for portal security.'
  };
}

function syncAvatarIntoUser(previous, avatarUrl) {
  const nextAvatarUrl = String(avatarUrl || '').trim();
  const avatarVersion = Date.now();
  return {
    ...(previous || {}),
    avatarUrl: nextAvatarUrl,
    avatarVersion,
    profile: {
      ...(previous?.profile || {}),
      avatarUrl: nextAvatarUrl
    },
    student: previous?.student
      ? {
          ...previous.student,
          avatarUrl: nextAvatarUrl
        }
      : previous?.student,
    child: previous?.child
      ? {
          ...previous.child,
          avatarUrl: nextAvatarUrl
        }
      : previous?.child
  };
}

function Settings() {
  const { user, apiFetch, apiJson, updateUser, login, logout } = useAuth();
  const role = user?.role || 'student';
  const [avatarError, setAvatarError] = useState('');
  const [avatarSuccess, setAvatarSuccess] = useState('');
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarHover, setAvatarHover] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  const [refreshSuccess, setRefreshSuccess] = useState('');
  const [showPasswords, setShowPasswords] = useState({
    currentPassword: false,
    newPassword: false,
    confirmPassword: false
  });
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [touched, setTouched] = useState({ currentPassword: false, newPassword: false, confirmPassword: false });
  const fileInputRef = useRef(null);

  const avatarUrl = user?.avatarUrl || user?.profile?.avatarUrl || '';
  const avatarPreviewKey = user?.avatarVersion || avatarUrl || 'default-avatar';
  const currentPasswordValue = form.currentPassword.trim();
  const newPasswordValue = form.newPassword;
  const confirmPasswordValue = form.confirmPassword;
  const newPasswordTooShort = newPasswordValue.length > 0 && newPasswordValue.length < 10;
  const newPasswordMatchesCurrent = newPasswordValue.length > 0 && newPasswordValue === form.currentPassword;
  const confirmMismatch = confirmPasswordValue.length > 0 && newPasswordValue !== confirmPasswordValue;
  const canSubmitPassword =
    currentPasswordValue &&
    newPasswordValue.length >= 10 &&
    newPasswordValue === confirmPasswordValue &&
    newPasswordValue !== form.currentPassword;
  const institutionLabel = canonicalInstitution(
    user?.institution || user?.profile?.institution || user?.student?.institution || user?.child?.institution
  );
  const roleLabel = ROLE_LABELS[role] || 'Portal User';
  const studentCode = useMemo(() => {
    if (!['student', 'parent'].includes(role)) return '';
    const payload = user?.student || user?.child || user;
    if (!payload?.id && !payload?.studentId && !payload?.portalId) return '';
    return buildStudentCode(payload, { institution: institutionLabel });
  }, [institutionLabel, role, user]);
  const accountFacts = [
    { label: 'Portal role', value: roleLabel },
    { label: 'Email address', value: user?.email || user?.profile?.email || 'No email assigned yet' },
    { label: 'Institution', value: institutionLabel || 'ATTAUFEEQ Model Academy' },
    studentCode ? { label: 'Student code', value: studentCode } : null
  ].filter(Boolean);
  const passwordStrength = getPasswordStrength(newPasswordValue);
  const passwordChecks = [
    { label: 'At least 10 characters', passed: newPasswordValue.length >= 10 },
    { label: 'Different from current password', passed: Boolean(newPasswordValue) && !newPasswordMatchesCurrent },
    { label: 'Confirmation matches', passed: Boolean(confirmPasswordValue) && !confirmMismatch && Boolean(newPasswordValue) }
  ];

  function resetAvatarMessages() {
    setAvatarError('');
    setAvatarSuccess('');
  }

  function triggerAvatarPicker() {
    resetAvatarMessages();
    fileInputRef.current?.click();
  }

  async function handleAvatarChange(event) {
    const file = event.target.files?.[0];
    resetAvatarMessages();
    if (!file) return;

    if (!AVATAR_TYPES.has(file.type)) {
      setAvatarError('Only JPG, PNG, GIF, or WebP images are allowed.');
      return;
    }
    if (file.size > MAX_AVATAR_SIZE) {
      setAvatarError('Profile image must be 4MB or smaller.');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      setAvatarBusy(true);
      const response = await apiFetch('/profile/avatar', {
        method: 'POST',
        body: formData
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Unable to upload profile image.');
      }
      updateUser((prev) => ({
        ...syncAvatarIntoUser(prev, data.avatarUrl || data.user?.avatarUrl || ''),
        ...(data.user || {})
      }));
      setAvatarSuccess('Profile image updated successfully.');
    } catch (err) {
      setAvatarError(err.message || 'Unable to upload profile image.');
    } finally {
      setAvatarBusy(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  async function handleAvatarRemove() {
    resetAvatarMessages();
    if (!avatarUrl) {
      setAvatarSuccess('No profile image to remove.');
      return;
    }

    try {
      setAvatarBusy(true);
      const data = await apiJson('/profile/avatar', {
        method: 'DELETE'
      });
      updateUser((prev) => ({
        ...syncAvatarIntoUser(prev, data.avatarUrl || data.user?.avatarUrl || ''),
        ...(data.user || {})
      }));
      setAvatarSuccess('Profile image removed successfully.');
    } catch (err) {
      setAvatarError(err.message || 'Unable to remove profile image.');
    } finally {
      setAvatarBusy(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  async function handlePasswordChange(event) {
    event.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (!currentPasswordValue) {
      setPasswordError('Current password is required.');
      return;
    }
    if (newPasswordValue.length < 10) {
      setPasswordError('New password must be at least 10 characters long.');
      return;
    }
    if (newPasswordValue !== confirmPasswordValue) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }
    if (newPasswordValue === form.currentPassword) {
      setPasswordError('New password must be different from the current password.');
      return;
    }

    try {
      setPasswordBusy(true);
      const data = await apiJson('/auth/change-password', {
        method: 'POST',
        body: {
          currentPassword: currentPasswordValue,
          newPassword: newPasswordValue,
          confirmPassword: confirmPasswordValue
        }
      });
      if (data.token && data.user) {
        login(data);
      } else {
        updateUser((prev) => ({ ...(prev || {}), ...(data.user || {}) }));
      }
      setPasswordSuccess('Password updated successfully.');
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setShowPasswords({ currentPassword: false, newPassword: false, confirmPassword: false });
    } catch (err) {
      setPasswordError(err.message || 'Unable to change password.');
    } finally {
      setPasswordBusy(false);
    }
  }

  async function handleRefreshPortal() {
    setRefreshError('');
    setRefreshSuccess('');
    try {
      setRefreshBusy(true);
      const data = await apiJson('/admin/system/refresh', { method: 'POST' });
      setRefreshSuccess(data?.message || 'Portal data refreshed.');
    } catch (err) {
      setRefreshError(err.message || 'Unable to refresh portal data.');
    } finally {
      setRefreshBusy(false);
    }
  }

  return (
    <PortalLayout
      role={role}
      title="Settings"
      subtitle="Manage your password and profile image. Changes apply immediately across your portal."
    >
      <div className="grid gap-6 xl:grid-cols-[0.86fr,1.14fr]">
        <div className="space-y-6">
          <section className="glass-card interactive-card p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Account Overview</p>
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <div className="h-20 w-20 overflow-hidden rounded-[24px] border border-slate-200 bg-slate-100 shadow-sm">
                {avatarUrl ? (
                  <SmartImage key={avatarPreviewKey} src={avatarUrl} alt="Profile avatar" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-slate-500">
                    {getInitials(user?.fullName || user?.email || 'User')}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="break-words font-heading text-2xl text-primary">{user?.fullName || 'Portal User'}</h2>
                <p className="mt-1 text-sm text-slate-600">{user?.email || 'No email assigned yet'}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-800">
                    {roleLabel}
                  </span>
                  <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${institutionAccent(institutionLabel)}`}>
                    {institutionLabel}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {accountFacts.map((item) => (
                <div key={item.label} className="rounded-[22px] border border-slate-200/80 bg-white/80 px-4 py-3 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                  <p className="mt-2 break-words text-sm font-semibold text-slate-800">{item.value}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="glass-card interactive-card p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Security Check</p>
            <h2 className="mt-2 font-heading text-2xl text-primary">Password readiness</h2>
            <p className="mt-2 text-sm text-slate-600">
              Review these cues before saving a new password so the update goes through on the first try.
            </p>

            <div className={`status-banner mt-5 text-sm ${passwordStrength.tone === 'warning' ? 'status-banner--warning' : ''}`.trim()}>
              <p className="font-semibold">{passwordStrength.label}</p>
              <p className="mt-1">{passwordStrength.message}</p>
            </div>

            <div className="mt-5 space-y-3">
              {passwordChecks.map((item) => (
                <div
                  key={item.label}
                  className={`flex items-center justify-between gap-3 rounded-[20px] border px-4 py-3 text-sm ${
                    item.passed
                      ? 'border-emerald-200 bg-emerald-50/90 text-emerald-900'
                      : 'border-slate-200 bg-white/80 text-slate-600'
                  }`}
                >
                  <span>{item.label}</span>
                  <span className="text-xs font-semibold uppercase tracking-[0.16em]">
                    {item.passed ? 'Ready' : 'Pending'}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="glass-card interactive-card p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Profile Image</p>
          <h2 className="mt-2 font-heading text-2xl text-primary">Update your avatar</h2>
          <p className="mt-2 text-sm text-slate-600">
            Upload a clear headshot. This will show across your dashboard instantly.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-5">
            <button
              type="button"
              onMouseEnter={() => setAvatarHover(true)}
              onMouseLeave={() => setAvatarHover(false)}
              onFocus={() => setAvatarHover(true)}
              onBlur={() => setAvatarHover(false)}
              onClick={triggerAvatarPicker}
              disabled={avatarBusy}
              className="group relative h-28 w-28 overflow-hidden rounded-[28px] border border-slate-200 bg-slate-100 shadow-sm"
              aria-label={avatarUrl ? 'Change profile photo' : 'Upload profile photo'}
            >
              {avatarUrl ? (
                <SmartImage key={avatarPreviewKey} src={avatarUrl} alt="Profile avatar preview" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-slate-500">
                  {getInitials(user?.fullName || user?.email || 'User')}
                </div>
              )}
              <div className={`absolute inset-0 flex items-end justify-center bg-gradient-to-t from-slate-950/60 via-slate-950/18 to-transparent p-3 transition ${avatarHover ? 'opacity-100' : 'opacity-80 group-hover:opacity-100'}`.trim()}>
                <span className="rounded-full bg-white/92 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-800">
                  {avatarUrl ? 'Change Photo' : 'Upload Photo'}
                </span>
              </div>
            </button>
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={triggerAvatarPicker}
                  disabled={avatarBusy}
                  className="interactive-button"
                >
                  {avatarBusy ? 'Uploading...' : avatarUrl ? 'Change Photo' : 'Upload Photo'}
                </button>
                <button
                  type="button"
                  onClick={handleAvatarRemove}
                  disabled={avatarBusy || !avatarUrl}
                  className="interactive-button border-red-200 text-red-700"
                >
                  Remove Photo
                </button>
              </div>
              <p className="text-xs text-slate-500">Only JPG, JPEG, PNG, GIF, or WebP files up to 4MB.</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={handleAvatarChange}
                className="sr-only"
              />
              {avatarError && <ErrorState compact title="Avatar update failed" message={avatarError} onRetry={triggerAvatarPicker} />}
              {avatarSuccess && <p className="status-banner text-xs">{avatarSuccess}</p>}
            </div>
          </div>
          </section>

          <section className="glass-card interactive-card p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Password</p>
          <h2 className="mt-2 font-heading text-2xl text-primary">Change your password</h2>
          <p className="mt-2 text-sm text-slate-600">
            Use at least 10 characters and keep it private.
          </p>

          <form className="mt-5 space-y-3" onSubmit={handlePasswordChange}>
            <PasswordField
              label="Current password"
              value={form.currentPassword}
              onChange={(event) => setForm((prev) => ({ ...prev, currentPassword: event.target.value }))}
              onBlur={() => setTouched((prev) => ({ ...prev, currentPassword: true }))}
              placeholder="Enter current password"
              required
              showPassword={showPasswords.currentPassword}
              onToggleVisibility={() => setShowPasswords((prev) => ({ ...prev, currentPassword: !prev.currentPassword }))}
              autoComplete="current-password"
              error={touched.currentPassword && !currentPasswordValue ? 'Current password is required.' : ''}
            />
            <PasswordField
              label="New password"
              value={form.newPassword}
              onChange={(event) => setForm((prev) => ({ ...prev, newPassword: event.target.value }))}
              onBlur={() => setTouched((prev) => ({ ...prev, newPassword: true }))}
              placeholder="At least 10 characters"
              required
              showPassword={showPasswords.newPassword}
              onToggleVisibility={() => setShowPasswords((prev) => ({ ...prev, newPassword: !prev.newPassword }))}
              autoComplete="new-password"
              error={
                touched.newPassword && newPasswordTooShort
                  ? 'Password must be at least 10 characters.'
                  : touched.newPassword && newPasswordMatchesCurrent
                    ? 'New password must be different from the current one.'
                    : ''
              }
              helperText="Use a strong password you do not use anywhere else."
            />
            <PasswordField
              label="Confirm new password"
              value={form.confirmPassword}
              onChange={(event) => setForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
              onBlur={() => setTouched((prev) => ({ ...prev, confirmPassword: true }))}
              placeholder="Re-enter new password"
              required
              showPassword={showPasswords.confirmPassword}
              onToggleVisibility={() => setShowPasswords((prev) => ({ ...prev, confirmPassword: !prev.confirmPassword }))}
              autoComplete="new-password"
              error={touched.confirmPassword && confirmMismatch ? 'Passwords do not match.' : ''}
            />
            {passwordError && <ErrorState compact title="Password not updated" message={passwordError} />}
            {passwordSuccess && <p className="status-banner text-xs">{passwordSuccess}</p>}
            <button
              type="submit"
              disabled={!canSubmitPassword || passwordBusy}
              className="interactive-button"
            >
              {passwordBusy ? 'Saving...' : 'Update Password'}
            </button>
          </form>
          </section>
        </div>
      </div>

      {role === 'admin' && (
        <section className="glass-card interactive-card mt-6 flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Admin Tools</p>
            <h2 className="mt-2 font-heading text-2xl text-primary">Refresh portal data</h2>
            <p className="mt-2 text-sm text-slate-600">
              Reload assignments, classes, and dashboards from the database without a server restart.
            </p>
            {refreshError && <ErrorState compact title="Refresh failed" message={refreshError} className="mt-3" onRetry={handleRefreshPortal} />}
            {refreshSuccess && <p className="status-banner mt-3 text-xs">{refreshSuccess}</p>}
          </div>
          <button
            type="button"
            onClick={handleRefreshPortal}
            disabled={refreshBusy}
            className="interactive-button border-emerald-200 text-emerald-800"
          >
            {refreshBusy ? 'Refreshing...' : 'Refresh Portal'}
          </button>
        </section>
      )}

      <section className="glass-card interactive-card mt-6 flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Session</p>
          <h2 className="mt-2 font-heading text-2xl text-primary">Sign out safely</h2>
          <p className="mt-2 text-sm text-slate-600">Log out of your portal on this device.</p>
        </div>
        <button
          type="button"
          onClick={logout}
          className="interactive-button border-red-200 text-red-700"
        >
          Logout
        </button>
      </section>
    </PortalLayout>
  );
}

export default Settings;
