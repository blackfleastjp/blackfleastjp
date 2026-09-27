export type AuthUser = {
  id: string;
  companyId: string;
  email: string;
  firstName: string;
  lastName: string;
  companyName: string;
  companies: Array<{ id: string; name: string; code: string; roles: string[] }>;
  roleName: string;
  roleIds: string[];
  permissions: string[];
};

export type AuthResponse = { accessToken: string; user: AuthUser };
