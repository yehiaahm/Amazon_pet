import { describe, it, expect } from 'vitest';
import { canAccessModuleWithPermissions, resolveFirstAccessibleModule } from '../navigationUtils';
import { PERMISSIONS } from '../permissions';

describe('protected route navigation', () => {
  it('cashier with sales only can access POS but not finance', () => {
    const permissions = [PERMISSIONS.SALES_CREATE, PERMISSIONS.SALES_OPEN_SHIFT];

    expect(canAccessModuleWithPermissions(permissions, 'pos')).toBe(true);
    expect(canAccessModuleWithPermissions(permissions, 'finance')).toBe(false);
    expect(canAccessModuleWithPermissions(permissions, 'employees')).toBe(false);
  });

  it('resolveFirstAccessibleModule skips unauthorized modules', () => {
    const permissions = [PERMISSIONS.CUSTOMERS_VIEW];
    const canAccess = (moduleId: string) => canAccessModuleWithPermissions(permissions, moduleId);

    expect(resolveFirstAccessibleModule(canAccess)).toBe('crm');
  });

  it('returns null when no modules are accessible', () => {
    const canAccess = () => false;
    expect(resolveFirstAccessibleModule(canAccess)).toBeNull();
  });
});
