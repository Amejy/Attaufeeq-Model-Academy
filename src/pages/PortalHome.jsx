import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function PortalHome() {
  const { user } = useAuth();

  if (!user?.role) {
    return <Navigate to="/login" replace />;
  }

  return <Navigate to={`/portal/${user.role}`} replace />;
}

export default PortalHome;
