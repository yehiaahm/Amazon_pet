import { describe, it, expect } from 'vitest';
import {
  canOverridePriceWithoutApproval,
  hasRestrictedSalesScope,
  needsManagerApprovalForRefund,
} from '../salesAuth';
import { PERMISSIONS } from '../permissions';

describe('salesAuth restricted scope via employees.view', () => {
  it('treats users without employees.view as restricted', () => {
    const hasPermission = (code: string) => code === PERMISSIONS.SALES_CREATE;

    expect(hasRestrictedSalesScope(hasPermission)).toBe(true);
  });

  it('treats users with employees.view as unrestricted', () => {
    const hasPermission = (code: string) => code === PERMISSIONS.EMPLOYEES_VIEW;

    expect(hasRestrictedSalesScope(hasPermission)).toBe(false);
  });

  it('requires manager approval for refunds when scope is restricted', () => {
    const hasPermission = (code: string) =>
      code === PERMISSIONS.SALES_REFUND || code === PERMISSIONS.SALES_CREATE;

    expect(needsManagerApprovalForRefund(hasPermission)).toBe(true);
  });

  it('does not allow price override without approval for restricted users', () => {
    const hasPermission = (code: string) => code === PERMISSIONS.SALES_OVERRIDE_PRICE;

    expect(canOverridePriceWithoutApproval(hasPermission)).toBe(false);
  });

  it('allows price override without approval for unrestricted users', () => {
    const hasPermission = (code: string) =>
      code === PERMISSIONS.SALES_OVERRIDE_PRICE || code === PERMISSIONS.EMPLOYEES_VIEW;

    expect(canOverridePriceWithoutApproval(hasPermission)).toBe(true);
  });
});
