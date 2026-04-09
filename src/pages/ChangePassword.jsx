import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PortalLayout from '../components/PortalLayout';
import { useAuth } from '../context/AuthContext';

function ChangePassword() {
  const navigate = useNavigate();
  const { apiJson, user, updateUser, login } = useAuth();
  const [form, setForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [touched, setTouched] = useState({ currentPassword: false, newPassword: false, confirmPassword: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const currentPasswordValue = String(form.currentPassword || '');
  const newPasswordValue = String(form.newPassword || '');
  const confirmPasswordValue = String(form.confirmPassword || '');
  const newPasswordTooShort = newPasswordValue.length > 0 && newPasswordValue.length < 10;
  const newPasswordMatchesCurrent = newPasswordValue.length > 0 && newPasswordValue === currentPasswordValue;
  const confirmMismatch = confirmPasswordValue.length > 0 && newPasswordValue !== confirmPasswordValue;
  const canSubmit =
    currentPasswordValue.length > 0 &&
    newPasswordValue.length >= 10 &&
    newPasswordValue === confirmPasswordValue &&
    newPasswordValue !== currentPasswordValue;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const data = await apiJson('/auth/change-password', { method: 'POST', body: form });

      if (data.token && data.user) {
        login(data);
      } else {
        updateUser(data.user);
      }
      setSuccess('Password updated. Redirecting to your dashboard...');
      window.setTimeout(() => {
        navigate(`/portal/${data.user?.role || user?.role || 'student'}`, { replace: true });
      }, 700);
    } catch (err) {
      setError(err.message || 'Unable to change password.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <PortalLayout
      role={user?.role || 'student'}
      title="Secure Your Account"
      subtitle="This account was provisioned by the school. Set a new private password before you continue."
    >
      <div className="mx-auto max-w-2xl rounded-[32px] border border-amber-200 bg-[linear-gradient(135deg,rgba(251,191,36,0.12),rgba(15,118,110,0.08))] p-6">
        <div className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-700">First login protection</p>
          <h2 className="mt-3 font-heading text-3xl text-primary">Change the temporary password now</h2>
          <p className="mt-2 text-sm text-slate-600">
            Portal access stays locked to this screen until a new password is saved. Use at least 10 characters.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Temporary password</span>
              <input
                type="password"
                value={form.currentPassword}
                onChange={(event) => setForm((prev) => ({ ...prev, currentPassword: event.target.value }))}
                onBlur={() => setTouched((prev) => ({ ...prev, currentPassword: true }))}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3"
                required
              />
              {touched.currentPassword && !currentPasswordValue && (
                <p className="mt-1 text-xs text-red-600">Temporary password is required.</p>
              )}
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">New password</span>
              <input
                type="password"
                value={form.newPassword}
                onChange={(event) => setForm((prev) => ({ ...prev, newPassword: event.target.value }))}
                onBlur={() => setTouched((prev) => ({ ...prev, newPassword: true }))}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3"
                required
              />
              {touched.newPassword && newPasswordTooShort && (
                <p className="mt-1 text-xs text-red-600">Password must be at least 10 characters.</p>
              )}
              {touched.newPassword && newPasswordMatchesCurrent && (
                <p className="mt-1 text-xs text-red-600">New password must be different from the current one.</p>
              )}
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Confirm new password</span>
              <input
                type="password"
                value={form.confirmPassword}
                onChange={(event) => setForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
                onBlur={() => setTouched((prev) => ({ ...prev, confirmPassword: true }))}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3"
                required
              />
              {touched.confirmPassword && confirmMismatch && (
                <p className="mt-1 text-xs text-red-600">Passwords do not match.</p>
              )}
            </label>

            {error && <p className="text-sm text-red-600">{error}</p>}
            {success && <p className="text-sm text-emerald-700">{success}</p>}

            <button
              type="submit"
              disabled={loading || !canSubmit}
              className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Saving new password...' : 'Save New Password'}
            </button>
          </form>
        </div>
      </div>
    </PortalLayout>
  );
}

export default ChangePassword;
