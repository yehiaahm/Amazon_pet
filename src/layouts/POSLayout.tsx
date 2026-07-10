import React from 'react';
import { useUIStore } from '../core/stores/uiStore';
import { useSessionStore } from '../core/stores/sessionStore';
import { ArrowLeft, Landmark, User, Clock } from 'lucide-react';
import Badge from '../components/ui/Badge';

interface POSLayoutProps {
  children: React.ReactNode;
}

export const POSLayout: React.FC<POSLayoutProps> = ({ children }) => {
  const setActiveModule = useUIStore(s => s.setActiveModule);
  const currentEmployee = useUIStore(s => s.currentEmployee);
  const activeSession = useSessionStore(s => s.activeSession);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden', backgroundColor: 'var(--color-bg)' }}>
      {/* POS Topbar */}
      <header style={{
        height: '48px',
        backgroundColor: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 var(--spacing-4)',
        zIndex: 100
      }}>
        {/* Left: Exit and Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-3)' }}>
          {currentEmployee?.role === 'OWNER' && (
            <>
              <button 
                onClick={() => setActiveModule('dashboard-executive')}
                className="btn-ghost"
                style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)', border: 'none', fontWeight: 'var(--font-weight-semibold)' }}
              >
                <ArrowLeft size={16} /> الخروج من شاشة المبيعات
              </button>
              <span style={{ height: '16px', width: '1px', backgroundColor: 'var(--color-border)' }} />
            </>
          )}
          <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-primary)' }}>
            شاشة الكاشير ونقاط البيع (POS)
          </span>
        </div>

        {/* Center: Shift & Session Status */}
        {activeSession ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-4)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Clock size={14} />
              <span>بدء الوردية: {new Date(activeSession.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Landmark size={14} />
              <span>عهدة الدرج: <strong>${activeSession.openingBalance.toFixed(2)}</strong></span>
            </div>
            <Badge variant="success">الوردية مفتوحة</Badge>
          </div>
        ) : (
          <Badge variant="danger">الوردية مغلقة</Badge>
        )}

        {/* Right: Cashier Identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)' }}>
          <div style={{
            width: '24px',
            height: '24px',
            borderRadius: 'var(--radius-full)',
            backgroundColor: 'var(--color-primary-light)',
            color: 'var(--color-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '10px',
            fontWeight: 'bold'
          }}>
            <User size={12} />
          </div>
          <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-text-primary)' }}>
            {currentEmployee?.fullName}
          </span>
        </div>
      </header>

      {/* POS Screen area (No sidebar) */}
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {children}
      </main>
    </div>
  );
};

export default POSLayout;
