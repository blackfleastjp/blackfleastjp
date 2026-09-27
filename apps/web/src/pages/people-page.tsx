import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  FileSpreadsheet,
  Search,
  Upload,
  X,
} from "lucide-react";
import type { PageResult } from "@erp/types";
import { api } from "../lib/api-client.js";
import { exportTablePdf, previewSpreadsheet, type ImportPreview } from "../lib/file-processing.js";
import { EmptyState, ErrorState, LoadingState } from "../components/feedback.js";

interface CompanyPerson {
  id: string;
  name: string;
  email: string;
  role: string;
  joinedAt: string;
}

export function PeoplePage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const people = useQuery({
    queryKey: ["company-users", search, page],
    queryFn: () =>
      api.get<PageResult<CompanyPerson>>(
        `/dashboard/users?page=${page}&pageSize=20${search ? `&search=${encodeURIComponent(search)}` : ""}`,
      ),
    placeholderData: (previous) => previous,
  });

  async function handleImport(file: File | undefined) {
    setPreview(null);
    setImportError(null);
    if (!file) return;
    try {
      setPreview(await previewSpreadsheet(file));
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Could not read this file.");
    }
  }

  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <p className="eyebrow">COMPANY DIRECTORY</p>
          <h1>People</h1>
          <p className="page-description">The people and roles connected to this workspace.</p>
        </div>
        <div className="heading-actions">
          <label className="button button-secondary file-button">
            <Upload size={16} />
            Import file
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              aria-label="Import people spreadsheet"
              onChange={(event) => void handleImport(event.target.files?.[0])}
            />
          </label>
          <button
            className="button button-primary"
            disabled={!people.data?.items.length}
            onClick={() =>
              people.data &&
              void exportTablePdf(
                "Company people",
                ["Name", "Email", "Role", "Joined"],
                people.data.items.map((person) => [
                  person.name,
                  person.email,
                  person.role,
                  new Date(person.joinedAt).toLocaleDateString(),
                ]),
              )
            }
          >
            <ArrowDownToLine size={16} />
            Export PDF
          </button>
        </div>
      </div>
      {(preview || importError) && (
        <div
          className={`import-notice ${importError ? "import-notice-error" : ""}`}
          role={importError ? "alert" : "status"}
        >
          <div className="import-notice-icon">
            <FileSpreadsheet size={18} />
          </div>
          <div className="import-notice-copy">
            <strong>
              {importError
                ? "File could not be opened"
                : `${preview?.totalRows ?? 0} rows ready to review`}
            </strong>
            <span>{importError ?? `Columns detected: ${preview?.headers.join(", ")}`}</span>
            {preview && (
              <span className="import-disclaimer">Preview only. No records have been changed.</span>
            )}
          </div>
          <button
            className="icon-button"
            aria-label="Dismiss import preview"
            onClick={() => {
              setPreview(null);
              setImportError(null);
            }}
          >
            <X size={17} />
          </button>
        </div>
      )}
      {preview && (
        <div className="import-preview-table">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {preview.headers.map((header) => (
                    <th key={header}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 5).map((row, index) => (
                  <tr key={index}>
                    {preview.headers.map((header) => (
                      <td key={header}>{row[header]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div className="data-panel">
        <div className="data-toolbar">
          <div>
            <h2>Team members</h2>
            <span>{people.data?.total ?? 0} people</span>
          </div>
          <label className="search-field">
            <Search size={16} />
            <input
              type="search"
              placeholder="Search name or email"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              aria-label="Search people"
            />
          </label>
        </div>
        {people.isPending ? (
          <LoadingState label="Loading people" />
        ) : people.isError ? (
          <ErrorState message={people.error.message} onRetry={() => void people.refetch()} />
        ) : people.data.items.length === 0 ? (
          <EmptyState
            title={search ? "No matching people" : "No team members yet"}
            detail={
              search
                ? "Try another name or email address."
                : "People with access to this company will appear here."
            }
          />
        ) : (
          <>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Email</th>
                    <th scope="col">Role</th>
                    <th scope="col">Added</th>
                  </tr>
                </thead>
                <tbody>
                  {people.data.items.map((person) => (
                    <tr key={person.id}>
                      <td>
                        <span className="person-cell">
                          <span className="person-avatar">
                            {person.name.slice(0, 1).toUpperCase()}
                          </span>
                          <strong>{person.name}</strong>
                        </span>
                      </td>
                      <td className="secondary-cell">{person.email}</td>
                      <td>
                        <span className="role-pill">{person.role}</span>
                      </td>
                      <td className="secondary-cell">
                        {new Intl.DateTimeFormat(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        }).format(new Date(person.joinedAt))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-pagination">
              <span>
                Page {people.data.page} of {Math.max(people.data.pageCount, 1)} <i>·</i>{" "}
                {people.data.total} total
              </span>
              <div>
                <button
                  className="icon-button"
                  aria-label="Previous page"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => current - 1)}
                >
                  <ArrowLeft size={17} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Next page"
                  disabled={page >= people.data.pageCount}
                  onClick={() => setPage((current) => current + 1)}
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
