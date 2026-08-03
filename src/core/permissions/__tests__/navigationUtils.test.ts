import { describe, it, expect } from 'vitest';
import {
  canAccessModuleWithPermissions,
  resolveFirstAccessibleModule,
} from '../navigationUtils';
import { PERMISSIONS } from '../permissions';

describe('canAccessModuleWithPermissions', () => {
  it('returns true when the user has the required permission', () => {
    expect(
      canAccessModuleWithPermissions([PERMISSIONS.DASHBOARD_VIEW], 'dashboard-executive')
    ).toBe(true);
  });

  it('returns false when the user lacks the required permission', () => {
    expect(canAccessModuleWithPermissions([], 'dashboard-executive')).toBe(false);
  });

  it('returns true for modules without permission mapping', () => {
    expect(canAccessModuleWithPermissions([], 'unknown-module')).toBe(true);
  });

  it('returns true when the user has any required permission from an array', () => {
    expect(canAccessModuleWithPermissions([PERMISSIONS.REPORTS_VIEW], 'reports')).toBe(true);
  });

  it('accepts a Set of permissions', () => {
    expect(
      canAccessModuleWithPermissions(
        new Set([PERMISSIONS.SALES_CREATE]),
        'pos'
      )
    ).toBe(true);
  });
});

describe('resolveFirstAccessibleModule', () => {
  it('returns the first accessible module in landing order', () => {
    const canAccessModule = (moduleId: string) => moduleId === 'pos';

    expect(resolveFirstAccessibleModule(canAccessModule)).toBe('pos');
  });

  it('returns null when no mapped modules are accessible', () => {
    expect(resolveFirstAccessibleModule(() => false)).toBeNull();
  });

  it('skips inaccessible modules and returns the next accessible one', () => {
    const canAccessModule = (moduleId: string) => moduleId === 'crm';

    expect(resolveFirstAccessibleModule(canAccessModule)).toBe('crm');
  });
});
