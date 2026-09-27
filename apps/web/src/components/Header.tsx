import { useMutation } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { publicRequest } from '../api/client';
import { activateCompanyContext } from '../api/company-context';
import { useAuthStore } from '../state/auth-store';

const pageNames: Record<string, string> = {
  '/': 'Overview',
  '/companies': 'Companies',
  '/users': 'Users',
  '/roles': 'Roles & permissions',
};

export function Header(): JSX.Element {
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);
  const activeCompanyId = useAuthStore((state) => state.activeCompanyId);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const switchCompany = useMutation({
    mutationFn: async (companyId: string) => {
      await activateCompanyContext(companyId);
      await queryClient.invalidateQueries();
    },
    onSuccess: () => navigate('/', { replace: true }),
  });
  const logoutMutation = useMutation({
    mutationFn: () => publicRequest<void>('/auth/logout', { method: 'POST' }),
    onSettled: () => {
      clearSession();
      navigate('/login', { replace: true });
    },
  });

  return (
    <header className="topbar">
      <div className="breadcrumbs">
        <span>Workspace</span>
        <span className="crumb-divider">/</span>
        <strong>{pageNames[location.pathname] ?? 'Company workspace'}</strong>
      </div>
      <div className="topbar-actions">
        {(user?.companies.length ?? 0) > 1 && (
          <label className="company-switcher">
            <span>Company</span>
            <select
              aria-label="Active company"
              value={activeCompanyId ?? user?.companyId}
              onChange={(event) => switchCompany.mutate(event.target.value)}
              disabled={switchCompany.isPending}
            >
              {user?.companies.map((company) => (
                <option value={company.id} key={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="user-chip">
          <span className="avatar">
            {user?.firstName.slice(0, 1)}
            {user?.lastName.slice(0, 1)}
          </span>
          <span className="user-name">
            {user?.firstName} {user?.lastName}
          </span>
        </div>
        <button
          className="quiet-button"
          type="button"
          onClick={() => logoutMutation.mutate()}
          disabled={logoutMutation.isPending}
        >
          {logoutMutation.isPending ? 'Signing out...' : 'Sign out'}
        </button>
      </div>
    </header>
  );
}
