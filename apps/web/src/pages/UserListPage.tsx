import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../api/client';
import { usePermissions } from '../auth/has-permission';
import { useAuthStore } from '../state/auth-store';
import type { ManagedUser, Role } from '../types/erp';

const pageSize = 20;

export function UserListPage(): JSX.Element {
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');
  const [roleId, setRoleId] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive' | 'all'>('active');
  const [page, setPage] = useState(1);
  const permissions = usePermissions();
  const companyId = useAuthStore((state) => state.activeCompanyId);
  const navigate = useNavigate();
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), status });
  if (search.trim()) params.set('q', search.trim());
  if (department.trim()) params.set('department', department.trim());
  if (roleId) params.set('roleId', roleId);
  const usersQuery = useQuery({
    queryKey: ['users', companyId, search, department, roleId, status, page],
    queryFn: () =>
      apiRequest<{ users: ManagedUser[]; pageCount: number; total: number }>(`/users?${params}`),
  });
  const rolesQuery = useQuery({
    queryKey: ['roles', companyId],
    queryFn: () => apiRequest<{ roles: Role[] }>('/roles'),
    enabled: permissions.includes('roles:read'),
  });

  function resetPage(update: () => void): void {
    update();
    setPage(1);
  }

  return (
    <div className="erp-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ACCESS CONTROL</p>
          <h1>Users</h1>
          <p className="page-subtitle">{usersQuery.data?.total ?? 0} people in this company</p>
        </div>
        {permissions.includes('users:create') && (
          <button className="button-primary" onClick={() => navigate('/users/new')}>
            ＋ Add user
          </button>
        )}
      </div>
      <div className="toolbar user-toolbar">
        <label className="search-control">
          <span aria-hidden="true">⌕</span>
          <input
            aria-label="Search users"
            placeholder="Search name, email, employee code"
            value={search}
            onChange={(event) => resetPage(() => setSearch(event.target.value))}
          />
        </label>
        <label className="filter-control">
          <span>Role</span>
          <select
            value={roleId}
            onChange={(event) => resetPage(() => setRoleId(event.target.value))}
          >
            <option value="">All roles</option>
            {rolesQuery.data?.roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        </label>
        <label className="search-control department-filter">
          <span className="filter-label">Department</span>
          <input
            aria-label="Filter by department"
            placeholder="Any department"
            value={department}
            onChange={(event) => resetPage(() => setDepartment(event.target.value))}
          />
        </label>
        <label className="filter-control">
          <span>Status</span>
          <select
            value={status}
            onChange={(event) => resetPage(() => setStatus(event.target.value as typeof status))}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All users</option>
          </select>
        </label>
      </div>

      {usersQuery.isPending ? (
        <p className="empty-state">Loading users...</p>
      ) : usersQuery.isError ? (
        <div className="empty-state">
          <p>{usersQuery.error.message}</p>
          <button className="button-secondary" onClick={() => void usersQuery.refetch()}>
            Retry
          </button>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Employee code</th>
                <th>Department / title</th>
                <th>Roles</th>
                <th>Joined</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {usersQuery.data.users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <strong>
                      {user.firstName} {user.lastName}
                    </strong>
                    <small>{user.email}</small>
                  </td>
                  <td>{user.employeeCode || '—'}</td>
                  <td>
                    {user.department || '—'}
                    {user.designation && <small>{user.designation}</small>}
                  </td>
                  <td>
                    {user.roles.map((role) => (
                      <span className="role-label" key={role.id}>
                        {role.name}
                      </span>
                    ))}
                  </td>
                  <td>
                    {user.dateOfJoining ? new Date(user.dateOfJoining).toLocaleDateString() : '—'}
                  </td>
                  <td>
                    <span className={`status-pill ${user.isActive ? 'is-active' : 'is-inactive'}`}>
                      {user.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <button className="text-button" onClick={() => navigate(`/users/${user.id}`)}>
                      View <span aria-hidden="true">↗</span>
                    </button>
                  </td>
                </tr>
              ))}
              {usersQuery.data.users.length === 0 && (
                <tr>
                  <td colSpan={7} className="table-empty">
                    No users match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <div className="table-footer">
        <span>
          {usersQuery.data?.total ?? 0} results · Page {page} of{' '}
          {Math.max(1, usersQuery.data?.pageCount ?? 1)}
        </span>
        <div className="pagination">
          <button
            aria-label="Previous page"
            disabled={page <= 1}
            onClick={() => setPage((current) => current - 1)}
          >
            ←
          </button>
          <button
            aria-label="Next page"
            disabled={page >= (usersQuery.data?.pageCount ?? 1)}
            onClick={() => setPage((current) => current + 1)}
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}
