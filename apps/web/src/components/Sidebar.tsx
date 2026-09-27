import { NavLink } from 'react-router-dom';
import { useAuthStore } from '../state/auth-store';

export function Sidebar(): JSX.Element {
  const permissions = useAuthStore((state) => state.user?.permissions ?? []);
  return (
    <aside className="sidebar">
      <a className="brand" href="/" aria-label="Lifter ERP home">
        <span className="brand-mark">L</span>
        <span>
          LIFTER<span className="brand-light"> / ERP</span>
        </span>
      </a>
      <p className="nav-label">WORKSPACE</p>
      <nav aria-label="Main navigation">
        <NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
          <span className="nav-icon">▦</span> Overview
        </NavLink>
        {permissions.includes('companies:read') && (
          <NavLink
            to="/companies"
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            <span className="nav-icon">⌂</span> Companies
          </NavLink>
        )}
        {permissions.includes('users:read') && (
          <NavLink to="/users" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <span className="nav-icon">◎</span> Users
          </NavLink>
        )}
        {permissions.includes('roles:read') && (
          <NavLink to="/roles" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <span className="nav-icon">◇</span> Roles
          </NavLink>
        )}
      </nav>
      <div className="sidebar-bottom">
        <span className="connection-dot" /> Operations online
      </div>
    </aside>
  );
}
