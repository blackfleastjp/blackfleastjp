import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../state/auth-store';

export function ProtectedRoute(): JSX.Element {
  const initialized = useAuthStore((state) => state.initialized);
  const user = useAuthStore((state) => state.user);
  const location = useLocation();

  if (!initialized)
    return <main className="session-loading min-h-screen">Restoring your session...</main>;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}
