import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { apiRequest } from '../api/client';
import { usePermissions } from '../auth/has-permission';
import { useAuthStore } from '../state/auth-store';
import type { ManagedUser, Role } from '../types/erp';

type UserDraft = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
  department: string;
  designation: string;
  mobile: string;
  alternateEmail: string;
  dateOfJoining: string;
  roleIds: string[];
};

const emptyDraft: UserDraft = {
  email: '',
  password: '',
  firstName: '',
  lastName: '',
  employeeCode: '',
  department: '',
  designation: '',
  mobile: '',
  alternateEmail: '',
  dateOfJoining: '',
  roleIds: [],
};

export function UserFormPage(): JSX.Element {
  const { id } = useParams();
  const editing = Boolean(id);
  const [draft, setDraft] = useState(emptyDraft);
  const [isActive, setIsActive] = useState(true);
  const [formError, setFormError] = useState('');
  const permissions = usePermissions();
  const companyId = useAuthStore((state) => state.activeCompanyId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const userQuery = useQuery({
    queryKey: ['user', companyId, id],
    queryFn: () => apiRequest<{ user: ManagedUser }>(`/users/${id}`),
    enabled: editing,
  });
  const rolesQuery = useQuery({
    queryKey: ['roles', companyId],
    queryFn: () => apiRequest<{ roles: Role[] }>('/roles'),
    enabled: permissions.includes('roles:read'),
  });

  useEffect(() => {
    const user = userQuery.data?.user;
    if (!user) return;
    setDraft({
      email: user.email,
      password: '',
      firstName: user.firstName,
      lastName: user.lastName,
      employeeCode: user.employeeCode ?? '',
      department: user.department ?? '',
      designation: user.designation ?? '',
      mobile: user.mobile ?? '',
      alternateEmail: user.alternateEmail ?? '',
      dateOfJoining: user.dateOfJoining?.slice(0, 10) ?? '',
      roleIds: user.roles.map((role) => role.id),
    });
    setIsActive(user.isActive);
  }, [userQuery.data]);

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        ...draft,
        employeeCode: draft.employeeCode || null,
        mobile: draft.mobile || null,
        alternateEmail: draft.alternateEmail || null,
        dateOfJoining: draft.dateOfJoining || null,
        ...(editing && !draft.password ? { password: undefined } : {}),
        ...(editing ? { isActive } : {}),
      };
      return apiRequest<{ user: ManagedUser }>(editing ? `/users/${id}` : '/users', {
        method: editing ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async ({ user }) => {
      await queryClient.invalidateQueries();
      navigate(`/users/${user.id}`, { replace: true });
    },
    onError: (error) => setFormError(error.message),
  });

  function updateField<Key extends keyof UserDraft>(key: Key, value: UserDraft[Key]): void {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function toggleRole(roleId: string): void {
    setDraft((current) => ({
      ...current,
      roleIds: current.roleIds.includes(roleId)
        ? current.roleIds.filter((id) => id !== roleId)
        : [...current.roleIds, roleId],
    }));
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setFormError('');
    if (draft.roleIds.length === 0) {
      setFormError('Assign at least one role to this user.');
      return;
    }
    save.mutate();
  }

  if (editing && userQuery.isPending) return <p className="empty-state">Loading user...</p>;
  if (editing && userQuery.isError)
    return (
      <p className="inline-error" role="alert">
        {userQuery.error.message}
      </p>
    );

  return (
    <div className="erp-page form-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ACCESS CONTROL / {editing ? 'EDIT USER' : 'NEW USER'}</p>
          <h1>{editing ? `${draft.firstName} ${draft.lastName}` : 'Add user'}</h1>
          <p className="page-subtitle">User profile and company role assignments</p>
        </div>
        <button
          className="button-secondary"
          type="button"
          onClick={() => navigate(editing ? `/users/${id}` : '/users')}
        >
          Cancel
        </button>
      </div>
      <form className="form-panel" onSubmit={submit}>
        <div className="section-heading form-section-heading">
          <h2>Personal details</h2>
          {editing && (
            <label className="inline-toggle">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(event) => setIsActive(event.target.checked)}
              />
              <span>Active account</span>
            </label>
          )}
        </div>
        <div className="form-grid">
          <label className="field">
            <span>First name *</span>
            <input
              value={draft.firstName}
              onChange={(event) => updateField('firstName', event.target.value)}
              required
              maxLength={80}
            />
          </label>
          <label className="field">
            <span>Last name *</span>
            <input
              value={draft.lastName}
              onChange={(event) => updateField('lastName', event.target.value)}
              required
              maxLength={80}
            />
          </label>
          <label className="field">
            <span>Work email *</span>
            <input
              type="email"
              value={draft.email}
              onChange={(event) => updateField('email', event.target.value)}
              required
              maxLength={254}
            />
          </label>
          <label className="field">
            <span>{editing ? 'Set new password' : 'Temporary password *'}</span>
            <input
              type="password"
              value={draft.password}
              onChange={(event) => updateField('password', event.target.value)}
              required={!editing}
              minLength={12}
              autoComplete="new-password"
            />
            <small>
              {editing ? 'Leave blank to keep the current password.' : 'At least 12 characters.'}
            </small>
          </label>
          <label className="field">
            <span>Employee code</span>
            <input
              value={draft.employeeCode}
              onChange={(event) => updateField('employeeCode', event.target.value)}
              maxLength={40}
            />
          </label>
          <label className="field">
            <span>Mobile</span>
            <input
              type="tel"
              value={draft.mobile}
              onChange={(event) => updateField('mobile', event.target.value)}
              pattern="(\+91[- ]?)?[6-9][0-9]{9}"
              placeholder="+91 9876543210"
            />
          </label>
          <label className="field">
            <span>Alternate email</span>
            <input
              type="email"
              value={draft.alternateEmail}
              onChange={(event) => updateField('alternateEmail', event.target.value)}
            />
          </label>
          <label className="field">
            <span>Date of joining</span>
            <input
              type="date"
              value={draft.dateOfJoining}
              onChange={(event) => updateField('dateOfJoining', event.target.value)}
            />
          </label>
          <label className="field">
            <span>Department</span>
            <input
              value={draft.department}
              onChange={(event) => updateField('department', event.target.value)}
              maxLength={100}
            />
          </label>
          <label className="field">
            <span>Designation</span>
            <input
              value={draft.designation}
              onChange={(event) => updateField('designation', event.target.value)}
              maxLength={100}
            />
          </label>
        </div>
        <div className="section-heading form-section-heading">
          <h2>Company roles</h2>
          <span>{draft.roleIds.length} selected</span>
        </div>
        {rolesQuery.isError && <p className="inline-error">{rolesQuery.error.message}</p>}
        {rolesQuery.data?.roles.length ? (
          <div className="role-picker">
            {rolesQuery.data.roles.map((role) => (
              <label className="role-option" key={role.id}>
                <input
                  type="checkbox"
                  checked={draft.roleIds.includes(role.id)}
                  onChange={() => toggleRole(role.id)}
                />
                <span>
                  <strong>{role.name}</strong>
                  <small>{role.description || `${role.permissions.length} permissions`}</small>
                </span>
              </label>
            ))}
          </div>
        ) : (
          <p className="section-caption">No assignable roles are available to your account.</p>
        )}
        {formError && (
          <p className="inline-error" role="alert">
            {formError}
          </p>
        )}
        <div className="form-actions">
          <span>
            {editing ? 'Changes apply to this company.' : 'A login account will be created.'}
          </span>
          <button
            type="submit"
            className="button-primary"
            disabled={save.isPending || rolesQuery.isPending}
          >
            {save.isPending ? 'Saving...' : editing ? 'Save changes' : 'Create user'}
          </button>
        </div>
      </form>
    </div>
  );
}
