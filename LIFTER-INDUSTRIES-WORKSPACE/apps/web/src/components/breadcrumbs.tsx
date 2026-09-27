import { Link } from "react-router-dom";

export function Breadcrumbs({ label }: { label: string }) {
  return (
    <nav aria-label="Breadcrumb" className="page-breadcrumbs">
      <Link to="/app">Workspace</Link>
      <span>/</span>
      <span aria-current="page">{label}</span>
    </nav>
  );
}
