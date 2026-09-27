import { useEffect, useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  KeyRound,
  Plus,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Link, useLocation, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { z } from "zod";
import { createRoleSchema, createUserSchema } from "@erp/validation";
import type { PageResult, Permission } from "@erp/types";
import { api } from "../lib/api-client.js";
import type { ManagedRole, ManagedUser, WorkspaceOutletContext } from "../lib/management-types.js";
import { useUiStore } from "../state/ui-store.js";
import { EmptyState, ErrorState, LoadingState } from "../components/feedback.js";
import { permissionAllows } from "@erp/shared";

type UserFormValues = z.input<typeof createUserSchema>;

const emptyUser: UserFormValues = {
  name: "",
  email: "",
  employeeCode: "",
  department: "",
  designation: "",
  mobile: "",
  alternateEmail: "",
  dateOfJoining: "",
  roleId: "",
};

function UserField({
  label,
  children,
  error,
}: {
  label: string;
  children: React.ReactNode;
  error?: string | undefined;
}) {
  return (
    <label className="management-field">
      <span>{label}</span>
      {children}
      {error && <small className="field-error">{error}</small>}
    </label>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value || "Not set"}</dd>
    </div>
  );
}

export function UserListPage() {
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [roleId, setRoleId] = useState("");
  const [status, setStatus] = useState("active");
  const [page, setPage] = useState(1);
  const { company } = useOutletContext<WorkspaceOutletContext>();
  const canCreate = permissionAllows(new Set(company.permissions), "users.create");
  const roles = useQuery({
    queryKey: ["roles", company.id, "active"],
    queryFn: () => api.get<PageResult<ManagedRole>>("/roles?page=1&pageSize=100&status=active"),
  });
  const query = useQuery({
    queryKey: ["users", company.id, search, department, roleId, status, page],
    queryFn: () =>
      api.get<PageResult<ManagedUser>>(
        `/users?page=${page}&pageSize=20&status=${status}${search ? `&search=${encodeURIComponent(search)}` : ""}${department ? `&department=${encodeURIComponent(department)}` : ""}${roleId ? `&roleId=${encodeURIComponent(roleId)}` : ""}`,
      ),
    placeholderData: (previous) => previous,
  });
  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <p className="eyebrow">PEOPLE OPERATIONS</p>
          <h1>Users</h1>
          <p className="page-description">
            Manage company accounts, job details, and role assignments.
          </p>
        </div>
        {canCreate && (
          <Link className="button button-primary" to="/app/users/new">
            <Plus size={16} />
            Add user
          </Link>
        )}
      </div>
      <div className="data-panel">
        <div className="data-toolbar">
          <div>
            <h2>Company users</h2>
            <span>{query.data?.total ?? 0} users</span>
          </div>
          <div className="directory-controls">
            <label className="search-field">
              <Search size={16} />
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Search name, code, email"
                aria-label="Search users"
              />
            </label>
            <input
              className="filter-input"
              value={department}
              onChange={(event) => {
                setDepartment(event.target.value);
                setPage(1);
              }}
              placeholder="Department"
              aria-label="Filter by department"
            />
            <select
              className="filter-select"
              value={roleId}
              aria-label="Filter by role"
              onChange={(event) => {
                setRoleId(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All roles</option>
              {roles.data?.items.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
            <select
              className="filter-select"
              value={status}
              aria-label="Filter by user status"
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="all">All statuses</option>
            </select>
          </div>
        </div>
        {query.isPending ? (
          <LoadingState label="Loading company users" />
        ) : query.isError ? (
          <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
        ) : query.data.items.length === 0 ? (
          <EmptyState
            title="No users found"
            detail={
              search || department || roleId
                ? "Adjust your search or filters."
                : "Create a user to give someone access to this company."
            }
          />
        ) : (
          <>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Employee code</th>
                    <th>Department</th>
                    <th>Designation</th>
                    <th>Roles</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.items.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <Link className="person-cell" to={`/app/users/${user.id}`}>
                          <span className="person-avatar">
                            {user.name.slice(0, 1).toUpperCase()}
                          </span>
                          <span>
                            <strong>{user.name}</strong>
                            <small className="table-subtext">{user.email}</small>
                          </span>
                        </Link>
                      </td>
                      <td>{user.employeeCode ?? "—"}</td>
                      <td>{user.department ?? "—"}</td>
                      <td>{user.designation ?? "—"}</td>
                      <td>{user.roles.map((role) => role.name).join(", ") || "—"}</td>
                      <td>
                        <span
                          className={`status-pill ${user.isActive ? "status-pill-active" : "status-pill-muted"}`}
                        >
                          {user.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-pagination">
              <span>
                Page {page} of {Math.max(query.data.pageCount, 1)} <i>·</i> {query.data.total} total
              </span>
              <div>
                <button
                  className="icon-button"
                  aria-label="Previous page"
                  disabled={page <= 1}
                  onClick={() => setPage((value) => value - 1)}
                >
                  <ArrowLeft size={17} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Next page"
                  disabled={page >= query.data.pageCount}
                  onClick={() => setPage((value) => value + 1)}
                >
                  <ArrowRight size={17} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export function UserFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { company } = useOutletContext<WorkspaceOutletContext>();
  const currentCompanyId = useUiStore((state) => state.selectedCompanyId);
  const roles = useQuery({
    queryKey: ["roles", currentCompanyId, "active"],
    queryFn: () => api.get<PageResult<ManagedRole>>("/roles?page=1&pageSize=100&status=active"),
  });
  const user = useQuery({
    queryKey: ["user", id],
    queryFn: () => api.get<ManagedUser>(`/users/${id}`),
    enabled: editing,
  });
  const form = useForm<UserFormValues>({
    resolver: zodResolver(createUserSchema) as Resolver<UserFormValues>,
    defaultValues: emptyUser,
  });
  useEffect(() => {
    if (user.data)
      form.reset({
        name: user.data.name,
        email: user.data.email,
        employeeCode: user.data.employeeCode ?? "",
        department: user.data.department ?? "",
        designation: user.data.designation ?? "",
        mobile: user.data.mobile ?? "",
        alternateEmail: user.data.alternateEmail ?? "",
        dateOfJoining: user.data.dateOfJoining ?? "",
        roleId: user.data.roles[0]?.id ?? "",
      });
  }, [user.data, form.reset]);
  const save = useMutation({
    mutationFn: async (values: UserFormValues) => {
      if (!editing) return api.post<{ user: ManagedUser; resetToken?: string }>("/users", values);
      await api.put(`/users/${id}`, values);
      await api.put(`/users/${id}/roles`, { roleIds: [values.roleId] });
      return { user: { id } as ManagedUser };
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["users"] }),
        queryClient.invalidateQueries({ queryKey: ["company-users"] }),
      ]);
      navigate(`/app/users/${result.user.id}`, {
        replace: true,
        state: result.resetToken ? { resetToken: result.resetToken } : null,
      });
    },
  });
  if (editing && user.isPending) return <LoadingState label="Loading user profile" />;
  if (editing && user.isError)
    return <ErrorState message={user.error.message} onRetry={() => void user.refetch()} />;
  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{editing ? "USER PROFILE" : "USER ADMINISTRATION"}</p>
          <h1>{editing ? `Edit ${user.data?.name ?? "user"}` : "Create user"}</h1>
          <p className="page-description">
            User access is limited to {company.name} unless separately assigned.
          </p>
        </div>
        <Link className="button button-secondary" to={editing ? `/app/users/${id}` : "/app/users"}>
          <ArrowLeft size={15} />
          Back
        </Link>
      </div>
      <form
        className="management-form data-panel"
        onSubmit={form.handleSubmit((values) => save.mutate(values))}
        noValidate
      >
        <div className="form-section-heading">
          <h2>Account details</h2>
          <p>Assign a company role after creating the profile.</p>
        </div>
        <div className="form-grid">
          <UserField label="Full name" error={form.formState.errors.name?.message}>
            <input {...form.register("name")} autoComplete="name" />
          </UserField>
          <UserField label="Work email" error={form.formState.errors.email?.message}>
            <input type="email" {...form.register("email")} autoComplete="email" />
          </UserField>
          <UserField label="Employee code" error={form.formState.errors.employeeCode?.message}>
            <input {...form.register("employeeCode")} />
          </UserField>
          <UserField label="Department">
            <input {...form.register("department")} />
          </UserField>
          <UserField label="Designation">
            <input {...form.register("designation")} />
          </UserField>
          <UserField label="Indian mobile" error={form.formState.errors.mobile?.message}>
            <input {...form.register("mobile")} inputMode="tel" />
          </UserField>
          <UserField label="Alternate email" error={form.formState.errors.alternateEmail?.message}>
            <input type="email" {...form.register("alternateEmail")} />
          </UserField>
          <UserField label="Date of joining">
            <input type="date" {...form.register("dateOfJoining")} />
          </UserField>
          <UserField label="Company role" error={form.formState.errors.roleId?.message}>
            <select {...form.register("roleId")}>
              <option value="">Select a role</option>
              {roles.data?.items.map((role) => (
                <option value={role.id} key={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </UserField>
        </div>
        {save.isError && (
          <div className="form-alert" role="alert">
            {save.error.message}
          </div>
        )}
        <div className="wizard-actions">
          <span>
            {editing
              ? "Profile and role changes are audited."
              : "A single-use setup link will be created."}
          </span>
          <button className="button button-primary" type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving…" : editing ? "Save user" : "Create user"}
            <Check size={16} />
          </button>
        </div>
      </form>
    </section>
  );
}

export function UserDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { company, user: currentUser } = useOutletContext<WorkspaceOutletContext>();
  const permissions = new Set(company.permissions);
  const user = useQuery({
    queryKey: ["user", id],
    queryFn: () => api.get<ManagedUser>(`/users/${id}`),
  });
  const roles = useQuery({
    queryKey: ["roles", company.id, "all"],
    queryFn: () => api.get<PageResult<ManagedRole>>("/roles?page=1&pageSize=100&status=all"),
  });
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [tab, setTab] = useState<"profile" | "activity">("profile");
  const [resetToken, setResetToken] = useState<string | null>(
    (location.state as { resetToken?: string } | null)?.resetToken ?? null,
  );
  useEffect(() => {
    if (user.data) setSelectedRoleIds(user.data.roles.map((role) => role.id));
  }, [user.data]);
  const roleUpdate = useMutation({
    mutationFn: () => api.put(`/users/${id}/roles`, { roleIds: selectedRoleIds }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["user", id] }),
  });
  const reset = useMutation({
    mutationFn: () => api.post<{ resetToken?: string }>(`/users/${id}/reset-password`),
    onSuccess: (result) => setResetToken(result.resetToken ?? null),
  });
  const deactivate = useMutation({
    mutationFn: () => api.delete<{ deleted: boolean }>(`/users/${id}`),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["users"] }),
        queryClient.invalidateQueries({ queryKey: ["company-users"] }),
      ]);
      navigate("/app/users");
    },
  });
  const activity = useQuery({
    queryKey: ["user-activity", id],
    queryFn: () =>
      api.get<PageResult<{ id: string; action: string; module: string | null; createdAt: string }>>(
        `/users/${id}/activity-log?page=1&pageSize=50`,
      ),
    enabled: tab === "activity" && permissionAllows(permissions, "users.activity.read"),
  });
  if (user.isPending) return <LoadingState label="Loading user profile" />;
  if (user.isError)
    return <ErrorState message={user.error.message} onRetry={() => void user.refetch()} />;
  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <p className="eyebrow">USER PROFILE · {user.data.employeeCode ?? "NO CODE"}</p>
          <h1>{user.data.name}</h1>
          <p className="page-description">
            {user.data.designation ?? "Company user"} · {user.data.department ?? company.name}
          </p>
        </div>
        <div className="heading-actions">
          {permissionAllows(permissions, "users.update") && (
            <Link className="button button-secondary" to={`/app/users/${id}/edit`}>
              Edit profile
            </Link>
          )}
          {permissionAllows(permissions, "users.reset-password") && (
            <button
              className="button button-secondary"
              disabled={reset.isPending}
              onClick={() => reset.mutate()}
            >
              <KeyRound size={15} />
              Reset password
            </button>
          )}
          {permissionAllows(permissions, "users.delete") && (
            <button
              className="button button-danger"
              disabled={deactivate.isPending || user.data.id === currentUser.id}
              onClick={() => {
                if (window.confirm(`Deactivate ${user.data.name}?`)) deactivate.mutate();
              }}
            >
              {deactivate.isPending ? "Deactivating…" : "Deactivate user"}
            </button>
          )}
        </div>
      </div>
      <nav className="management-tabs">
        <button
          className={tab === "profile" ? "management-tab management-tab-active" : "management-tab"}
          onClick={() => setTab("profile")}
        >
          Profile & roles
        </button>
        {permissionAllows(permissions, "users.activity.read") && (
          <button
            className={
              tab === "activity" ? "management-tab management-tab-active" : "management-tab"
            }
            onClick={() => setTab("activity")}
          >
            Activity log
          </button>
        )}
      </nav>
      {tab === "profile" && (
        <div className="management-columns">
          <div className="data-panel company-detail-panel">
            <div className="section-title">
              <div>
                <h2>Profile</h2>
                <p>Employment and account details</p>
              </div>
              <Users size={19} />
            </div>
            <dl className="detail-list">
              <Detail label="Email" value={user.data.email} />
              <Detail label="Employee code" value={user.data.employeeCode} />
              <Detail label="Department" value={user.data.department} />
              <Detail label="Designation" value={user.data.designation} />
              <Detail label="Mobile" value={user.data.mobile} />
              <Detail
                label="Last login"
                value={
                  user.data.lastLoginAt ? new Date(user.data.lastLoginAt).toLocaleString() : "Never"
                }
              />
            </dl>
          </div>
          <div className="data-panel role-assignment-panel">
            <div className="section-title">
              <div>
                <h2>Company roles</h2>
                <p>Permission access is the union of active roles.</p>
              </div>
              <ShieldCheck size={18} />
            </div>
            {roles.isPending ? (
              <LoadingState label="Loading roles" />
            ) : roles.isError ? (
              <ErrorState message={roles.error.message} onRetry={() => void roles.refetch()} />
            ) : (
              <div className="role-choice-list">
                {roles.data.items
                  .filter((role) => role.isActive)
                  .map((role) => (
                    <label key={role.id} className="role-choice">
                      <input
                        type="checkbox"
                        checked={selectedRoleIds.includes(role.id)}
                        onChange={(event) =>
                          setSelectedRoleIds((current) =>
                            event.target.checked
                              ? [...current, role.id]
                              : current.filter((value) => value !== role.id),
                          )
                        }
                      />
                      <span>
                        <strong>{role.name}</strong>
                        <small>{role._count?.permissions ?? 0} permissions</small>
                      </span>
                    </label>
                  ))}
              </div>
            )}
            {permissionAllows(permissions, "users.update") && (
              <button
                className="button button-primary"
                disabled={roleUpdate.isPending || roles.isPending}
                onClick={() => roleUpdate.mutate()}
              >
                {roleUpdate.isPending ? "Saving…" : "Save roles"}
              </button>
            )}
          </div>
        </div>
      )}
      {tab === "activity" &&
        (activity.isPending ? (
          <LoadingState label="Loading user activity" />
        ) : activity.isError ? (
          <ErrorState message={activity.error.message} onRetry={() => void activity.refetch()} />
        ) : !activity.data.items.length ? (
          <EmptyState
            title="No activity yet"
            detail="Audited actions for this user will appear here."
          />
        ) : (
          <div className="data-panel">
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>Module</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {activity.data.items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.action}</td>
                      <td>{item.module ?? "—"}</td>
                      <td>{new Date(item.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      {resetToken && (
        <div className="form-alert" role="status">
          Local reset token created. Open{" "}
          <Link to={`/reset-password?token=${encodeURIComponent(resetToken)}`}>reset password</Link>
          .
        </div>
      )}
    </section>
  );
}

export function RoleListPage() {
  const [search, setSearch] = useState("");
  const { company } = useOutletContext<WorkspaceOutletContext>();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const queryClient = useQueryClient();
  const roles = useQuery({
    queryKey: ["roles", company.id, search],
    queryFn: () =>
      api.get<PageResult<ManagedRole>>(
        `/roles?page=1&pageSize=50&status=all${search ? `&search=${encodeURIComponent(search)}` : ""}`,
      ),
  });
  const create = useMutation({
    mutationFn: () =>
      api.post<ManagedRole>("/roles", createRoleSchema.parse({ name, description })),
    onSuccess: async () => {
      setName("");
      setDescription("");
      await queryClient.invalidateQueries({ queryKey: ["roles"] });
    },
  });
  const canCreate = permissionAllows(new Set(company.permissions), "roles.create");
  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ACCESS CONTROL</p>
          <h1>Roles & permissions</h1>
          <p className="page-description">
            Define company roles and the actions each role can perform.
          </p>
        </div>
        <ShieldCheck className="heading-mark" size={25} />
      </div>
      {canCreate && (
        <form
          className="role-create-strip"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <UserField label="Role name">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              minLength={2}
            />
          </UserField>
          <UserField label="Description">
            <input value={description} onChange={(event) => setDescription(event.target.value)} />
          </UserField>
          <button className="button button-primary" disabled={create.isPending}>
            <Plus size={15} />
            Create role
          </button>
        </form>
      )}
      <div className="data-panel">
        <div className="data-toolbar">
          <div>
            <h2>Company roles</h2>
            <span>{roles.data?.total ?? 0} roles</span>
          </div>
          <label className="search-field">
            <Search size={16} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search roles"
              aria-label="Search roles"
            />
          </label>
        </div>
        {roles.isPending ? (
          <LoadingState label="Loading roles" />
        ) : roles.isError ? (
          <ErrorState message={roles.error.message} onRetry={() => void roles.refetch()} />
        ) : !roles.data.items.length ? (
          <EmptyState title="No roles found" detail="Create a company role to define access." />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Users</th>
                  <th>Permissions</th>
                  <th>Status</th>
                  <th>
                    <span className="sr-only">Edit role</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {roles.data.items.map((role) => (
                  <tr key={role.id}>
                    <td>
                      <span className="person-cell">
                        <span className="company-table-icon">
                          <ShieldCheck size={15} />
                        </span>
                        <span>
                          <strong>{role.name}</strong>
                          <small className="table-subtext">
                            {role.description ?? "No description"}
                          </small>
                        </span>
                      </span>
                    </td>
                    <td>{role._count?.userRoles ?? 0}</td>
                    <td>{role._count?.permissions ?? 0}</td>
                    <td>
                      <span
                        className={`status-pill ${role.isActive ? "status-pill-active" : "status-pill-muted"}`}
                      >
                        {role.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>
                      <Link className="text-button" to={`/app/roles/${role.id}`}>
                        Manage
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

export function RoleDetailPage() {
  const { id } = useParams();
  const { company } = useOutletContext<WorkspaceOutletContext>();
  const queryClient = useQueryClient();
  const role = useQuery({
    queryKey: ["role", id],
    queryFn: () => api.get<ManagedRole>(`/roles/${id}`),
  });
  const catalog = useQuery({
    queryKey: ["permissions"],
    queryFn: () => api.get<Permission[]>("/permissions"),
  });
  const [roleName, setRoleName] = useState("");
  const [roleDescription, setRoleDescription] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => {
    if (role.data) {
      setSelected(role.data.permissions?.map((permission) => permission.id) ?? []);
      setRoleName(role.data.name);
      setRoleDescription(role.data.description ?? "");
    }
  }, [role.data]);
  const save = useMutation({
    mutationFn: () => api.put(`/roles/${id}/assign-permissions`, { permissionIds: selected }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["role", id] });
      await queryClient.invalidateQueries({ queryKey: ["current-user"] });
    },
  });
  const updateRole = useMutation({
    mutationFn: (values: { name?: string; description?: string; isActive?: boolean }) =>
      api.put<ManagedRole>(`/roles/${id}`, values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["roles"] });
      await queryClient.invalidateQueries({ queryKey: ["role", id] });
    },
  });
  const canManage = permissionAllows(new Set(company.permissions), "roles.assign-permissions");
  const canUpdate = permissionAllows(new Set(company.permissions), "roles.update");
  if (role.isPending || catalog.isPending) return <LoadingState label="Loading role permissions" />;
  if (role.isError)
    return <ErrorState message={role.error.message} onRetry={() => void role.refetch()} />;
  if (catalog.isError)
    return <ErrorState message={catalog.error.message} onRetry={() => void catalog.refetch()} />;
  const grouped = catalog.data.reduce((groups, permission) => {
    const modulePermissions = groups.get(permission.module) ?? [];
    modulePermissions.push(permission);
    groups.set(permission.module, modulePermissions);
    return groups;
  }, new Map<string, Permission[]>());
  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ROLE PERMISSION MATRIX</p>
          <h1>{role.data.name}</h1>
          <p className="page-description">Select the actions granted to this company role.</p>
        </div>
        <Link className="button button-secondary" to="/app/roles">
          <ArrowLeft size={15} />
          All roles
        </Link>
      </div>
      {!role.data.isSystem && canUpdate && (
        <form
          className="role-create-strip role-edit-strip"
          onSubmit={(event) => {
            event.preventDefault();
            updateRole.mutate({ name: roleName, description: roleDescription });
          }}
        >
          <UserField label="Role name">
            <input value={roleName} onChange={(event) => setRoleName(event.target.value)} required minLength={2} />
          </UserField>
          <UserField label="Description">
            <input value={roleDescription} onChange={(event) => setRoleDescription(event.target.value)} />
          </UserField>
          <button className="button button-secondary" disabled={updateRole.isPending}>
            {updateRole.isPending ? "Saving…" : "Save role details"}
          </button>
        </form>
      )}
      {role.data.isSystem ? (
        <div className="form-alert" role="status">
          System role permissions are protected.
        </div>
      ) : (
        <div className="permission-matrix">
          {[...grouped].map(([module, permissions]) => (
            <section className="permission-module" key={module}>
              <header>
                <h2>{module.replace(/\b\w/g, (value) => value.toUpperCase())}</h2>
                <span>
                  {permissions.filter((permission) => selected.includes(permission.id)).length} /{" "}
                  {permissions.length} actions
                </span>
              </header>
              <div>
                {permissions.map((permission) => (
                  <label className="permission-action" key={permission.id}>
                    <input
                      type="checkbox"
                      checked={selected.includes(permission.id)}
                      disabled={!canManage}
                      onChange={(event) =>
                        setSelected((current) =>
                          event.target.checked
                            ? [...current, permission.id]
                            : current.filter((value) => value !== permission.id),
                        )
                      }
                    />
                    <span>
                      <strong>{permission.name}</strong>
                      <small>{permission.action}</small>
                    </span>
                  </label>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      <div className="wizard-actions">
        <span>
          {role.data._count?.userRoles ?? 0} active users ·{" "}
          {role.data.isActive ? "Role active" : "Role inactive"}
        </span>
        <div className="heading-actions">
          {!role.data.isSystem && canUpdate && (
              <button
                className="button button-secondary"
                onClick={() => updateRole.mutate({ isActive: !role.data.isActive })}
              >
                {role.data.isActive ? "Deactivate role" : "Activate role"}
              </button>
            )}
          {canManage && !role.data.isSystem && (
            <button
              className="button button-primary"
              disabled={save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? "Saving…" : "Save permission matrix"}
              <Check size={15} />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
