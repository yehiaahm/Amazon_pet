import { create } from 'zustand';
import { POSSession } from '../../types/erp';
import { api } from '../api/endpoints';

interface SessionState {
  activeSession: POSSession | null;
  sessions: POSSession[];
  loading: boolean;
  
  fetchSessions: () => Promise<void>;
  startSession: (openedById: string, openingBalance: number) => Promise<POSSession>;
  endSession: (sessionId: string, closingBalance: number, expected: number, actual: number, closedById: string) => Promise<POSSession>;
}

export const useSessionStore = create<SessionState>((set) => ({
  activeSession: null,
  sessions: [],
  loading: false,

  fetchSessions: async () => {
    set({ loading: true });
    try {
      const data = await api.getPOSSessions();
      const open = data.find(s => s.status === 'OPEN') || null;
      set({ sessions: data, activeSession: open, loading: false });
    } catch (e) {
      set({ loading: false });
    }
  },

  startSession: async (openedById, openingBalance) => {
    set({ loading: true });
    const session = await api.openPOSSession(openedById, openingBalance);
    const updatedSessions = await api.getPOSSessions();
    set({ activeSession: session, sessions: updatedSessions, loading: false });
    return session;
  },

  endSession: async (sessionId, closingBalance, expected, actual, closedById) => {
    set({ loading: true });
    const session = await api.closePOSSession(sessionId, closingBalance, expected, actual, closedById);
    const updatedSessions = await api.getPOSSessions();
    set({ activeSession: null, sessions: updatedSessions, loading: false });
    return session;
  }
}));
