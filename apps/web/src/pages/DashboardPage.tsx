import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../api/client';
import { useAuthStore } from '../state/auth-store';

type HealthResponse = { status: string; database: string; timestamp: string };

export function DashboardPage(): JSX.Element {
  const user = useAuthStore((state) => state.user);
  const health = useQuery({
    queryKey: ['api-health'],
    queryFn: () => apiRequest<HealthResponse>('/health'),
  });

  return (
    <div className="dashboard">
      <div className="page-heading">
        <div>
          <p className="eyebrow">COMPANY OVERVIEW</p>
          <h1>Good to have you, {user?.firstName}.</h1>
          <p className="page-subtitle">Your workspace for {user?.companyName}.</p>
        </div>
        <div className="date-stamp">
          <span>LOCAL DATE</span>
          <strong>
            {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date())}
          </strong>
        </div>
      </div>

      <section className="status-band" aria-label="System status">
        <span className={`status-indicator${health.isError ? ' status-down' : ''}`} />
        <div className="status-copy">
          <strong>
            {health.isPending
              ? 'Checking systems'
              : health.isError
                ? 'System check unavailable'
                : 'All core systems operational'}
          </strong>
          <span>
            {health.data
              ? `Database connected · checked ${new Date(health.data.timestamp).toLocaleTimeString()}`
              : 'API and database connection status'}
          </span>
        </div>
        <span className="status-tag">
          {health.data?.database ?? (health.isError ? 'CHECK' : 'CONNECTING')}
        </span>
      </section>

      <div className="section-heading">
        <h2>Workspace access</h2>
        <span>{user?.roleName}</span>
      </div>
      <section className="access-panel">
        <div className="access-intro">
          <span className="access-icon">↗</span>
          <div>
            <strong>{user?.permissions.length ?? 0} permissions assigned</strong>
            <p>Access is managed by your company administrator.</p>
          </div>
        </div>
        <div className="permission-list">
          {user?.permissions.length ? (
            user.permissions.map((permission) => (
              <span className="permission" key={permission}>
                {permission.replace(':', ' · ')}
              </span>
            ))
          ) : (
            <span className="empty-permissions">No additional permissions assigned.</span>
          )}
        </div>
      </section>
      <div className="dashboard-note">
        <span>01</span>
        <p>Operational modules will appear here as your company configures its workspace.</p>
      </div>
    </div>
  );
}
