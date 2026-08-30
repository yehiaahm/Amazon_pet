import { usePermissionStore } from './permissionStore';
import { MODULE_PERMISSIONS, PermissionCode } from './permissions';
import { resolveFirstAccessibleModule } from './navigationUtils';

export function usePermissions() {
  const permissions = usePermissionStore((s) => s.permissions);
  const hasPermission = usePermissionStore((s) => s.hasPermission);
  const hasAnyPermission = usePermissionStore((s) => s.hasAnyPermission);
  const hasAllPermissions = usePermissionStore((s) => s.hasAllPermissions);

  const canAccessModule = (moduleId: string): boolean => {
    const required = MODULE_PERMISSIONS[moduleId];
    if (!required) return true;
    if (Array.isArray(required)) {
      return hasAnyPermission(...required);
    }
    return hasPermission(required);
  };

  const resolveDefaultModule = (): string | null =>
    resolveFirstAccessibleModule(canAccessModule);

  return {
    permissions,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    canAccessModule,
    resolveDefaultModule,
  };
}

export function checkPermission(
  userPermissions: Set<string> | string[],
  code: PermissionCode | string
): boolean {
  const set = userPermissions instanceof Set ? userPermissions : new Set(userPermissions);
  return set.has(code);
}
