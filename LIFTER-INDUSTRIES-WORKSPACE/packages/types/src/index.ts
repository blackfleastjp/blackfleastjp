export interface ApiSuccess<T> {
  success: true;
  data: T;
  message: string;
  requestId: string;
}

export interface ApiFailure {
  success: false;
  error: { code: string; message: string; details?: unknown };
  requestId: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  companies: Array<{
    id: string;
    name: string;
    code: string;
    currency: string;
    baseCurrency: string;
    roles: string[];
    permissions: string[];
  }>;
}

export interface AuthSession {
  accessToken: string;
  user: AuthUser;
}

export interface DashboardSummary {
  company: { id: string; name: string; currency: string };
  activeUsers: number;
  activity: Array<{ date: string; events: number }>;
  recentActivity: Array<{ id: string; action: string; createdAt: string; userName: string | null }>;
}

export interface Permission {
  id: string;
  key: string;
  name: string;
  module: string;
  action: string;
  description?: string | null;
}

export interface PageResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
}
