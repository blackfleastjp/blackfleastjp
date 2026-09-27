import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { activateCompanyContext } from '../api/company-context';
import { apiRequest } from '../api/client';
import { usePermissions } from '../auth/has-permission';
import type { Company } from '../types/erp';

const pageSize = 10;

export function CompanyListPage(): JSX.Element {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [page, setPage] = useState(1);
  const [switchError, setSwitchError] = useState('');
  const permissions = usePermissions();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ['companies'],
    queryFn: () => apiRequest<{ companies: Company[] }>('/companies'),
  });

  const companies = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return (query.data?.companies ?? []).filter((company) => {
      const matchesSearch =
        !normalizedSearch ||
        [company.name, company.code, company.city, company.state].some((value) =>
          value?.toLowerCase().includes(normalizedSearch),
        );
      const matchesStatus =
        status === 'all' || (status === 'active' ? company.isActive : !company.isActive);
      return matchesSearch && matchesStatus;
    });
  }, [query.data?.companies, search, status]);
  const pageCount = Math.max(1, Math.ceil(companies.length / pageSize));
  const visibleCompanies = companies.slice((page - 1) * pageSize, page * pageSize);

  async function openCompany(companyId: string): Promise<void> {
    setSwitchError('');
    try {
      await activateCompanyContext(companyId);
      await queryClient.invalidateQueries();
      navigate(`/companies/${companyId}`);
    } catch (error) {
      setSwitchError(
        error instanceof Error ? error.message : 'Company context could not be changed.',
      );
    }
  }

  return (
    <div className="erp-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ORGANIZATION</p>
          <h1>Companies</h1>
          <p className="page-subtitle">
            {query.data?.companies.length ?? 0} companies you can access
          </p>
        </div>
        {permissions.includes('companies:create') && (
          <button className="button-primary" onClick={() => navigate('/companies/new')}>
            ＋ New company
          </button>
        )}
      </div>

      <div className="toolbar">
        <label className="search-control">
          <span aria-hidden="true">⌕</span>
          <input
            aria-label="Search companies"
            placeholder="Search name, code, location"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="filter-control">
          <span>Status</span>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as typeof status);
              setPage(1);
            }}
          >
            <option value="all">All companies</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
        <span className="toolbar-count">{companies.length} results</span>
      </div>

      {switchError && (
        <p className="inline-error" role="alert">
          {switchError}
        </p>
      )}
      {query.isPending ? (
        <p className="empty-state">Loading companies...</p>
      ) : query.isError ? (
        <div className="empty-state">
          <p>{query.error.message}</p>
          <button className="button-secondary" onClick={() => void query.refetch()}>
            Retry
          </button>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Code</th>
                <th>Location</th>
                <th>Currency</th>
                <th>Roles</th>
                <th>Status</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleCompanies.map((company) => (
                <tr key={company.id}>
                  <td>
                    <strong>{company.name}</strong>
                    <small>{company.email ?? company.phone ?? 'Company profile'}</small>
                  </td>
                  <td>
                    <span className="code-label">{company.code}</span>
                  </td>
                  <td>{[company.city, company.state].filter(Boolean).join(', ') || '—'}</td>
                  <td>{company.baseCurrency}</td>
                  <td>{company.roles?.join(', ') || '—'}</td>
                  <td>
                    <span
                      className={`status-pill ${company.isActive ? 'is-active' : 'is-inactive'}`}
                    >
                      {company.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <button className="text-button" onClick={() => void openCompany(company.id)}>
                      Open <span aria-hidden="true">↗</span>
                    </button>
                  </td>
                </tr>
              ))}
              {visibleCompanies.length === 0 && (
                <tr>
                  <td colSpan={7} className="table-empty">
                    No companies match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="table-footer">
        <span>
          Page {page} of {pageCount}
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
            disabled={page >= pageCount}
            onClick={() => setPage((current) => current + 1)}
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}
