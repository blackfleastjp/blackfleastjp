import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { apiRequest } from '../api/client';
import { usePermissions } from '../auth/has-permission';
import type { Company, ManagedUser } from '../types/erp';

type CompanyTab = 'details' | 'settings' | 'users' | 'backup';
const tabs: Array<{ id: CompanyTab; label: string }> = [
  { id: 'details', label: 'Details' },
  { id: 'settings', label: 'Settings' },
  { id: 'users', label: 'Users' },
  { id: 'backup', label: 'Backup' },
];

const features = [
  { key: 'enableAccounting', label: 'Accounting', detail: 'Ledgers and financial reporting' },
  { key: 'enableInventory', label: 'Inventory', detail: 'Stock and warehouse operations' },
  { key: 'enableGst', label: 'GST', detail: 'Tax and GST compliance' },
  { key: 'enablePayroll', label: 'Payroll', detail: 'Employee payroll processing' },
] as const;

export function CompanyDetailPage(): JSX.Element {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<CompanyTab>('details');
  const [backupId, setBackupId] = useState('');
  const [operationError, setOperationError] = useState('');
  const permissions = usePermissions();
  const canReadUsers = permissions.includes('users:read');
  const canBackup = permissions.includes('companies:backup');
  const canRestore = permissions.includes('companies:restore');
  const canUpdate = permissions.includes('companies:update');
  const canActivate = permissions.includes('companies:activate');
  const canCreateUsers = permissions.includes('users:create');
  const visibleTabs = tabs
    .filter((item) => item.id !== 'users' || canReadUsers)
    .filter((item) => item.id !== 'backup' || canBackup || canRestore);
  const companyQuery = useQuery({
    queryKey: ['company', id],
    queryFn: () => apiRequest<{ company: Company }>(`/companies/${id}`),
  });
  const userQuery = useQuery({
    queryKey: ['users', id, 'company-tab'],
    queryFn: () =>
      apiRequest<{ users: ManagedUser[]; total: number }>('/users?status=all&pageSize=8'),
    enabled: tab === 'users' && canReadUsers,
  });

  const refreshCompany = async () => {
    await queryClient.invalidateQueries({ queryKey: ['company', id] });
    await queryClient.invalidateQueries({ queryKey: ['companies'] });
  };
  const statusMutation = useMutation({
    mutationFn: (isActive: boolean) =>
      apiRequest(`/companies/${id}/activate`, {
        method: 'POST',
        body: JSON.stringify({ isActive }),
      }),
    onSuccess: refreshCompany,
    onError: (error) => setOperationError(error.message),
  });
  const featureMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: boolean }) =>
      apiRequest(`/companies/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ [key]: value }),
      }),
    onSuccess: refreshCompany,
    onError: (error) => setOperationError(error.message),
  });
  const backupMutation = useMutation({
    mutationFn: () =>
      apiRequest<{ backup: { id: string } }>(`/companies/${id}/backup`, {
        method: 'POST',
        body: JSON.stringify({ name: `Snapshot ${new Date().toLocaleString()}` }),
      }),
    onSuccess: async ({ backup }) => {
      setBackupId(backup.id);
      setOperationError('');
      await refreshCompany();
    },
    onError: (error) => setOperationError(error.message),
  });
  const restoreMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/companies/${id}/restore`, {
        method: 'POST',
        body: JSON.stringify({ backupId }),
      }),
    onSuccess: async () => {
      setOperationError('');
      await refreshCompany();
    },
    onError: (error) => setOperationError(error.message),
  });

  if (companyQuery.isPending) return <p className="empty-state">Loading company...</p>;
  if (companyQuery.isError)
    return (
      <div className="empty-state">
        <p>{companyQuery.error.message}</p>
        <button className="button-secondary" onClick={() => navigate('/companies')}>
          Back to companies
        </button>
      </div>
    );
  const company = companyQuery.data.company;

  return (
    <div className="erp-page">
      <div className="page-heading company-heading">
        <div>
          <p className="eyebrow">ORGANIZATION / {company.code}</p>
          <h1>{company.name}</h1>
          <p className="page-subtitle">
            {[company.city, company.state, company.country].filter(Boolean).join(', ')}
          </p>
        </div>
        <div className="heading-actions">
          {canUpdate && (
            <button className="button-secondary" onClick={() => navigate(`/companies/${id}/edit`)}>
              Edit company
            </button>
          )}
          {canActivate && (
            <button
              className={company.isActive ? 'button-danger' : 'button-primary'}
              onClick={() => statusMutation.mutate(!company.isActive)}
              disabled={statusMutation.isPending}
            >
              {company.isActive ? 'Deactivate' : 'Activate'}
            </button>
          )}
        </div>
      </div>

      <div className="company-summary-strip">
        <div>
          <span>STATUS</span>
          <strong>
            <i className={`status-dot ${company.isActive ? 'is-active' : 'is-inactive'}`} />
            {company.isActive ? 'Active' : 'Inactive'}
          </strong>
        </div>
        <div>
          <span>BASE CURRENCY</span>
          <strong>{company.baseCurrency}</strong>
        </div>
        <div>
          <span>USERS</span>
          <strong>{company._count?.users ?? 0}</strong>
        </div>
        <div>
          <span>ROLES</span>
          <strong>{company._count?.roles ?? 0}</strong>
        </div>
      </div>

      <div className="tab-list" role="tablist" aria-label="Company sections">
        {visibleTabs.map((item) => (
          <button
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? 'tab selected' : 'tab'}
            key={item.id}
            onClick={() => {
              setTab(item.id);
              setOperationError('');
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      {operationError && (
        <p className="inline-error" role="alert">
          {operationError}
        </p>
      )}

      {tab === 'details' && (
        <section className="detail-section">
          <div className="section-heading">
            <h2>Company profile</h2>
            <span>Updated {new Date(company.updatedAt).toLocaleDateString()}</span>
          </div>
          <dl className="detail-grid">
            <div>
              <dt>Legal name</dt>
              <dd>{company.name}</dd>
            </div>
            <div>
              <dt>Company code</dt>
              <dd>{company.code}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{company.email || '—'}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{company.phone || '—'}</dd>
            </div>
            <div>
              <dt>GSTIN</dt>
              <dd>{company.gstin || '—'}</dd>
            </div>
            <div>
              <dt>PAN</dt>
              <dd>{company.pan || '—'}</dd>
            </div>
            <div className="detail-wide">
              <dt>Registered address</dt>
              <dd>
                {[company.address, company.city, company.state, company.pincode, company.country]
                  .filter(Boolean)
                  .join(', ') || '—'}
              </dd>
            </div>
            <div>
              <dt>Financial year</dt>
              <dd>
                {company.financialYearStart
                  ? new Date(company.financialYearStart).toLocaleDateString()
                  : '—'}{' '}
                –{' '}
                {company.financialYearEnd
                  ? new Date(company.financialYearEnd).toLocaleDateString()
                  : '—'}
              </dd>
            </div>
            <div>
              <dt>Books beginning</dt>
              <dd>
                {company.booksBeginningDate
                  ? new Date(company.booksBeginningDate).toLocaleDateString()
                  : '—'}
              </dd>
            </div>
          </dl>
        </section>
      )}

      {tab === 'settings' && (
        <section className="detail-section">
          <div className="section-heading">
            <h2>Company configuration</h2>
            <span>{canUpdate ? 'Feature access' : 'Read only'}</span>
          </div>
          <div className="feature-list">
            {features.map(({ key, label, detail }) => (
              <label className="feature-setting" key={key}>
                <span>
                  <strong>{label}</strong>
                  <small>{detail}</small>
                </span>
                <input
                  type="checkbox"
                  checked={company[key]}
                  disabled={!canUpdate || featureMutation.isPending}
                  onChange={(event) => featureMutation.mutate({ key, value: event.target.checked })}
                />
              </label>
            ))}
          </div>
        </section>
      )}

      {tab === 'users' && (
        <section className="detail-section">
          <div className="section-heading">
            <h2>Company users</h2>
            {canCreateUsers && (
              <button className="text-button" onClick={() => navigate('/users/new')}>
                Add user <span aria-hidden="true">↗</span>
              </button>
            )}
          </div>
          {userQuery.isPending ? (
            <p className="empty-state">Loading users...</p>
          ) : userQuery.isError ? (
            <p className="inline-error">{userQuery.error.message}</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Department</th>
                    <th>Roles</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {(userQuery.data.users ?? []).map((user) => (
                    <tr key={user.id}>
                      <td>
                        <strong>
                          {user.firstName} {user.lastName}
                        </strong>
                        <small>{user.email}</small>
                      </td>
                      <td>{user.department || '—'}</td>
                      <td>{user.roles.map((role) => role.name).join(', ')}</td>
                      <td>
                        <span
                          className={`status-pill ${user.isActive ? 'is-active' : 'is-inactive'}`}
                        >
                          {user.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <button
                          className="text-button"
                          onClick={() => navigate(`/users/${user.id}`)}
                        >
                          View <span aria-hidden="true">↗</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === 'backup' && (
        <section className="detail-section">
          <div className="section-heading">
            <h2>Company snapshots</h2>
            {canBackup && company.isActive && (
              <button
                className="button-primary"
                onClick={() => backupMutation.mutate()}
                disabled={backupMutation.isPending}
              >
                {backupMutation.isPending ? 'Creating...' : '＋ Create snapshot'}
              </button>
            )}
          </div>
          <p className="section-caption">
            Snapshots include company configuration, roles, permissions, and company role
            assignments. Password credentials are not included.
          </p>
          {company.backups?.length ? (
            <div className="backup-list">
              {company.backups.map((backup) => (
                <label className="backup-row" key={backup.id}>
                  <input
                    type="radio"
                    name="backup"
                    value={backup.id}
                    checked={backupId === backup.id}
                    onChange={() => setBackupId(backup.id)}
                  />
                  <span>
                    <strong>{backup.name}</strong>
                    <small>
                      {new Date(backup.createdAt).toLocaleString()} · SHA-256{' '}
                      {backup.checksum.slice(0, 12)}…
                    </small>
                  </span>
                  <span className="code-label">{backup.id.slice(0, 8)}</span>
                </label>
              ))}
            </div>
          ) : (
            <p className="empty-state">No company snapshots yet.</p>
          )}
          {canRestore && (
            <div className="restore-row">
              <button
                className="button-secondary"
                disabled={!backupId || restoreMutation.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      'Restore company configuration and role assignments from this snapshot?',
                    )
                  )
                    restoreMutation.mutate();
                }}
              >
                {restoreMutation.isPending ? 'Restoring...' : 'Restore selected snapshot'}
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
