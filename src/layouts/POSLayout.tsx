import React from 'react';
import { useUIStore } from '../core/stores/uiStore';
import { useSessionStore } from '../core/stores/sessionStore';
import { ArrowLeft, Landmark, User, Clock, Sun, Moon, Scissors, Calendar, LogOut } from 'lucide-react';
import Badge from '../components/ui/Badge';
import { formatMoney } from '../core/utils/money';
import { usePermissions } from '../core/permissions/usePermissions';
import { PERMISSIONS } from '../core/permissions/permissions';
import { logout } from '../core/auth/logout';

interface POSLayoutProps {
  children: React.ReactNode;
}

export const POSLayout: React.FC<POSLayoutProps> = ({ children }) => {
  const setActiveModule = useUIStore(s => s.setActiveModule);
  const currentEmployee = useUIStore(s => s.currentEmployee);
  const setAutoOpenCloseShiftModal = useUIStore(s => s.setAutoOpenCloseShiftModal);
  const setLogoutAfterCloseShift = useUIStore(s => s.setLogoutAfterCloseShift);
  const theme = useUIStore(s => s.theme);
  const toggleTheme = useUIStore(s => s.toggleTheme);
  const activeSession = useSessionStore(s => s.activeSession);
  const { canAccessModule, hasPermission } = usePermissions();

  const cashierQuickNav = [
    { id: 'services', label: 'مواعيد', icon: <Scissors size={14} /> },
    { id: 'boarding', label: 'إقامة', icon: <Calendar size={14} /> },
  ] as const;

  const visibleQuickNav = cashierQuickNav.filter((item) => canAccessModule(item.id));
  const canLeavePos = canAccessModule('dashboard-executive');

  const handleLogout = () => {
    if (activeSession && hasPermission(PERMISSIONS.SALES_CLOSE_SHIFT)) {
      alert(`⚠️ عذراً! لا يمكنك تسجيل الخروج والوردية/درج الكاشير مفتوح.\nيرجى إغلاق الوردية أولاً.`);
      setLogoutAfterCloseShift(true);
      setAutoOpenCloseShiftModal(true);
      return;
    }
    logout();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', width: '100%', overflow: 'hidden', backgroundColor: 'var(--color-bg)' }}>
      {/* POS Topbar */}
      <header style={{
        minHeight: '48px',
        backgroundColor: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        rowGap: '4px',
        padding: 'var(--spacing-1) var(--spacing-3)',
        zIndex: 100
      }}>
        {/* Left: Exit and Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)', flexWrap: 'wrap', minWidth: 0 }}>
          {canLeavePos && (
            <>
              <button
                onClick={() => setActiveModule('dashboard-executive')}
                className="btn-ghost"
                style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)', border: 'none', fontWeight: 'var(--font-weight-semibold)', whiteSpace: 'nowrap' }}
              >
                <ArrowLeft size={16} />
                <span className="hide-mobile">الخروج من شاشة المبيعات</span>
              </button>
              <span className="hide-mobile" style={{ height: '16px', width: '1px', backgroundColor: 'var(--color-border)' }} />
            </>
          )}
          <span className="hide-mobile" style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-primary)', whiteSpace: 'nowrap' }}>
            شاشة الكاشير ونقاط البيع (POS)
          </span>
          {visibleQuickNav.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              {visibleQuickNav.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveModule(item.id)}
                  className="btn-secondary"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 8px',
                    fontSize: '11px',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                  title={item.label}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Center: Shift & Session Status */}
        {activeSession ? (
          <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-3)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', flexWrap: 'wrap' }}>
            <div className="hide-mobile" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Clock size={14} />
              <span>بدء الوردية: {new Date(activeSession.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div className="hide-mobile" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Landmark size={14} />
              <span>عهدة الدرج: <strong>{formatMoney(activeSession.openingBalance)}</strong></span>
            </div>
            <Badge variant="success">الوردية مفتوحة</Badge>
          </div>
        ) : (
          <Badge variant="danger">الوردية مغلقة</Badge>
        )}

        {/* Right: Cashier Identity & Theme Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)', flexWrap: 'wrap' }}>
          <button
            onClick={toggleTheme}
            className="btn-ghost"
            style={{ padding: '6px', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            title={theme === 'light' ? 'تفعيل الوضع الداكن (Dark Mode)' : 'تفعيل الوضع المضيء (Light Mode)'}
          >
            {theme === 'light' ? <Moon size={16} style={{ color: 'var(--color-text-secondary)' }} /> : <Sun size={16} style={{ color: 'var(--color-warning)' }} />}
          </button>

          <span className="hide-mobile" style={{ height: '16px', width: '1px', backgroundColor: 'var(--color-border)' }} />

          <div className="hide-mobile" style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)' }}>
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
              fontWeight: 'bold',
              flexShrink: 0
            }}>
              <User size={12} />
            </div>
            <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-text-primary)' }}>
              {currentEmployee?.fullName}
            </span>
          </div>

          <span className="hide-mobile" style={{ height: '16px', width: '1px', backgroundColor: 'var(--color-border)' }} />

          <button
            onClick={handleLogout}
            className="btn-ghost"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              color: 'var(--color-danger)',
              border: 'none',
              padding: '4px 8px',
              cursor: 'pointer',
              fontSize: 'var(--font-size-xs)',
              fontWeight: 'bold'
            }}
            title="تسجيل الخروج"
          >
            <LogOut size={14} />
            <span className="hide-mobile">تسجيل الخروج</span>
          </button>
        </div>
      </header>

      {/* POS Screen area (No sidebar) */}
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {children}
      </main>
    </div>
  );
};

export default POSLayout;
