import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { apiRequest } from '../api/client';
import { usePermissions } from '../auth/has-permission';
import { useAuthStore } from '../state/auth-store';
import type { ManagedUser } from '../types/erp';

type Activity = {
  id: string;
  action: string;
  createdAt: string;
  actor: { firstName: string; lastName: string; email: string };
};

export function UserDetailPage(): JSX.Element {
  const { id = '' } = useParams();
  const companyId = useAuthStore((state) => state.activeCompanyId);
  const permissions = usePermissions();
  const [newPassword, setNewPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const userQuery = useQuery({
    queryKey: ['user', companyId, id],
    queryFn: () => apiRequest<{ user: ManagedUser }>(`/users/${id}`),
  });
  const activityQuery = useQuery({
    queryKey: ['user-activity', companyId, id],
    queryFn: () => apiRequest<{ items: Activity[]; total: number }>(`/users/${id}/activity-log`),
    enabled: permissions.includes('users:activity-log'),
  });
  const deactivate = useMutation({
    mutationFn: () => apiRequest(`/users/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      navigate('/users');
    },
  });
  const resetPassword = useMutation({
    mutationFn: () =>
      apiRequest<{ message: string }>(`/users/${id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ password: newPassword }),
      }),
    onSuccess: ({ message }) => {
      setPasswordMessage(message);
      setPasswordError('');
      setNewPassword('');
    },
    onError: (error) => {
      setPasswordError(error.message);
      setPasswordMessage('');
    },
  });

  if (userQuery.isPending) return <p className="empty-state">Loading user...</p>;
  if (userQuery.isError)
    return (
      <div className="empty-state">
        <p>{userQuery.error.message}</p>
        <button className="button-secondary" onClick={() => navigate('/users')}>
          Back to users
        </button>
      </div>
    );
  const user = userQuery.data.user;

  return (
    <div className="erp-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ACCESS CONTROL / USER</p>
          <h1>
            {user.firstName} {user.lastName}
          </h1>
          <p className="page-subtitle">
            {user.email} · {user.employeeCode || 'No employee code'}
          </p>
        </div>
        <div className="heading-actions">
          {permissions.includes('users:update') && (
            <button className="button-secondary" onClick={() => navigate(`/users/${id}/edit`)}>
              Edit profile
            </button>
          )}
          {permissions.includes('users:delete') && user.isActive && (
            <button
              className="button-danger"
              onClick={() => {
                if (window.confirm('Deactivate this user and revoke their sessions?'))
                  deactivate.mutate();
              }}
              disabled={deactivate.isPending}
            >
              Deactivate
            </button>
          )}
        </div>
      </div>
      <div className="user-detail-layout">
        <section className="detail-section">
          <div className="section-heading">
            <h2>Profile</h2>
            <span className={`status-pill ${user.isActive ? 'is-active' : 'is-inactive'}`}>
              {user.isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
          <dl className="detail-grid">
            <div>
              <dt>Employee code</dt>
              <dd>{user.employeeCode || '—'}</dd>
            </div>
            <div>
              <dt>Department</dt>
              <dd>{user.department || '—'}</dd>
            </div>
            <div>
              <dt>Designation</dt>
              <dd>{user.designation || '—'}</dd>
            </div>
            <div>
              <dt>Mobile</dt>
              <dd>{user.mobile || '—'}</dd>
            </div>
            <div>
              <dt>Alternate email</dt>
              <dd>{user.alternateEmail || '—'}</dd>
            </div>
            <div>
              <dt>Date of joining</dt>
              <dd>
                {user.dateOfJoining ? new Date(user.dateOfJoining).toLocaleDateString() : '—'}
              </dd>
            </div>
            <div className="detail-wide">
              <dt>Assigned roles</dt>
              <dd className="role-labels">
                {user.roles.map((role) => (
                  <span className="role-label" key={role.id}>
                    {role.name}
                  </span>
                ))}
              </dd>
            </div>
          </dl>
        </section>
        <section className="detail-section">
          <div className="section-heading">
            <h2>Reset password</h2>
          </div>
          {permissions.includes('users:reset-password') ? (
            <form
              className="reset-password-form"
              onSubmit={(event) => {
                event.preventDefault();
                resetPassword.mutate();
              }}
            >
              <label className="field">
                <span>New password</span>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                  minLength={12}
                  autoComplete="new-password"
                />
              </label>
              <button className="button-secondary" type="submit" disabled={resetPassword.isPending}>
                {resetPassword.isPending ? 'Resetting...' : 'Reset and revoke sessions'}
              </button>
              {passwordMessage && (
                <p className="success-message" role="status">
                  {passwordMessage}
                </p>
              )}
              {passwordError && (
                <p className="inline-error" role="alert">
                  {passwordError}
                </p>
              )}
            </form>
          ) : (
            <p className="section-caption">Password changes are restricted by your permissions.</p>
          )}
        </section>
      </div>
      {permissions.includes('users:activity-log') && (
        <section className="detail-section activity-section">
          <div className="section-heading">
            <h2>Activity history</h2>
            <span>{activityQuery.data?.total ?? 0} events</span>
          </div>
          {activityQuery.isPending ? (
            <p className="empty-state">Loading activity...</p>
          ) : activityQuery.isError ? (
            <p className="inline-error">{activityQuery.error.message}</p>
          ) : activityQuery.data.items.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>By</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {activityQuery.data.items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <span className="code-label">{item.action}</span>
                      </td>
                      <td>
                        {item.actor.firstName} {item.actor.lastName}
                        <small>{item.actor.email}</small>
                      </td>
                      <td>{new Date(item.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-state">No activity recorded for this user.</p>
          )}
        </section>
      )}
    </div>
  );
}
