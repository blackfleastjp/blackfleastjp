import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../api/client';
import { usePermissions } from '../auth/has-permission';
import { useAuthStore } from '../state/auth-store';
import type { Role } from '../types/erp';

type Grant = { module: string; action: string; name: string };
type PermissionCatalogResponse = { permissions: Grant[] };

export function RoleManagementPage(): JSX.Element {
  const companyId = useAuthStore((state) => state.activeCompanyId);
  const permissions = usePermissions();
  const queryClient = useQueryClient();
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedGrants, setSelectedGrants] = useState<string[]>([]);
  const [formError, setFormError] = useState('');
  const rolesQuery = useQuery({
    queryKey: ['roles', companyId],
    queryFn: () => apiRequest<{ roles: Role[] }>('/roles'),
  });
  const catalogQuery = useQuery({
    queryKey: ['permission-catalog', companyId],
    queryFn: () => apiRequest<PermissionCatalogResponse>('/roles/permission-catalog'),
  });

  const selectedRole = rolesQuery.data?.roles.find((role) => role.id === selectedRoleId) ?? null;
  useEffect(() => {
    if (creating) return;
    const role = rolesQuery.data?.roles.find((item) => item.id === selectedRoleId);
    setName(role?.name ?? '');
    setDescription(role?.description ?? '');
    setSelectedGrants(role?.permissions.map(({ module, action }) => `${module}:${action}`) ?? []);
  }, [creating, rolesQuery.data, selectedRoleId]);

  const grants = useMemo(() => {
    const available = new Map<string, Grant>();
    for (const grant of catalogQuery.data?.permissions ?? [])
      available.set(`${grant.module}:${grant.action}`, grant);
    for (const grant of selectedRole?.permissions ?? [])
      available.set(`${grant.module}:${grant.action}`, grant);
    return [...available.values()];
  }, [catalogQuery.data?.permissions, selectedRole?.permissions]);
  const modules = useMemo(() => [...new Set(grants.map(({ module }) => module))].sort(), [grants]);

  const save = useMutation({
    mutationFn: () => {
      const permissions = grants.filter(({ module, action }) =>
        selectedGrants.includes(`${module}:${action}`),
      );
      return apiRequest<{ role: Role }>(creating ? '/roles' : `/roles/${selectedRoleId}`, {
        method: creating ? 'POST' : 'PUT',
        body: JSON.stringify({ name, description: description || null, permissions }),
      });
    },
    onSuccess: async ({ role }) => {
      setCreating(false);
      setSelectedRoleId(role.id);
      setFormError('');
      await queryClient.invalidateQueries({ queryKey: ['roles', companyId] });
    },
    onError: (error) => setFormError(error.message),
  });
  const remove = useMutation({
    mutationFn: (roleId: string) => apiRequest(`/roles/${roleId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      setSelectedRoleId(null);
      await queryClient.invalidateQueries({ queryKey: ['roles', companyId] });
    },
    onError: (error) => setFormError(error.message),
  });

  function startCreating(): void {
    setCreating(true);
    setSelectedRoleId(null);
    setName('');
    setDescription('');
    setSelectedGrants([]);
    setFormError('');
  }

  function toggleGrant(grant: Grant): void {
    const key = `${grant.module}:${grant.action}`;
    setSelectedGrants((current) =>
      current.includes(key) ? current.filter((value) => value !== key) : [...current, key],
    );
  }

  if (rolesQuery.isPending || catalogQuery.isPending)
    return <p className="empty-state">Loading roles...</p>;
  if (rolesQuery.isError || catalogQuery.isError)
    return (
      <p className="inline-error" role="alert">
        {rolesQuery.error?.message ?? catalogQuery.error?.message}
      </p>
    );

  return (
    <div className="erp-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ACCESS CONTROL</p>
          <h1>Roles & permissions</h1>
          <p className="page-subtitle">
            {rolesQuery.data.roles.length} roles configured for this company
          </p>
        </div>
        {permissions.includes('roles:create') && (
          <button className="button-primary" onClick={startCreating}>
            ＋ New role
          </button>
        )}
      </div>
      <div className="role-admin-layout">
        <aside className="role-list-panel">
          <div className="role-list-heading">
            <span>COMPANY ROLES</span>
            <span>{rolesQuery.data.roles.length}</span>
          </div>
          {rolesQuery.data.roles.map((role) => (
            <button
              className={`role-list-item${selectedRoleId === role.id && !creating ? ' selected' : ''}`}
              key={role.id}
              onClick={() => {
                setCreating(false);
                setSelectedRoleId(role.id);
                setFormError('');
              }}
            >
              <span className="role-list-mark">{role.name.slice(0, 1).toUpperCase()}</span>
              <span className="role-list-copy">
                <strong>{role.name}</strong>
                <small>{role._count?.userCompanyRoles ?? 0} role assignments</small>
              </span>
              <span className="role-list-arrow">›</span>
            </button>
          ))}
        </aside>

        {creating || selectedRole ? (
          <section className="role-editor">
            <div className="role-editor-heading">
              <div>
                <p className="eyebrow">
                  {creating ? 'NEW ROLE' : selectedRole?.isSystem ? 'SYSTEM ROLE' : 'COMPANY ROLE'}
                </p>
                <h2>{creating ? 'Create role' : selectedRole?.name}</h2>
              </div>
              {selectedRole?.isSystem && <span className="status-pill is-active">Protected</span>}
            </div>
            <div className="form-grid role-fields">
              <label className="field">
                <span>Role name *</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  maxLength={80}
                  disabled={!creating && !permissions.includes('roles:update')}
                />
              </label>
              <label className="field">
                <span>Description</span>
                <input
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={500}
                  disabled={!creating && !permissions.includes('roles:update')}
                />
              </label>
            </div>
            <div className="section-heading permission-heading">
              <h3>Permission matrix</h3>
              <span>{selectedGrants.length} selected</span>
            </div>
            {modules.map((module) => (
              <section className="permission-module" key={module}>
                <h4>{module}</h4>
                <div className="permission-grid">
                  {grants
                    .filter((grant) => grant.module === module)
                    .map((grant) => {
                      const key = `${grant.module}:${grant.action}`;
                      return (
                        <label className="permission-option" key={key}>
                          <input
                            type="checkbox"
                            checked={selectedGrants.includes(key)}
                            disabled={!creating && !permissions.includes('roles:update')}
                            onChange={() => toggleGrant(grant)}
                          />
                          <span>
                            <strong>{grant.name}</strong>
                            <small>{grant.action}</small>
                          </span>
                        </label>
                      );
                    })}
                </div>
              </section>
            ))}
            {formError && (
              <p className="inline-error" role="alert">
                {formError}
              </p>
            )}
            <div className="form-actions">
              <span>{selectedRole?._count?.userCompanyRoles ?? 0} user role assignments</span>
              <div>
                {selectedRole && permissions.includes('roles:delete') && !selectedRole.isSystem && (
                  <button
                    className="button-danger"
                    onClick={() => {
                      if (window.confirm(`Delete role ${selectedRole.name}?`))
                        remove.mutate(selectedRole.id);
                    }}
                  >
                    Delete role
                  </button>
                )}
                {(creating
                  ? permissions.includes('roles:create')
                  : permissions.includes('roles:update')) && (
                  <button
                    className="button-primary"
                    disabled={save.isPending || !name.trim()}
                    onClick={() => save.mutate()}
                  >
                    {save.isPending ? 'Saving...' : creating ? 'Create role' : 'Save role'}
                  </button>
                )}
              </div>
            </div>
          </section>
        ) : (
          <section className="role-empty">
            <span className="access-icon">◇</span>
            <h2>Select a role</h2>
            <p>Choose a company role to review its grants.</p>
          </section>
        )}
      </div>
    </div>
  );
}
