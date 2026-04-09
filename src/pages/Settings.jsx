import { useRef, useState } from 'react';
import PortalLayout from '../components/PortalLayout';
import { useAuth } from '../context/AuthContext';

const AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const MAX_AVATAR_SIZE = 4 * 1024 * 1024;

function Settings() {
  const { user, apiFetch, apiJson, updateUser, logout } = useAuth();
  const role = user?.role || 'student';
  const [avatarError, setAvatarError] = useState('');
  const [avatarSuccess, setAvatarSuccess] = useState('');
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  const [refreshSuccess, setRefreshSuccess] = useState('');
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [touched, setTouched] = useState({ currentPassword: false, newPassword: false, confirmPassword: false });
  const fileInputRef = useRef(null);

  const avatarUrl = user?.avatarUrl || '';
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

  function resetAvatarMessages() {
    setAvatarError('');
    setAvatarSuccess('');
  }

  function triggerAvatarPicker() {
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
      updateUser((prev) => ({ ...(prev || {}), ...(data.user || {}), avatarUrl: data.avatarUrl || data.user?.avatarUrl || '' }));
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
      updateUser((prev) => ({ ...(prev || {}), ...(data.user || {}) }));
      setPasswordSuccess('Password updated successfully.');
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
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
      <div className="grid gap-6 lg:grid-cols-[1.1fr,0.9fr]">
        <section className="glass-card p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Profile Image</p>
          <h2 className="mt-2 font-heading text-2xl text-primary">Update your avatar</h2>
          <p className="mt-2 text-sm text-slate-600">
            Upload a clear headshot. This will show across your dashboard instantly.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-5">
            <div className="h-24 w-24 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Profile avatar" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-slate-500">
                  {user?.fullName?.split(' ').slice(0, 2).map((part) => part[0]).join('') || 'U'}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <button
                type="button"
                onClick={triggerAvatarPicker}
                disabled={avatarBusy}
                className="rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-700 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {avatarBusy ? 'Uploading...' : 'Choose Image'}
              </button>
              <p className="text-xs text-slate-500">JPG, PNG, GIF, or WebP. Max 4MB.</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={handleAvatarChange}
                className="sr-only"
              />
              {avatarError && <p className="text-xs text-red-600">{avatarError}</p>}
              {avatarSuccess && <p className="text-xs text-emerald-700">{avatarSuccess}</p>}
            </div>
          </div>
        </section>

        <section className="glass-card p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Password</p>
          <h2 className="mt-2 font-heading text-2xl text-primary">Change your password</h2>
          <p className="mt-2 text-sm text-slate-600">
            Use at least 10 characters and keep it private.
          </p>

          <form className="mt-5 space-y-3" onSubmit={handlePasswordChange}>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">Current password</span>
              <input
                type="password"
                value={form.currentPassword}
                onChange={(event) => setForm((prev) => ({ ...prev, currentPassword: event.target.value }))}
                onBlur={() => setTouched((prev) => ({ ...prev, currentPassword: true }))}
                className="w-full rounded-md border border-slate-300 px-3 py-2"
                placeholder="Enter current password"
                required
              />
              {touched.currentPassword && !currentPasswordValue && (
                <p className="mt-1 text-xs text-red-600">Current password is required.</p>
              )}
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">New password</span>
              <input
                type="password"
                value={form.newPassword}
                onChange={(event) => setForm((prev) => ({ ...prev, newPassword: event.target.value }))}
                onBlur={() => setTouched((prev) => ({ ...prev, newPassword: true }))}
                className="w-full rounded-md border border-slate-300 px-3 py-2"
                placeholder="At least 10 characters"
                required
              />
              {touched.newPassword && newPasswordTooShort && (
                <p className="mt-1 text-xs text-red-600">Password must be at least 10 characters.</p>
              )}
              {touched.newPassword && newPasswordMatchesCurrent && (
                <p className="mt-1 text-xs text-red-600">New password must be different from the current one.</p>
              )}
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">Confirm new password</span>
              <input
                type="password"
                value={form.confirmPassword}
                onChange={(event) => setForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
                onBlur={() => setTouched((prev) => ({ ...prev, confirmPassword: true }))}
                className="w-full rounded-md border border-slate-300 px-3 py-2"
                placeholder="Re-enter new password"
                required
              />
              {touched.confirmPassword && confirmMismatch && (
                <p className="mt-1 text-xs text-red-600">Passwords do not match.</p>
              )}
            </label>
            {passwordError && <p className="text-xs text-red-600">{passwordError}</p>}
            {passwordSuccess && <p className="text-xs text-emerald-700">{passwordSuccess}</p>}
            <button
              type="submit"
              disabled={!canSubmitPassword || passwordBusy}
              className="rounded-full bg-primary px-6 py-2.5 text-xs font-semibold uppercase tracking-[0.2em] text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {passwordBusy ? 'Saving...' : 'Update Password'}
            </button>
          </form>
        </section>
      </div>

      {role === 'admin' && (
        <section className="glass-card mt-6 flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Admin Tools</p>
            <h2 className="mt-2 font-heading text-2xl text-primary">Refresh portal data</h2>
            <p className="mt-2 text-sm text-slate-600">
              Reload assignments, classes, and dashboards from the database without a server restart.
            </p>
            {refreshError && <p className="mt-2 text-xs text-red-600">{refreshError}</p>}
            {refreshSuccess && <p className="mt-2 text-xs text-emerald-700">{refreshSuccess}</p>}
          </div>
          <button
            type="button"
            onClick={handleRefreshPortal}
            disabled={refreshBusy}
            className="rounded-full border border-emerald-200 bg-emerald-50 px-6 py-2.5 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {refreshBusy ? 'Refreshing...' : 'Refresh Portal'}
          </button>
        </section>
      )}

      <section className="glass-card mt-6 flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Session</p>
          <h2 className="mt-2 font-heading text-2xl text-primary">Sign out safely</h2>
          <p className="mt-2 text-sm text-slate-600">Log out of your portal on this device.</p>
        </div>
        <button
          type="button"
          onClick={logout}
          className="rounded-full border border-red-200 bg-red-50 px-6 py-2.5 text-xs font-semibold uppercase tracking-[0.2em] text-red-700 hover:bg-red-100"
        >
          Logout
        </button>
      </section>
    </PortalLayout>
  );
}

export default Settings;
