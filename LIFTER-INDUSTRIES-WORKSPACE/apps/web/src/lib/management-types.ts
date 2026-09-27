import type { AuthUser, PageResult } from "@erp/types";

export type CompanySummary = {
  id: string;
  name: string;
  code: string;
  city: string | null;
  state: string | null;
  baseCurrency: string;
  isActive: boolean;
  deletedAt: string | null;
  createdAt: string;
};

export type Company = CompanySummary & {
  legalName: string | null;
  address: string | null;
  pincode: string | null;
  country: string;
  gstin: string | null;
  pan: string | null;
  email: string | null;
  phone: string | null;
  logo: string | null;
  financialYearStart: string | null;
  financialYearEnd: string | null;
  booksBeginningDate: string | null;
  currency: string;
  timezone: string;
  featureConfiguration: Record<string, boolean>;
  updatedAt: string;
};

export type ManagedUser = {
  id: string;
  name: string;
  email: string;
  employeeCode: string | null;
  department: string | null;
  designation: string | null;
  mobile: string | null;
  alternateEmail?: string | null;
  dateOfJoining?: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  roles: Array<{ id: string; name: string }>;
};

export type ManagedRole = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { permissions: number; userRoles: number };
  permissions?: Permission[];
};

export type Permission = {
  id: string;
  key: string;
  name: string;
  module: string;
  action: string;
  description?: string | null;
};

export type BackgroundJob = {
  id: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";
  error: string | null;
  result: unknown;
  createdAt: string;
  finishedAt: string | null;
};

export type WorkspaceOutletContext = {
  user: AuthUser;
  company: AuthUser["companies"][number];
  showToast: (message: string | null) => void;
};

export type PageData<T> = PageResult<T>;
