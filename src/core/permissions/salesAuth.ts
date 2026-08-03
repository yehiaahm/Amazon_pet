import { PERMISSIONS } from './permissions';

/**
 * Mirrors backend cashier sales scoping without role checks.
 * Cashiers lack employees.view; managers/owners have it.
 */
export function hasRestrictedSalesScope(
  hasPermission: (code: string) => boolean
): boolean {
  return !hasPermission(PERMISSIONS.EMPLOYEES_VIEW);
}

export function needsManagerApprovalForRefund(
  hasPermission: (code: string) => boolean
): boolean {
  return (
    hasPermission(PERMISSIONS.SALES_REFUND) &&
    hasRestrictedSalesScope(hasPermission)
  );
}

export function canOverridePriceWithoutApproval(
  hasPermission: (code: string) => boolean
): boolean {
  return (
    hasPermission(PERMISSIONS.SALES_OVERRIDE_PRICE) &&
    !hasRestrictedSalesScope(hasPermission)
  );
}
