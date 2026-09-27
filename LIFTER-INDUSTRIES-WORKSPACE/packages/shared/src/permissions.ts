export const permissionDefinitions = [
  { key: "company.read", name: "View company", module: "company", action: "read" },
  { key: "company.create", name: "Create company", module: "company", action: "create" },
  { key: "company.update", name: "Edit company", module: "company", action: "update" },
  { key: "company.delete", name: "Deactivate company", module: "company", action: "delete" },
  { key: "company.activate", name: "Activate company", module: "company", action: "activate" },
  { key: "company.backup", name: "Create company backup", module: "company", action: "backup" },
  { key: "company.restore", name: "Restore company backup", module: "company", action: "restore" },
  {
    key: "company.features.update",
    name: "Configure company features",
    module: "company",
    action: "features.update",
  },
  { key: "users.read", name: "View users", module: "users", action: "read" },
  { key: "users.create", name: "Create users", module: "users", action: "create" },
  { key: "users.update", name: "Edit users", module: "users", action: "update" },
  { key: "users.delete", name: "Deactivate users", module: "users", action: "delete" },
  {
    key: "users.reset-password",
    name: "Reset user passwords",
    module: "users",
    action: "reset-password",
  },
  {
    key: "users.activity.read",
    name: "View user activity",
    module: "users",
    action: "activity.read",
  },
  { key: "roles.read", name: "View roles", module: "roles", action: "read" },
  { key: "roles.create", name: "Create roles", module: "roles", action: "create" },
  { key: "roles.update", name: "Edit roles", module: "roles", action: "update" },
  { key: "roles.delete", name: "Deactivate roles", module: "roles", action: "delete" },
  {
    key: "roles.assign-permissions",
    name: "Assign role permissions",
    module: "roles",
    action: "assign-permissions",
  },
  {
    key: "permissions.read",
    name: "View permission catalog",
    module: "permissions",
    action: "read",
  },
  { key: "audit.read", name: "View audit activity", module: "audit", action: "read" },
  { key: "company.manage", name: "Manage company (legacy)", module: "company", action: "manage" },
  { key: "users.manage", name: "Manage users (legacy)", module: "users", action: "manage" },
  { key: "roles.manage", name: "Manage roles (legacy)", module: "roles", action: "manage" },
] as const;

export const permissionKeys = permissionDefinitions.map((permission) => permission.key);

export function permissionAllows(granted: ReadonlySet<string>, required: string): boolean {
  if (granted.has(required)) return true;
  const [module] = required.split(".");
  return module ? granted.has(`${module}.manage`) : false;
}
