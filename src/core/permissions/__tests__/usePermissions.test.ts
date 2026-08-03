import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePermissions } from '../usePermissions';
import { usePermissionStore } from '../permissionStore';
import { PERMISSIONS } from '../permissions';

describe('usePermissions', () => {
  beforeEach(() => {
    usePermissionStore.getState().clearPermissions();
  });

  it('canAccessModule returns true when any required permission is granted', () => {
    usePermissionStore.getState().setPermissions([PERMISSIONS.SALES_CREATE]);

    const { result } = renderHook(() => usePermissions());

    expect(result.current.canAccessModule('pos')).toBe(true);
    expect(result.current.canAccessModule('inventory')).toBe(false);
  });

  it('resolveDefaultModule picks first accessible module', () => {
    usePermissionStore.getState().setPermissions([PERMISSIONS.INVENTORY_VIEW]);

    const { result } = renderHook(() => usePermissions());

    expect(result.current.resolveDefaultModule()).toBe('inventory');
  });

  it('hasPermission reflects store state', () => {
    usePermissionStore.getState().setPermissions([PERMISSIONS.CUSTOMERS_VIEW]);

    const { result } = renderHook(() => usePermissions());

    expect(result.current.hasPermission(PERMISSIONS.CUSTOMERS_VIEW)).toBe(true);
    expect(result.current.hasPermission(PERMISSIONS.CUSTOMERS_DELETE)).toBe(false);
  });
});
