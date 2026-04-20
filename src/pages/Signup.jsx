import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSiteContent } from '../context/SiteContentContext';

function Signup() {
  const { isAuthenticated } = useAuth();
  const { siteContent } = useSiteContent();
  const branding = siteContent.branding || {};

  if (isAuthenticated) {
    return <Navigate to="/portal" replace />;
  }

  return (
    <main className="section-wrap py-16">
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="break-words text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{branding.name || 'School'}</p>
        <h1 className="break-words font-heading text-3xl text-primary">Parent Access</h1>
        <p className="mt-2 text-sm text-slate-600">
          Parent accounts are created during admission registration. Use the issued parent login details, or contact the school if you need your portal access resent.
        </p>
        <div className="mt-6 space-y-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Self-signup is not enabled for this portal. Parent access is linked to a student admission record.
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Link
              to="/admissions"
              className="rounded-md bg-primary px-4 py-2 text-center text-sm font-semibold text-white hover:bg-emerald-800"
            >
              Start Admission
            </Link>
            <Link
              to="/login/parent"
              className="rounded-md border border-slate-300 px-4 py-2 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Parent Login
            </Link>
          </div>
        </div>

        <p className="mt-6 break-words text-center text-sm text-slate-600">
          Need help accessing the portal?{' '}
          <Link to="/login/parent" className="font-semibold text-primary hover:underline">
            Log in here
          </Link>
        </p>
      </div>
    </main>
  );
}

export default Signup;
