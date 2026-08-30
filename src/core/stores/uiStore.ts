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

// Dashboard KPI drill-down: the KPI card sets one of these before switching
// activeModule, and the destination page consumes + clears it on mount so the
// same date range/context used for the KPI number carries over.
export type ReportsDrilldownTab = 'SALES' | 'PURCHASES' | 'EXPENSES' | 'PL';
export type ReportsDrilldownPreset = 'TODAY' | 'THIS_MONTH';
export interface ReportsDrilldownFilter {
  tab: ReportsDrilldownTab;
  preset: ReportsDrilldownPreset;
}
export type InventoryDrilldownTab = 'STOCK' | 'FIFO';

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
  pendingReportsFilter: ReportsDrilldownFilter | null;
  pendingInventoryTab: InventoryDrilldownTab | null;

  toggleSidebar: () => void;
  setActiveModule: (module: string) => void;
  setPendingReportsFilter: (filter: ReportsDrilldownFilter | null) => void;
  setPendingInventoryTab: (tab: InventoryDrilldownTab | null) => void;
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
  pendingReportsFilter: null,
  pendingInventoryTab: null,

  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setActiveModule: (module) => set({ activeModule: module }),
  setPendingReportsFilter: (filter) => set({ pendingReportsFilter: filter }),
  setPendingInventoryTab: (tab) => set({ pendingInventoryTab: tab }),
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
