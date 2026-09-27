export type Company = {
  id: string;
  name: string;
  code: string;
  address: string | null;
  city: string | null;
  state: string | null;
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
  baseCurrency: string;
  enableAccounting: boolean;
  enableInventory: boolean;
  enableGst: boolean;
  enablePayroll: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { users: number; roles: number; backups: number };
  backups?: Array<{ id: string; name: string; checksum: string; createdAt: string }>;
  roles?: string[];
};

export type Role = {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: Array<{ id?: string; module: string; action: string; name: string }>;
  _count?: { userCompanyRoles: number };
};

export type ManagedUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  employeeCode: string | null;
  department: string | null;
  designation: string | null;
  mobile: string | null;
  alternateEmail: string | null;
  dateOfJoining: string | null;
  isActive: boolean;
  companyId: string;
  createdAt: string;
  updatedAt: string;
  roles: Array<{ id: string; name: string; description: string | null }>;
};

export type PageResult<T> = {
  items?: T[];
  users?: T[];
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
};
