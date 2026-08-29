import { queryClient } from '../api/queryClient';
import { useUIStore } from '../stores/uiStore';
import { useSessionStore } from '../stores/sessionStore';
import { useCartStore } from '../stores/cartStore';
import { usePermissionStore } from '../permissions/permissionStore';

/**
 * Single source of truth for ending a session. Every piece of per-account
 * state (auth token, permissions, POS session/shift, in-progress cart, and
 * the React Query cache) must be dropped here - otherwise the next account
 * to log in in the same tab can inherit stale data or a stale failed-fetch
 * result cached under the previous account's successful response.
 */
export function logout(): void {
  localStorage.removeItem('token');
  usePermissionStore.getState().clearPermissions();
  useSessionStore.getState().reset();
  useCartStore.getState().clearCart();
  queryClient.clear();
  useUIStore.getState().setCurrentEmployee(null);
  useUIStore.getState().setAuthenticated(false);
}
