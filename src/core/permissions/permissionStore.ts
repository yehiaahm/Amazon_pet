import { create } from 'zustand';
import { PermissionCode } from './permissions';

interface PermissionState {
  permissions: Set<string>;
  setPermissions: (codes: string[]) => void;
  clearPermissions: () => void;
  hasPermission: (code: PermissionCode | string) => boolean;
  hasAnyPermission: (...codes: (PermissionCode | string)[]) => boolean;
  hasAllPermissions: (...codes: (PermissionCode | string)[]) => boolean;
}

export const usePermissionStore = create<PermissionState>((set, get) => ({
  permissions: new Set<string>(),

  setPermissions: (codes) => set({ permissions: new Set(codes) }),

  clearPermissions: () => set({ permissions: new Set() }),

  hasPermission: (code) => get().permissions.has(code),

  hasAnyPermission: (...codes) => codes.some((c) => get().permissions.has(c)),

  hasAllPermissions: (...codes) => codes.every((c) => get().permissions.has(c)),
}));
