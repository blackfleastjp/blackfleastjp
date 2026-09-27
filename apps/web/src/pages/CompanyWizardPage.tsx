import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { activateCompanyContext } from '../api/company-context';
import { apiRequest } from '../api/client';
import type { Company } from '../types/erp';

type CompanyDraft = {
  name: string;
  code: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  gstin: string;
  pan: string;
  email: string;
  phone: string;
  logo: string;
  financialYearStart: string;
  financialYearEnd: string;
  booksBeginningDate: string;
  baseCurrency: string;
  enableAccounting: boolean;
  enableInventory: boolean;
  enableGst: boolean;
  enablePayroll: boolean;
};

const blankCompany: CompanyDraft = {
  name: '',
  code: '',
  address: '',
  city: '',
  state: '',
  pincode: '',
  country: 'India',
  gstin: '',
  pan: '',
  email: '',
  phone: '',
  logo: '',
  financialYearStart: '',
  financialYearEnd: '',
  booksBeginningDate: '',
  baseCurrency: 'INR',
  enableAccounting: false,
  enableInventory: false,
  enableGst: false,
  enablePayroll: false,
};

const steps = ['Company', 'Address', 'Configuration'];

function fromCompany(company: Company): CompanyDraft {
  return {
    name: company.name,
    code: company.code,
    address: company.address ?? '',
    city: company.city ?? '',
    state: company.state ?? '',
    pincode: company.pincode ?? '',
    country: company.country,
    gstin: company.gstin ?? '',
    pan: company.pan ?? '',
    email: company.email ?? '',
    phone: company.phone ?? '',
    logo: company.logo ?? '',
    financialYearStart: company.financialYearStart?.slice(0, 10) ?? '',
    financialYearEnd: company.financialYearEnd?.slice(0, 10) ?? '',
    booksBeginningDate: company.booksBeginningDate?.slice(0, 10) ?? '',
    baseCurrency: company.baseCurrency,
    enableAccounting: company.enableAccounting,
    enableInventory: company.enableInventory,
    enableGst: company.enableGst,
    enablePayroll: company.enablePayroll,
  };
}

export function CompanyWizardPage(): JSX.Element {
  const { id } = useParams();
  const editing = Boolean(id);
  const [draft, setDraft] = useState(blankCompany);
  const [step, setStep] = useState(0);
  const [formError, setFormError] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const companyQuery = useQuery({
    queryKey: ['company', id],
    queryFn: () => apiRequest<{ company: Company }>(`/companies/${id}`),
    enabled: editing,
  });

  useEffect(() => {
    if (companyQuery.data) setDraft(fromCompany(companyQuery.data.company));
  }, [companyQuery.data]);

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        ...draft,
        pincode: draft.pincode || null,
        gstin: draft.gstin || null,
        pan: draft.pan || null,
        email: draft.email || null,
        phone: draft.phone || null,
        logo: draft.logo || null,
        financialYearStart: draft.financialYearStart || null,
        financialYearEnd: draft.financialYearEnd || null,
        booksBeginningDate: draft.booksBeginningDate || null,
      };
      return apiRequest<{ company: Company }>(editing ? `/companies/${id}` : '/companies', {
        method: editing ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async ({ company }) => {
      setFormError('');
      await activateCompanyContext(company.id);
      await queryClient.invalidateQueries();
      navigate(`/companies/${company.id}`, { replace: true });
    },
    onError: (error) => setFormError(error.message),
  });

  function updateField<Key extends keyof CompanyDraft>(key: Key, value: CompanyDraft[Key]): void {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function goNext(): void {
    if (formRef.current?.reportValidity())
      setStep((current) => Math.min(steps.length - 1, current + 1));
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!draft.name.trim() || !draft.code.trim()) {
      setStep(0);
      setFormError('Company name and code are required.');
      return;
    }
    save.mutate();
  }

  if (editing && companyQuery.isPending) return <p className="empty-state">Loading company...</p>;
  if (editing && companyQuery.isError)
    return (
      <p className="inline-error" role="alert">
        {companyQuery.error.message}
      </p>
    );

  return (
    <div className="erp-page form-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ORGANIZATION / {editing ? 'EDIT' : 'NEW'}</p>
          <h1>{editing ? 'Edit company' : 'Create company'}</h1>
          <p className="page-subtitle">
            {editing ? draft.name : 'Company profile and operating defaults'}
          </p>
        </div>
        <button
          className="button-secondary"
          type="button"
          onClick={() => navigate(editing ? `/companies/${id}` : '/companies')}
        >
          Cancel
        </button>
      </div>
      <div className="wizard-steps" aria-label="Company form steps">
        {steps.map((label, index) => (
          <button
            key={label}
            type="button"
            className={step === index ? 'wizard-step selected' : 'wizard-step'}
            onClick={() => index < step && setStep(index)}
          >
            <span>{String(index + 1).padStart(2, '0')}</span>
            {label}
          </button>
        ))}
      </div>
      <form ref={formRef} className="form-panel" onSubmit={submit}>
        {step === 0 && (
          <div className="form-grid">
            <label className="field wide">
              <span>Legal company name *</span>
              <input
                value={draft.name}
                onChange={(event) => updateField('name', event.target.value)}
                required
                maxLength={160}
              />
            </label>
            <label className="field">
              <span>Company code *</span>
              <input
                value={draft.code}
                onChange={(event) => updateField('code', event.target.value.toUpperCase())}
                required
                pattern="[A-Z0-9][A-Z0-9_-]*"
                maxLength={32}
              />
            </label>
            <label className="field">
              <span>Company email</span>
              <input
                type="email"
                value={draft.email}
                onChange={(event) => updateField('email', event.target.value)}
              />
            </label>
            <label className="field">
              <span>GSTIN</span>
              <input
                value={draft.gstin}
                onChange={(event) => updateField('gstin', event.target.value.toUpperCase())}
                pattern="[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]"
                maxLength={15}
              />
            </label>
            <label className="field">
              <span>PAN</span>
              <input
                value={draft.pan}
                onChange={(event) => updateField('pan', event.target.value.toUpperCase())}
                pattern="[A-Z]{5}[0-9]{4}[A-Z]"
                maxLength={10}
              />
            </label>
            <label className="field">
              <span>Phone</span>
              <input
                type="tel"
                value={draft.phone}
                onChange={(event) => updateField('phone', event.target.value)}
                pattern="(\+91[- ]?)?[6-9][0-9]{9}"
              />
            </label>
            <label className="field wide">
              <span>Logo URL</span>
              <input
                type="url"
                value={draft.logo}
                onChange={(event) => updateField('logo', event.target.value)}
              />
            </label>
          </div>
        )}
        {step === 1 && (
          <div className="form-grid">
            <label className="field wide">
              <span>Address</span>
              <textarea
                rows={3}
                value={draft.address}
                onChange={(event) => updateField('address', event.target.value)}
              />
            </label>
            <label className="field">
              <span>City</span>
              <input
                value={draft.city}
                onChange={(event) => updateField('city', event.target.value)}
              />
            </label>
            <label className="field">
              <span>State</span>
              <input
                value={draft.state}
                onChange={(event) => updateField('state', event.target.value)}
              />
            </label>
            <label className="field">
              <span>PIN code</span>
              <input
                value={draft.pincode}
                onChange={(event) => updateField('pincode', event.target.value)}
                pattern="[1-9][0-9]{5}"
                maxLength={6}
              />
            </label>
            <label className="field">
              <span>Country</span>
              <input
                value={draft.country}
                onChange={(event) => updateField('country', event.target.value)}
                required
              />
            </label>
          </div>
        )}
        {step === 2 && (
          <div className="form-grid">
            <label className="field">
              <span>Financial year starts</span>
              <input
                type="date"
                value={draft.financialYearStart}
                onChange={(event) => updateField('financialYearStart', event.target.value)}
              />
            </label>
            <label className="field">
              <span>Financial year ends</span>
              <input
                type="date"
                value={draft.financialYearEnd}
                onChange={(event) => updateField('financialYearEnd', event.target.value)}
              />
            </label>
            <label className="field">
              <span>Books beginning date</span>
              <input
                type="date"
                value={draft.booksBeginningDate}
                onChange={(event) => updateField('booksBeginningDate', event.target.value)}
              />
            </label>
            <label className="field">
              <span>Base currency</span>
              <input
                value={draft.baseCurrency}
                onChange={(event) => updateField('baseCurrency', event.target.value.toUpperCase())}
                required
                minLength={3}
                maxLength={3}
              />
            </label>
            <div className="field wide">
              <span>Modules</span>
              <div className="feature-grid">
                {(
                  [
                    ['enableAccounting', 'Accounting'],
                    ['enableInventory', 'Inventory'],
                    ['enableGst', 'GST'],
                    ['enablePayroll', 'Payroll'],
                  ] as const
                ).map(([key, label]) => (
                  <label className="toggle-row" key={key}>
                    <input
                      type="checkbox"
                      checked={draft[key]}
                      onChange={(event) => updateField(key, event.target.checked)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
        {formError && (
          <p className="inline-error" role="alert">
            {formError}
          </p>
        )}
        <div className="form-actions">
          <span>
            Step {step + 1} of {steps.length}
          </span>
          <div>
            {step > 0 && (
              <button
                type="button"
                className="button-secondary"
                onClick={() => setStep((current) => current - 1)}
              >
                Back
              </button>
            )}
            {step < steps.length - 1 ? (
              <button type="button" className="button-primary" onClick={goNext}>
                Continue <span aria-hidden="true">→</span>
              </button>
            ) : (
              <button className="button-primary" type="submit" disabled={save.isPending}>
                {save.isPending ? 'Saving...' : editing ? 'Save changes' : 'Create company'}
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
