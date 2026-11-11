export const ROLES = ["owner", "admin", "approver", "operator", "developer", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "obligation:read",
  "obligation:create",
  "obligation:submit",
  "obligation:cancel",
  "obligation:approve",
  "obligation:reject",
  "payment:execute",
  "payment:reconcile",
  "incident:resolve",
  "receipt:read",
  "connection:read",
  "connection:manage",
  "member:manage",
  "policy:manage",
  "apikey:manage",
  "webhook:manage",
  "audit:read",
  "billing:manage",
  "report:read",
  "support:create",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const READ: Permission[] = [
  "obligation:read",
  "receipt:read",
  "connection:read",
  "audit:read",
  "report:read",
  "support:create",
];
const OPERATE: Permission[] = [
  ...READ,
  "obligation:create",
  "obligation:submit",
  "obligation:cancel",
  "payment:execute",
  "payment:reconcile",
  "incident:resolve",
];

/** Fail-closed role table. Anything not listed is denied. Separation of duties: operators cannot approve. */
const MATRIX: Record<Role, readonly Permission[]> = {
  owner: PERMISSIONS,
  admin: PERMISSIONS,
  approver: [...READ, "obligation:approve", "obligation:reject"],
  operator: OPERATE,
  developer: [...READ, "obligation:create", "obligation:submit", "apikey:manage", "webhook:manage"],
  viewer: READ,
};

export function hasPermission(role: string | undefined | null, perm: Permission): boolean {
  if (!role) return false;
  const p = MATRIX[role as Role];
  return !!p && p.includes(perm);
}
export function permissionsFor(role: string): readonly Permission[] {
  return MATRIX[role as Role] ?? [];
}
/** Roles that may sign approvals. */
export const APPROVER_ROLES: readonly Role[] = ["owner", "admin", "approver"];
