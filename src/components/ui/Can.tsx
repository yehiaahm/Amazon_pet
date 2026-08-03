import React from 'react';
import { usePermissions } from '../../core/permissions/usePermissions';
import { PermissionCode } from '../../core/permissions/permissions';

interface CanProps {
  permission?: PermissionCode | string;
  anyOf?: (PermissionCode | string)[];
  allOf?: (PermissionCode | string)[];
  module?: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Conditionally renders children when the current user has the required permission(s).
 */
export const Can: React.FC<CanProps> = ({
  permission,
  anyOf,
  allOf,
  module,
  children,
  fallback = null,
}) => {
  const { hasPermission, hasAnyPermission, hasAllPermissions, canAccessModule } = usePermissions();

  let allowed = true;
  if (module) {
    allowed = canAccessModule(module);
  } else if (permission) {
    allowed = hasPermission(permission);
  } else if (anyOf && anyOf.length > 0) {
    allowed = hasAnyPermission(...anyOf);
  } else if (allOf && allOf.length > 0) {
    allowed = hasAllPermissions(...allOf);
  }

  return allowed ? <>{children}</> : <>{fallback}</>;
};

export default Can;
