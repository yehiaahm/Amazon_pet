import { api } from '../api/endpoints';
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
  const token = localStorage.getItem('token');

  localStorage.removeItem('token');
  usePermissionStore.getState().clearPermissions();
  useSessionStore.getState().reset();
  useCartStore.getState().clearCart();
  queryClient.clear();
  useUIStore.getState().setCurrentEmployee(null);
  useUIStore.getState().setAuthenticated(false);

  // Dropping our copy of the token does not stop it working: it stays valid for the rest of
  // its 24h life, which matters on a shop terminal that staff hand around. Ask the server to
  // revoke it too. Fire-and-forget on purpose — signing out must not wait on, or be blocked
  // by, the network, so this stays an async best effort after the local state is already gone.
  if (token) {
    void api.revokeMyTokens(token).catch(() => {
      // Offline till or a restarting backend: the token still expires on its own.
    });
  }
}
