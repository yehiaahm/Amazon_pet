import { create } from 'zustand';
import { POSSession } from '../../types/erp';
import { api } from '../api/endpoints';
import { useUIStore } from './uiStore';
import { reportClientError } from '../utils/errorReporting';

interface SessionState {
  activeSession: POSSession | null;
  sessions: POSSession[];
  loading: boolean;
  error: string | null;
  
  fetchSessions: () => Promise<void>;
  startSession: (openedById: string, openingBalance: number) => Promise<POSSession>;
  endSession: (sessionId: string, closingBalance: number, expected: number, actual: number, closedById: string) => Promise<POSSession>;
  clearError: () => void;
}

function notifySessionError(title: string, error: unknown) {
  const message = error instanceof Error ? error.message : 'فشلت عملية الوردية';
  reportClientError(error, { module: 'pos-session' });
  useUIStore.getState().addNotification('WARNINGS', title, message);
}

export const useSessionStore = create<SessionState>((set) => ({
  activeSession: null,
  sessions: [],
  loading: false,
  error: null,

  clearError: () => set({ error: null }),

  fetchSessions: async () => {
    set({ loading: true, error: null });
    try {
      const data = await api.getPOSSessions();
      const open = data.find(s => s.status === 'OPEN') || null;
      set({ sessions: data, activeSession: open, loading: false });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'تعذر تحميل الورديات';
      set({ loading: false, error: message });
      notifySessionError('خطأ في الوردية', e);
    }
  },

  startSession: async (openedById, openingBalance) => {
    set({ loading: true, error: null });
    try {
      const session = await api.openPOSSession(openedById, openingBalance);
      const updatedSessions = await api.getPOSSessions();
      set({ activeSession: session, sessions: updatedSessions, loading: false });
      return session;
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : 'فشل فتح الوردية' });
      notifySessionError('فشل فتح الوردية', e);
      throw e;
    }
  },

  endSession: async (sessionId, closingBalance, expected, actual, closedById) => {
    set({ loading: true, error: null });
    try {
      const session = await api.closePOSSession(sessionId, closingBalance, expected, actual, closedById);
      const updatedSessions = await api.getPOSSessions();
      set({ activeSession: null, sessions: updatedSessions, loading: false });
      return session;
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : 'فشل إغلاق الوردية' });
      notifySessionError('فشل إغلاق الوردية', e);
      throw e;
    }
  },
}));
