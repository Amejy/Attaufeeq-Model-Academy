import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function resolveLoginRoute(allowedRoles = []) {
  if (!Array.isArray(allowedRoles) || !allowedRoles.length) {
    return '/login';
  }

  const [firstRole] = allowedRoles;
  if (['admin', 'teacher', 'admissions'].includes(firstRole)) {
    return `/staff-access/${firstRole}`;
  }

  if (['student', 'parent'].includes(firstRole)) {
    return `/login/${firstRole}`;
  }

  return '/login';
}

function ProtectedRoute({ children, allowedRoles, requiredFeature }) {
  const { isAuthenticated, user, profileReady } = useAuth();
  const location = useLocation();

  if (!profileReady) {
    return <div className="min-h-screen bg-white px-6 py-10 text-sm text-slate-600">Loading portal scope...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to={resolveLoginRoute(allowedRoles)} replace />;
  }

  if (user?.mustChangePassword && location.pathname !== '/portal/change-password') {
    return <Navigate to="/portal/change-password" replace />;
  }

  if (!user?.mustChangePassword && location.pathname === '/portal/change-password') {
    return <Navigate to={`/portal/${user?.role || 'student'}`} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    return <Navigate to="/portal" replace />;
  }

  if (
    requiredFeature &&
    user?.role !== 'admin' &&
    !user?.scope?.features?.includes('all') &&
    !user?.scope?.features?.includes(requiredFeature)
  ) {
    return <Navigate to={`/portal/${user?.role || 'student'}`} replace />;
  }

  return children;
}

export default ProtectedRoute;
