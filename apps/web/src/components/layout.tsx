import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Building2,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings2,
  Users,
  X,
} from "lucide-react";
import type { AuthUser } from "@erp/types";
import { api, setAccessToken } from "../lib/api-client.js";
import { useUiStore } from "../state/ui-store.js";
import { ConfirmationDialog, LoadingState, Toast, useToast } from "./feedback.js";

const navigation = [
  { to: "/app", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/app/people", label: "People", icon: Users },
  { to: "/app/activity", label: "Activity", icon: Activity },
  { to: "/app/settings", label: "Company", icon: Building2 },
];

export function ProtectedLayout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const location = useLocation();
  const toast = useToast();
  const {
    data: user,
    isPending,
    error,
  } = useQuery({
    queryKey: ["current-user"],
    queryFn: () => api.get<AuthUser>("/auth/me"),
    retry: false,
  });
  const selectedCompanyId = useUiStore((state) => state.selectedCompanyId);
  const setSelectedCompanyId = useUiStore((state) => state.setSelectedCompanyId);
  const sidebarCollapsed = useUiStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const mobileNavOpen = useUiStore((state) => state.mobileNavOpen);
  const setMobileNavOpen = useUiStore((state) => state.setMobileNavOpen);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const selectedCompany =
    user?.companies.find((company) => company.id === selectedCompanyId) ?? user?.companies[0];

  useEffect(() => {
    if (selectedCompany && selectedCompany.id !== selectedCompanyId)
      setSelectedCompanyId(selectedCompany.id);
  }, [selectedCompany, selectedCompanyId, setSelectedCompanyId]);

  const logout = useMutation({
    mutationFn: () => api.post<{ signedOut: boolean }>("/auth/logout"),
    onSettled: async () => {
      setAccessToken(null);
      await queryClient.clear();
      navigate("/login", { replace: true });
    },
  });

  if (isPending) return <LoadingState />;
  if (error || !user)
    return (
      <main className="full-page-error">
        <h1>Workspace unavailable</h1>
        <p>Sign in again to continue.</p>
        <Link className="button button-primary" to="/login">
          Go to sign in
        </Link>
      </main>
    );
  if (user.companies.length === 0)
    return (
      <main className="full-page-error">
        <h1>No company access</h1>
        <p>Your account is not assigned to an active company.</p>
        <button className="button button-secondary" onClick={() => void logout.mutateAsync()}>
          Sign out
        </button>
      </main>
    );

  const path = location.pathname.replace("/app", "");
  const current =
    navigation.find(
      (item) =>
        item.to === location.pathname ||
        (!item.end && path.startsWith(item.to.replace("/app", ""))),
    ) ?? navigation[0]!;

  return (
    <div className={`app-shell ${sidebarCollapsed ? "sidebar-is-collapsed" : ""}`}>
      {mobileNavOpen && (
        <button
          className="mobile-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileNavOpen(false)}
        />
      )}
      <aside className={`sidebar ${mobileNavOpen ? "sidebar-mobile-open" : ""}`}>
        <Link to="/app" className="brand-lockup" aria-label="Ledgerline home">
          <span className="brand-symbol">L</span>
          <span className="brand-name">
            ledgerline<span>ERP</span>
          </span>
        </Link>
        <div className="workspace-label">WORKSPACE</div>
        <label className="company-picker">
          <Building2 size={16} />
          <select
            aria-label="Select company"
            value={selectedCompany?.id ?? ""}
            onChange={(event) => setSelectedCompanyId(event.target.value)}
          >
            {user.companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
          <ChevronDown size={15} />
        </label>
        <div className="nav-caption">OPERATIONS</div>
        <nav className="primary-nav" aria-label="Primary navigation">
          {navigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              {...(end === undefined ? {} : { end })}
              className={({ isActive }) => `nav-link ${isActive ? "nav-link-active" : ""}`}
              onClick={() => setMobileNavOpen(false)}
            >
              <Icon size={18} strokeWidth={1.8} />
              <span>{label}</span>
              {label === "Overview" && <span className="nav-current-dot" />}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-footnote">
          <span className="online-dot" />
          All systems operational
        </div>
        <div className="profile-row">
          <div className="avatar">{user.name.slice(0, 1).toUpperCase()}</div>
          <div className="profile-copy">
            <strong>{user.name}</strong>
            <span>{user.email}</span>
          </div>
          <button
            className="icon-button profile-menu"
            title="Sign out"
            aria-label="Sign out"
            onClick={() => setConfirmLogout(true)}
          >
            <LogOut size={16} />
          </button>
        </div>
        <button
          className="collapse-control"
          onClick={toggleSidebar}
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {sidebarCollapsed ? (
            <ChevronsRight size={17} />
          ) : (
            <>
              <ChevronsLeft size={17} />
              <span>Collapse</span>
            </>
          )}
        </button>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <button
            className="mobile-menu icon-button"
            aria-label="Open navigation"
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumbs">
            <span>Workspace</span>
            <span className="breadcrumb-slash">/</span>
            <strong>{current.label}</strong>
          </div>
          <div className="topbar-right">
            <span className="date-label">
              {new Intl.DateTimeFormat(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
              }).format(new Date())}
            </span>
            <span className="header-avatar">{user.name.slice(0, 1).toUpperCase()}</span>
            <button
              className="mobile-menu icon-button"
              aria-label="Close navigation"
              onClick={() => setMobileNavOpen(false)}
            >
              <X size={18} />
            </button>
          </div>
        </header>
        <main className="page-content">
          <div key={location.pathname} className="page-enter">
            <Outlet context={{ user, company: selectedCompany, showToast: toast.showToast }} />
          </div>
        </main>
        <footer className="page-footer">
          <span>Ledgerline ERP</span>
          <span>
            © {new Date().getFullYear()} · {selectedCompany?.name ?? "Company"}
          </span>
        </footer>
      </div>
      <Toast message={toast.message} onDismiss={toast.dismissToast} />
      <ConfirmationDialog
        open={confirmLogout}
        title="Sign out of Ledgerline?"
        message="Your current session will be ended on this device."
        confirmLabel="Sign out"
        onCancel={() => setConfirmLogout(false)}
        onConfirm={() => {
          setConfirmLogout(false);
          void logout.mutateAsync();
        }}
      />
    </div>
  );
}

export function CompanySettingsPage() {
  const companyId = useUiStore((state) => state.selectedCompanyId);
  const { data: user } = useQuery({
    queryKey: ["current-user"],
    queryFn: () => api.get<AuthUser>("/auth/me"),
  });
  const company = user?.companies.find((item) => item.id === companyId) ?? user?.companies[0];
  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ADMINISTRATION</p>
          <h1>Company profile</h1>
          <p className="page-description">Your active company and access level.</p>
        </div>
        <Settings2 className="heading-mark" size={27} />
      </div>
      <div className="settings-layout">
        <div className="settings-main">
          <div className="section-title">
            <div>
              <h2>Company details</h2>
              <p>Organization-wide defaults</p>
            </div>
            <span className="status-badge">
              <span className="online-dot" />
              Active
            </span>
          </div>
          <dl className="detail-list">
            <div>
              <dt>Company name</dt>
              <dd>{company?.name ?? "Unavailable"}</dd>
            </div>
            <div>
              <dt>Default currency</dt>
              <dd>{company?.currency ?? "Unavailable"}</dd>
            </div>
            <div>
              <dt>Your roles</dt>
              <dd>{company?.roles.join(", ") || "No assigned roles"}</dd>
            </div>
            <div>
              <dt>Company ID</dt>
              <dd className="mono-value">{company?.id ?? "Unavailable"}</dd>
            </div>
          </dl>
        </div>
        <aside className="settings-aside">
          <span className="aside-icon">
            <Building2 size={19} />
          </span>
          <h3>One workspace, shared context</h3>
          <p>
            Company access and role permissions are verified by the API on every company-scoped
            request.
          </p>
        </aside>
      </div>
    </section>
  );
}
