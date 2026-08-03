import { create } from 'zustand';
import { Employee } from '../../types/erp';

export interface NotificationItem {
  id: string;
  category: 'ALERTS' | 'TASKS' | 'APPROVALS' | 'WARNINGS' | 'INVENTORY' | 'FINANCE' | 'AI';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}

export interface ToastItem {
  id: string;
  category: NotificationItem['category'];
  title: string;
  message: string;
}

interface UIState {
  sidebarCollapsed: boolean;
  activeModule: string;
  currentEmployee: Employee | null;
  isAuthenticated: boolean;
  notifications: NotificationItem[];
  toasts: ToastItem[];
  commandPaletteOpen: boolean;
  globalSearchQuery: string;
  theme: 'light' | 'dark';
  autoOpenCloseShiftModal: boolean;
  logoutAfterCloseShift: boolean;

  toggleSidebar: () => void;
  setActiveModule: (module: string) => void;
  setCurrentEmployee: (employee: Employee | null) => void;
  setAuthenticated: (auth: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setGlobalSearchQuery: (query: string) => void;
  toggleTheme: () => void;
  markNotificationRead: (id: string) => void;
  clearNotifications: () => void;
  addNotification: (category: NotificationItem['category'], title: string, message: string) => void;
  dismissToast: (id: string) => void;
  setAutoOpenCloseShiftModal: (open: boolean) => void;
  setLogoutAfterCloseShift: (val: boolean) => void;
}

function newId(): string {
  return `n-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  activeModule: 'dashboard-executive',
  currentEmployee: null,
  isAuthenticated: false,
  commandPaletteOpen: false,
  globalSearchQuery: '',
  theme: 'light',
  notifications: [],
  toasts: [],
  autoOpenCloseShiftModal: false,
  logoutAfterCloseShift: false,

  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setActiveModule: (module) => set({ activeModule: module }),
  setCurrentEmployee: (employee) => set({ currentEmployee: employee }),
  setAuthenticated: (auth) => set({ isAuthenticated: auth }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setGlobalSearchQuery: (query) => set({ globalSearchQuery: query }),
  toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),

  markNotificationRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      ),
    })),

  clearNotifications: () => set({ notifications: [] }),

  addNotification: (category, title, message) => {
    const id = newId();
    const item: NotificationItem = {
      id,
      category,
      title,
      message,
      timestamp: new Date().toISOString(),
      read: false,
    };
    const toast: ToastItem = { id, category, title, message };
    set((state) => ({
      notifications: [item, ...state.notifications].slice(0, 100),
      toasts: [...state.toasts, toast].slice(-6),
    }));
  },

  dismissToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),

  setAutoOpenCloseShiftModal: (open) => set({ autoOpenCloseShiftModal: open }),
  setLogoutAfterCloseShift: (val) => set({ logoutAfterCloseShift: val }),
}));
