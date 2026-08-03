import { describe, it, expect, beforeEach } from 'vitest';
import { usePermissionStore } from '../permissionStore';
import { PERMISSIONS } from '../permissions';

describe('permissionStore', () => {
  beforeEach(() => {
    usePermissionStore.getState().clearPermissions();
  });

  describe('hasPermission', () => {
    it('returns true when the permission is granted', () => {
      usePermissionStore.getState().setPermissions([PERMISSIONS.SALES_CREATE]);

      expect(usePermissionStore.getState().hasPermission(PERMISSIONS.SALES_CREATE)).toBe(true);
    });

    it('returns false when the permission is not granted', () => {
      expect(usePermissionStore.getState().hasPermission(PERMISSIONS.SALES_CREATE)).toBe(false);
    });
  });

  describe('hasAnyPermission', () => {
    it('returns true when at least one permission matches', () => {
      usePermissionStore.getState().setPermissions([PERMISSIONS.CUSTOMERS_VIEW]);

      expect(
        usePermissionStore.getState().hasAnyPermission(
          PERMISSIONS.CUSTOMERS_VIEW,
          PERMISSIONS.PETS_VIEW
        )
      ).toBe(true);
    });

    it('returns false when none of the permissions match', () => {
      usePermissionStore.getState().setPermissions([PERMISSIONS.CUSTOMERS_VIEW]);

      expect(
        usePermissionStore.getState().hasAnyPermission(
          PERMISSIONS.PETS_VIEW,
          PERMISSIONS.ROLES_VIEW
        )
      ).toBe(false);
    });
  });
});
