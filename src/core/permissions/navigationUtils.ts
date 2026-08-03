import { MODULE_PERMISSIONS } from './permissions';

/** Preferred landing order after login or access denial. */
export const MODULE_LANDING_ORDER: string[] = [
  'dashboard-executive',
  'pos',
  'services',
  'inventory',
  'crm',
  'finance',
  'boarding',
  'pets',
  'invoices',
  'reports',
  'ai',
  'employees',
  'roles',
  'dashboard-financial',
  'dashboard-inventory',
  'dashboard-operations',
];

export function canAccessModuleWithPermissions(
  permissions: string[] | Set<string>,
  moduleId: string
): boolean {
  const set = permissions instanceof Set ? permissions : new Set(permissions);
  const required = MODULE_PERMISSIONS[moduleId];
  if (!required) return true;
  if (Array.isArray(required)) {
    return required.some((code) => set.has(code));
  }
  return set.has(required);
}

export function resolveFirstAccessibleModule(
  canAccessModule: (moduleId: string) => boolean
): string | null {
  for (const moduleId of MODULE_LANDING_ORDER) {
    if (MODULE_PERMISSIONS[moduleId] && canAccessModule(moduleId)) {
      return moduleId;
    }
  }
  return null;
}
