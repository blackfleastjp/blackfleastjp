import { useEffect, useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  Clock3,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { z } from "zod";
import { companyFeaturesSchema, createCompanySchema } from "@erp/validation";
import { api } from "../lib/api-client.js";
import type {
  BackgroundJob,
  Company,
  CompanySummary,
  ManagedUser,
  PageData,
  WorkspaceOutletContext,
} from "../lib/management-types.js";
import { useUiStore } from "../state/ui-store.js";
import { EmptyState, ErrorState, LoadingState } from "../components/feedback.js";
import { permissionAllows } from "@erp/shared";

type CompanyFormValues = z.input<typeof createCompanySchema>;
type FeatureValues = z.infer<typeof companyFeaturesSchema>;

const emptyCompany: CompanyFormValues = {
  name: "",
  code: "",
  legalName: "",
  address: "",
  city: "",
  state: "",
  pincode: "",
  country: "IN",
  gstin: "",
  pan: "",
  email: "",
  phone: "",
  logo: "",
  financialYearStart: "",
  financialYearEnd: "",
  booksBeginningDate: "",
  baseCurrency: "INR",
  timezone: "Asia/Kolkata",
};

const defaultFeatures: FeatureValues = {
  finance: true,
  inventory: false,
  sales: false,
  purchasing: false,
  humanResources: false,
  reports: true,
};

function companyToForm(company: Company): CompanyFormValues {
  return {
    name: company.name,
    code: company.code,
    legalName: company.legalName ?? "",
    address: company.address ?? "",
    city: company.city ?? "",
    state: company.state ?? "",
    pincode: company.pincode ?? "",
    country: company.country,
    gstin: company.gstin ?? "",
    pan: company.pan ?? "",
    email: company.email ?? "",
    phone: company.phone ?? "",
    logo: company.logo ?? "",
    financialYearStart: company.financialYearStart ?? "",
    financialYearEnd: company.financialYearEnd ?? "",
    booksBeginningDate: company.booksBeginningDate ?? "",
    baseCurrency: company.baseCurrency,
    timezone: company.timezone,
  };
}

function setCompanyContext(companyId: string | undefined): void {
  if (companyId && useUiStore.getState().selectedCompanyId !== companyId) {
    useUiStore.getState().setSelectedCompanyId(companyId);
  }
}

function companyQuery(companyId: string | undefined) {
  const selectedCompanyId = useUiStore((state) => state.selectedCompanyId);
  return useQuery({
    queryKey: ["company", companyId],
    queryFn: () => api.get<Company>(`/companies/${companyId}`),
    enabled: Boolean(companyId && selectedCompanyId === companyId),
  });
}

export function CompanyListPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"active" | "inactive" | "deleted" | "all">("active");
  const [page, setPage] = useState(1);
  const canCreate = useOutletContext<WorkspaceOutletContext>().company.permissions;
  const canAdd = permissionAllows(new Set(canCreate), "company.create");
  const query = useQuery({
    queryKey: ["companies", search, status, page],
    queryFn: () =>
      api.get<PageData<CompanySummary>>(
        `/companies?page=${page}&pageSize=20&status=${status}${search ? `&search=${encodeURIComponent(search)}` : ""}`,
      ),
    placeholderData: (previous) => previous,
  });
  const setSelectedCompanyId = useUiStore((state) => state.setSelectedCompanyId);
  const activation = useMutation({
    mutationFn: (companyId: string) => api.post<Company>(`/companies/${companyId}/activate`),
    onSuccess: async (company) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["companies"] }),
        queryClient.invalidateQueries({ queryKey: ["current-user"] }),
      ]);
      setSelectedCompanyId(company.id);
    },
  });
  const queryClient = useQueryClient();

  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ORGANIZATION ADMINISTRATION</p>
          <h1>Companies</h1>
          <p className="page-description">Manage company profiles and operating settings.</p>
        </div>
        {canAdd && (
          <Link className="button button-primary" to="/app/companies/new">
            <Plus size={16} />
            Add company
          </Link>
        )}
      </div>
      <div className="data-panel">
        <div className="data-toolbar">
          <div>
            <h2>Company directory</h2>
            <span>{query.data?.total ?? 0} companies</span>
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
                placeholder="Search name, code, GSTIN"
                aria-label="Search companies"
              />
            </label>
            <select
              className="filter-select"
              value={status}
              aria-label="Company status"
              onChange={(event) => {
                setStatus(event.target.value as typeof status);
                setPage(1);
              }}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="deleted">Deleted</option>
              <option value="all">All statuses</option>
            </select>
          </div>
        </div>
        {query.isPending ? (
          <LoadingState label="Loading companies" />
        ) : query.isError ? (
          <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
        ) : query.data.items.length === 0 ? (
          <EmptyState
            title="No companies found"
            detail={
              search
                ? "Try another company name, code, or GSTIN."
                : "Companies you can access will appear here."
            }
          />
        ) : (
          <>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Code</th>
                    <th>Location</th>
                    <th>Currency</th>
                    <th>Status</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.items.map((company) => (
                    <tr key={company.id}>
                      <td>
                        <Link
                          className="person-cell company-cell"
                          to={`/app/companies/${company.id}`}
                          onClick={() => setSelectedCompanyId(company.id)}
                        >
                          <span className="company-table-icon">
                            <Building2 size={15} />
                          </span>
                          <strong>{company.name}</strong>
                        </Link>
                      </td>
                      <td className="mono-value">{company.code}</td>
                      <td className="secondary-cell">
                        {[company.city, company.state].filter(Boolean).join(", ") || "Not set"}
                      </td>
                      <td>{company.baseCurrency}</td>
                      <td>
                        <span
                          className={`status-pill ${company.isActive && !company.deletedAt ? "status-pill-active" : "status-pill-muted"}`}
                        >
                          {company.deletedAt ? "Deleted" : company.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td>
                        {(!company.isActive || company.deletedAt) &&
                          permissionAllows(new Set(canCreate), "company.activate") && (
                            <button
                              className="text-button"
                              disabled={activation.isPending}
                              onClick={() => {
                                setSelectedCompanyId(company.id);
                                void activation.mutateAsync(company.id);
                              }}
                            >
                              Activate
                            </button>
                          )}
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

export function CompanyFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  useEffect(() => setCompanyContext(id), [id]);
  const company = companyQuery(id);
  const [step, setStep] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setSelectedCompanyId = useUiStore((state) => state.setSelectedCompanyId);
  const form = useForm<CompanyFormValues>({
    resolver: zodResolver(createCompanySchema) as Resolver<CompanyFormValues>,
    defaultValues: emptyCompany,
  });
  useEffect(() => {
    if (company.data) form.reset(companyToForm(company.data));
  }, [company.data, form.reset]);
  const save = useMutation({
    mutationFn: (values: CompanyFormValues) =>
      api[isEdit ? "put" : "post"]<Company>(isEdit ? `/companies/${id}` : "/companies", values),
    onSuccess: async (saved) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["companies"] }),
        queryClient.invalidateQueries({ queryKey: ["current-user"] }),
      ]);
      setSelectedCompanyId(saved.id);
      navigate(`/app/companies/${saved.id}`, { replace: true });
    },
    onError: (error: Error) => setFormError(error.message),
  });

  if (isEdit && company.isPending) return <LoadingState label="Loading company details" />;
  if (isEdit && company.isError)
    return <ErrorState message={company.error.message} onRetry={() => void company.refetch()} />;

  function nextStep() {
    const fields =
      step === 0
        ? (["name", "code", "address", "city", "state", "pincode"] as const)
        : step === 1
          ? (["gstin", "pan", "email", "phone"] as const)
          : ([
              "financialYearStart",
              "financialYearEnd",
              "booksBeginningDate",
              "baseCurrency",
              "timezone",
            ] as const);
    void form.trigger([...fields]).then((valid) => {
      if (valid) setStep((value) => Math.min(2, value + 1));
    });
  }

  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{isEdit ? "COMPANY SETTINGS" : "NEW ORGANIZATION"}</p>
          <h1>{isEdit ? "Edit company" : "Create company"}</h1>
          <p className="page-description">
            Company identity, statutory registration, and fiscal defaults.
          </p>
        </div>
        <Link
          className="button button-secondary"
          to={isEdit ? `/app/companies/${id}` : "/app/companies"}
        >
          <ArrowLeft size={15} />
          Back
        </Link>
      </div>
      <div className="wizard-panel">
        <div className="wizard-steps" aria-label="Company form steps">
          {["Identity", "Registration", "Financial year"].map((label, index) => (
            <div
              key={label}
              className={`wizard-step ${index === step ? "wizard-step-current" : index < step ? "wizard-step-done" : ""}`}
            >
              <span>{index < step ? <Check size={14} /> : index + 1}</span>
              <strong>{label}</strong>
            </div>
          ))}
        </div>
        <form
          onSubmit={form.handleSubmit((values) => {
            setFormError(null);
            save.mutate(values);
          })}
          noValidate
        >
          {step === 0 && (
            <div className="form-grid">
              <div className="form-section-heading">
                <h2>Company identity</h2>
                <p>Legal and operating address</p>
              </div>
              <Field label="Company name" error={form.formState.errors.name?.message}>
                <input {...form.register("name")} autoComplete="organization" />
              </Field>
              <Field label="Company code" error={form.formState.errors.code?.message}>
                <input {...form.register("code")} placeholder="Unique code" />
              </Field>
              <Field label="Legal name">
                <input {...form.register("legalName")} />
              </Field>
              <Field label="Country">
                <input {...form.register("country")} maxLength={2} />
              </Field>
              <Field label="Address" wide>
                <input {...form.register("address")} />
              </Field>
              <Field label="City">
                <input {...form.register("city")} />
              </Field>
              <Field label="State">
                <input {...form.register("state")} />
              </Field>
              <Field label="PIN code" error={form.formState.errors.pincode?.message}>
                <input {...form.register("pincode")} inputMode="numeric" maxLength={6} />
              </Field>
            </div>
          )}
          {step === 1 && (
            <div className="form-grid">
              <div className="form-section-heading">
                <h2>Tax registration</h2>
                <p>GSTIN and PAN are validated before saving.</p>
              </div>
              <Field label="GSTIN" error={form.formState.errors.gstin?.message}>
                <input {...form.register("gstin")} maxLength={15} />
              </Field>
              <Field label="PAN" error={form.formState.errors.pan?.message}>
                <input {...form.register("pan")} maxLength={10} />
              </Field>
              <Field label="Company email" error={form.formState.errors.email?.message}>
                <input type="email" {...form.register("email")} />
              </Field>
              <Field label="Indian mobile" error={form.formState.errors.phone?.message}>
                <input {...form.register("phone")} inputMode="tel" />
              </Field>
              <Field label="Logo URL" wide error={form.formState.errors.logo?.message}>
                <input type="url" {...form.register("logo")} />
              </Field>
            </div>
          )}
          {step === 2 && (
            <div className="form-grid">
              <div className="form-section-heading">
                <h2>Financial year</h2>
                <p>These dates establish the company accounting calendar.</p>
              </div>
              <Field
                label="Financial year starts"
                error={form.formState.errors.financialYearStart?.message}
              >
                <input type="date" {...form.register("financialYearStart")} />
              </Field>
              <Field
                label="Financial year ends"
                error={form.formState.errors.financialYearEnd?.message}
              >
                <input type="date" {...form.register("financialYearEnd")} />
              </Field>
              <Field label="Books beginning date">
                <input type="date" {...form.register("booksBeginningDate")} />
              </Field>
              <Field label="Base currency">
                <select {...form.register("baseCurrency")}>
                  <option value="INR">INR · Indian rupee</option>
                  <option value="USD">USD · US dollar</option>
                  <option value="EUR">EUR · Euro</option>
                  <option value="GBP">GBP · Pound sterling</option>
                </select>
              </Field>
              <Field label="Time zone">
                <select {...form.register("timezone")}>
                  <option value="Asia/Kolkata">India Standard Time</option>
                  <option value="UTC">UTC</option>
                  <option value="Asia/Dubai">Gulf Standard Time</option>
                </select>
              </Field>
            </div>
          )}
          {formError && (
            <div className="form-alert" role="alert">
              {formError}
            </div>
          )}
          <div className="wizard-actions">
            <button
              type="button"
              className="button button-secondary"
              disabled={step === 0}
              onClick={() => setStep((value) => Math.max(0, value - 1))}
            >
              <ArrowLeft size={15} />
              Previous
            </button>
            <span>Step {step + 1} of 3</span>
            {step < 2 ? (
              <button type="button" className="button button-primary" onClick={nextStep}>
                Continue
                <ArrowRight size={15} />
              </button>
            ) : (
              <button type="submit" className="button button-primary" disabled={save.isPending}>
                {save.isPending ? "Saving…" : isEdit ? "Save company" : "Create company"}
                <Check size={16} />
              </button>
            )}
          </div>
        </form>
      </div>
    </section>
  );
}

function Field({
  label,
  error,
  wide,
  children,
}: {
  label: string;
  error?: string | undefined;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`management-field ${wide ? "management-field-wide" : ""}`}>
      <span>{label}</span>
      {children}
      {error && <small className="field-error">{error}</small>}
    </label>
  );
}

type CompanyTab = "details" | "settings" | "users" | "backup";

export function CompanyDetailPage() {
  const { id } = useParams();
  useEffect(() => setCompanyContext(id), [id]);
  const company = companyQuery(id);
  const [tab, setTab] = useState<CompanyTab>("details");
  const { company: activeCompany } = useOutletContext<WorkspaceOutletContext>();
  const permissions = new Set(activeCompany.permissions);
  const queryClient = useQueryClient();
  const canEdit = permissionAllows(permissions, "company.update");
  const canBackup = permissionAllows(permissions, "company.backup");
  const canRestore = permissionAllows(permissions, "company.restore");
  const deletion = useMutation({
    mutationFn: () => api.delete<{ deleted: boolean }>(`/companies/${id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["companies"] });
      setTab("details");
    },
  });
  if (company.isPending) return <LoadingState label="Loading company" />;
  if (company.isError)
    return <ErrorState message={company.error.message} onRetry={() => void company.refetch()} />;
  const tabs: Array<{ id: CompanyTab; label: string }> = [
    { id: "details", label: "Details" },
    { id: "settings", label: "Settings" },
    { id: "users", label: "Users" },
    { id: "backup", label: "Backup" },
  ];
  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <p className="eyebrow">COMPANY PROFILE · {company.data.code}</p>
          <h1>{company.data.name}</h1>
          <p className="page-description">
            {[company.data.city, company.data.state].filter(Boolean).join(", ") ||
              "Location not configured"}
          </p>
        </div>
        <div className="heading-actions">
          <span
            className={`status-pill ${company.data.isActive ? "status-pill-active" : "status-pill-muted"}`}
          >
            {company.data.isActive ? "Active" : "Inactive"}
          </span>
          {canEdit && (
            <Link className="button button-secondary" to={`/app/companies/${id}/edit`}>
              <Settings2 size={15} />
              Edit details
            </Link>
          )}
        </div>
      </div>
      <nav className="management-tabs" aria-label="Company sections">
        {tabs.map((item) => (
          <button
            key={item.id}
            className={tab === item.id ? "management-tab management-tab-active" : "management-tab"}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      {tab === "details" && (
        <div className="management-columns">
          <div className="data-panel company-detail-panel">
            <div className="section-title">
              <div>
                <h2>Company details</h2>
                <p>Legal and contact information</p>
              </div>
              <Building2 size={20} />
            </div>
            <dl className="detail-list">
              <Detail label="Legal name" value={company.data.legalName} />
              <Detail label="Company code" value={company.data.code} />
              <Detail label="GSTIN" value={company.data.gstin} />
              <Detail label="PAN" value={company.data.pan} />
              <Detail label="Company email" value={company.data.email} />
              <Detail label="Phone" value={company.data.phone} />
              <Detail label="Address" value={company.data.address} />
              <Detail
                label="City / State"
                value={[company.data.city, company.data.state].filter(Boolean).join(", ")}
              />
              <Detail label="PIN code" value={company.data.pincode} />
              <Detail label="Country" value={company.data.country} />
            </dl>
          </div>
          <aside className="settings-aside">
            <span className="aside-icon">
              <ShieldCheck size={19} />
            </span>
            <h3>Access is verified on the server</h3>
            <p>
              Every company endpoint checks membership and permissions for this company before
              returning data.
            </p>
          </aside>
        </div>
      )}
      {tab === "settings" && (
        <>
          <div className="feature-page-link">
            <span>Detailed module configuration</span>
            {permissionAllows(permissions, "company.features.update") && (
              <Link className="text-button" to={`/app/companies/${company.data.id}/features`}>
                Open feature configuration
              </Link>
            )}
          </div>
          <CompanyFeatureSettings
            companyId={company.data.id}
            initialFeatures={company.data.featureConfiguration}
            canEdit={permissionAllows(permissions, "company.features.update")}
          />
        </>
      )}
      {tab === "users" && <CompanyUsers companyId={company.data.id} />}
      {tab === "backup" && (
        <CompanyBackups companyId={company.data.id} canBackup={canBackup} canRestore={canRestore} />
      )}
      {permissionAllows(permissions, "company.delete") && company.data.isActive && (
        <div className="destructive-row">
          <div>
            <strong>Deactivate company</strong>
            <span>This company will be removed from active workspaces.</span>
          </div>
          <button
            className="button button-danger"
            disabled={deletion.isPending}
            onClick={() => {
              if (window.confirm(`Deactivate ${company.data.name}?`)) void deletion.mutateAsync();
            }}
          >
            {deletion.isPending ? "Deactivating…" : "Deactivate"}
          </button>
        </div>
      )}
    </section>
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

function CompanyFeatureSettings({
  companyId,
  initialFeatures,
  canEdit,
}: {
  companyId: string;
  initialFeatures: Record<string, boolean>;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const features = useQuery({
    queryKey: ["company-features", companyId],
    queryFn: () => api.get<Record<string, boolean>>(`/companies/${companyId}/features`),
  });
  const save = useMutation({
    mutationFn: (values: FeatureValues) => api.put(`/companies/${companyId}/features`, values),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["company", companyId] }),
  });
  const [values, setValues] = useState<FeatureValues>({ ...defaultFeatures, ...initialFeatures });
  useEffect(() => {
    if (features.data) setValues({ ...defaultFeatures, ...features.data });
  }, [features.data]);
  if (features.isPending) return <LoadingState label="Loading company features" />;
  if (features.isError)
    return <ErrorState message={features.error.message} onRetry={() => void features.refetch()} />;
  const labels: Array<[keyof FeatureValues, string, string]> = [
    ["finance", "Finance", "General ledger and financial reporting"],
    ["inventory", "Inventory", "Stock, warehouse, and item tracking"],
    ["sales", "Sales", "Customers, quotations, and invoicing"],
    ["purchasing", "Purchasing", "Suppliers and purchase orders"],
    ["humanResources", "People operations", "Employee records and organization"],
    ["reports", "Reports", "Operational reporting workspace"],
  ];
  return (
    <div className="feature-panel data-panel">
      <div className="section-title">
        <div>
          <h2>Feature configuration</h2>
          <p>Choose which modules are available in this company.</p>
        </div>
        <Settings2 size={19} />
      </div>
      <div className="feature-list">
        {labels.map(([key, label, description]) => (
          <label key={key} className="feature-row">
            <span className="feature-toggle-copy">
              <strong>{label}</strong>
              <small>{description}</small>
            </span>
            <input
              type="checkbox"
              checked={Boolean(values[key])}
              disabled={!canEdit}
              onChange={(event) =>
                setValues((current) => ({ ...current, [key]: event.target.checked }))
              }
            />
          </label>
        ))}
      </div>
      {canEdit && (
        <div className="feature-actions">
          <button
            className="button button-primary"
            disabled={save.isPending}
            onClick={() => save.mutate(values)}
          >
            {save.isPending ? "Saving…" : "Save feature settings"}
          </button>
        </div>
      )}
      {save.isError && (
        <p className="form-alert" role="alert">
          {save.error.message}
        </p>
      )}
    </div>
  );
}

function CompanyUsers({ companyId }: { companyId: string }) {
  const users = useQuery({
    queryKey: ["company-users", companyId],
    queryFn: () => api.get<PageData<ManagedUser>>(`/users?page=1&pageSize=50&status=all`),
  });
  if (users.isPending) return <LoadingState label="Loading company users" />;
  if (users.isError)
    return <ErrorState message={users.error.message} onRetry={() => void users.refetch()} />;
  if (!users.data.items.length)
    return (
      <EmptyState title="No users assigned" detail="Users assigned to this company appear here." />
    );
  return (
    <div className="data-panel">
      <div className="data-toolbar">
        <div>
          <h2>Company users</h2>
          <span>{users.data.total} users</span>
        </div>
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Employee code</th>
              <th>Department</th>
              <th>Roles</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {users.data.items.map((user) => (
              <tr key={user.id}>
                <td>
                  <strong>{user.name}</strong>
                  <small className="table-subtext">{user.email}</small>
                </td>
                <td>{user.employeeCode ?? "—"}</td>
                <td>{user.department ?? "—"}</td>
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
    </div>
  );
}

function CompanyBackups({
  companyId,
  canBackup,
  canRestore,
}: {
  companyId: string;
  canBackup: boolean;
  canRestore: boolean;
}) {
  const queryClient = useQueryClient();
  const backups = useQuery({
    queryKey: ["company-backups", companyId],
    queryFn: () =>
      api.get<PageData<BackgroundJob>>(`/companies/${companyId}/backup?page=1&pageSize=20`),
  });
  const enqueue = useMutation({
    mutationFn: () => api.post<BackgroundJob>(`/companies/${companyId}/backup`),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["company-backups", companyId] }),
  });
  const restore = useMutation({
    mutationFn: (jobId: string) =>
      api.post<BackgroundJob>(`/companies/${companyId}/restore`, { jobId }),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["company-backups", companyId] }),
  });
  if (backups.isPending) return <LoadingState label="Loading backup jobs" />;
  if (backups.isError)
    return <ErrorState message={backups.error.message} onRetry={() => void backups.refetch()} />;
  return (
    <div className="data-panel">
      <div className="data-toolbar">
        <div>
          <h2>Backup jobs</h2>
          <span>{backups.data.total} jobs</span>
        </div>
        {canBackup && (
          <button
            className="button button-primary"
            disabled={enqueue.isPending}
            onClick={() => enqueue.mutate()}
          >
            <UploadCloud size={15} />
            {enqueue.isPending ? "Queueing…" : "Queue backup"}
          </button>
        )}
      </div>
      {!backups.data.items.length ? (
        <EmptyState
          title="No backups yet"
          detail="A backup request creates a job. Files are stored through the configured object storage provider."
        />
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Requested</th>
                <th>Status</th>
                <th>Finished</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {backups.data.items.map((job) => (
                <tr key={job.id}>
                  <td>
                    {new Intl.DateTimeFormat(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(job.createdAt))}
                  </td>
                  <td>
                    <span
                      className={`status-pill ${job.status === "COMPLETED" ? "status-pill-active" : "status-pill-muted"}`}
                    >
                      <Clock3 size={12} />
                      {job.status}
                    </span>
                  </td>
                  <td>{job.finishedAt ? new Date(job.finishedAt).toLocaleString() : "—"}</td>
                  <td>
                    {job.error ??
                      (job.status === "COMPLETED" ? "Available in object storage" : "Processing")}
                    {canRestore && job.status === "COMPLETED" && (
                      <button
                        className="text-button"
                        onClick={() => {
                          if (window.confirm("Queue a restore from this backup?"))
                            void restore.mutateAsync(job.id);
                        }}
                      >
                        Queue restore
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function CompanyFeaturesPage() {
  const { id } = useParams();
  useEffect(() => setCompanyContext(id), [id]);
  const company = companyQuery(id);
  const { company: activeCompany } = useOutletContext<WorkspaceOutletContext>();
  if (company.isPending) return <LoadingState label="Loading company feature configuration" />;
  if (company.isError)
    return <ErrorState message={company.error.message} onRetry={() => void company.refetch()} />;
  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <p className="eyebrow">COMPANY CONFIGURATION · {company.data.code}</p>
          <h1>{company.data.name} features</h1>
          <p className="page-description">Enable operational modules for this company.</p>
        </div>
        <Link className="button button-secondary" to={`/app/companies/${company.data.id}`}>
          <ArrowLeft size={15} /> Company profile
        </Link>
      </div>
      <CompanyFeatureSettings
        companyId={company.data.id}
        initialFeatures={company.data.featureConfiguration}
        canEdit={permissionAllows(new Set(activeCompany.permissions), "company.features.update")}
      />
    </section>
  );
}
