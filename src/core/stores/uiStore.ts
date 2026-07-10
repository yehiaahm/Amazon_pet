import { create } from 'zustand';
import { Employee } from '../../types/erp';

interface NotificationItem {
  id: string;
  category: 'ALERTS' | 'TASKS' | 'APPROVALS' | 'WARNINGS' | 'INVENTORY' | 'FINANCE' | 'AI';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}

interface UIState {
  sidebarCollapsed: boolean;
  activeModule: string; // 'dashboard-executive', 'dashboard-financial', 'dashboard-operations', 'dashboard-inventory', 'pos', 'inventory', 'purchasing', 'crm', 'pets', 'services', 'finance', 'reports', 'analytics', 'ai', 'employees', 'settings'
  currentEmployee: Employee | null;
  isAuthenticated: boolean;
  notifications: NotificationItem[];
  commandPaletteOpen: boolean;
  globalSearchQuery: string;
  theme: 'light' | 'dark';
  
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
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  activeModule: 'dashboard-executive',
  currentEmployee: null,
  isAuthenticated: false,
  commandPaletteOpen: false,
  globalSearchQuery: '',
  theme: 'light',
  notifications: [
    {
      id: 'nt-1',
      category: 'INVENTORY',
      title: 'Low Stock: Kitten Cat Food',
      message: 'Kitten Dry Cat Food is down to 4 bags (Limit: 15). Reorder recommended.',
      timestamp: '2 hours ago',
      read: false
    },
    {
      id: 'nt-2',
      category: 'WARNINGS',
      title: 'Expiry Date Approaching',
      message: '3 boxes of Bravecto Tablets expire in under 90 days (2026-09-30).',
      timestamp: '4 hours ago',
      read: false
    },
    {
      id: 'nt-3',
      category: 'AI',
      title: 'Grooming Promotion Suggestion',
      message: 'Tuesday grooming slots are 42% underutilized. Consider setting a promotional campaign.',
      timestamp: '1 day ago',
      read: true
    }
  ],

  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setActiveModule: (module) => set({ activeModule: module }),
  setCurrentEmployee: (employee) => set({ currentEmployee: employee }),
  setAuthenticated: (auth) => set({ isAuthenticated: auth }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setGlobalSearchQuery: (query) => set({ globalSearchQuery: query }),
  toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
  markNotificationRead: (id) => set((state) => ({
    notifications: state.notifications.map(n => n.id === id ? { ...n, read: true } : n)
  })),
  clearNotifications: () => set({ notifications: [] }),
  addNotification: (category, title, message) => set((state) => ({
    notifications: [
      {
        id: `nt-${Date.now()}`,
        category,
        title,
        message,
        timestamp: 'Just now',
        read: false
      },
      ...state.notifications
    ]
  }))
}));
