import React from 'react';
import { useUIStore } from '../core/stores/uiStore';
import { useFactoryReset } from '../core/hooks/useERPData';
import { useSessionStore } from '../core/stores/sessionStore';
import { 
  Menu, ChevronLeft, ChevronRight, Calendar,
  LayoutDashboard, ShoppingCart, Package, Users, 
  Scissors, DollarSign, BarChart3, Brain, 
  Dog, UserCheck, LogOut,
  Sun, Moon, FileText, RotateCcw, Shield, Gift
} from 'lucide-react';
import { usePermissions } from '../core/permissions/usePermissions';
import { PERMISSIONS } from '../core/permissions/permissions';
import Can from '../components/ui/Can';
import { logout } from '../core/auth/logout';
import { useIsTabletDown } from '../core/hooks/useMediaQuery';

interface ExecutiveLayoutProps {
  children: React.ReactNode;
}

export const ExecutiveLayout: React.FC<ExecutiveLayoutProps> = ({ children }) => {
  const sidebarCollapsed = useUIStore(s => s.sidebarCollapsed);
  const toggleSidebar = useUIStore(s => s.toggleSidebar);
  const activeModule = useUIStore(s => s.activeModule);
  const setActiveModule = useUIStore(s => s.setActiveModule);
  const theme = useUIStore(s => s.theme);
  const toggleTheme = useUIStore(s => s.toggleTheme);

  const isTabletDown = useIsTabletDown();
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const showSidebarLabels = isTabletDown ? true : !sidebarCollapsed;

  const handleHamburgerClick = () => {
    if (isTabletDown) {
      setMobileNavOpen(o => !o);
    } else {
      toggleSidebar();
    }
  };

  const handleNavItemClick = (moduleId: string) => {
    setActiveModule(moduleId);
    if (isTabletDown) setMobileNavOpen(false);
  };
  
  const currentEmployee = useUIStore(s => s.currentEmployee);
  const setAutoOpenCloseShiftModal = useUIStore(s => s.setAutoOpenCloseShiftModal);
  const setLogoutAfterCloseShift = useUIStore(s => s.setLogoutAfterCloseShift);

  const activeSession = useSessionStore(s => s.activeSession);
  const fetchSessions = useSessionStore(s => s.fetchSessions);
  const { canAccessModule, hasPermission } = usePermissions();

  React.useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const { mutate: performFactoryReset, isPending: resetting } = useFactoryReset();

  const handleSystemReset = () => {
    if (window.confirm('⚠ هل أنت تأكد من تصفير بيانات النظام بالكامل؟\nسيتم مسح كافة المبيعات والمنتجات والمخزون والعملاء لبدء اختبار جديد ونظيف 100%.')) {
      performFactoryReset();
    }
  };

  const menuGroups = [
    {
      title: 'لوحات التحكم',
      items: [
        { id: 'dashboard-executive', name: 'التقرير التنفيذي', icon: <LayoutDashboard size={18} /> },
        { id: 'dashboard-financial', name: 'التقرير المالي', icon: <DollarSign size={18} /> },
        { id: 'dashboard-inventory', name: 'تقرير المخزون والمنتجات', icon: <Package size={18} /> },
        { id: 'dashboard-operations', name: 'التقرير التشغيلي', icon: <BarChart3 size={18} /> },
        { id: 'loyalty-dashboard', name: 'لوحة تحكم الولاء', icon: <Gift size={18} /> }
      ]
    },
    {
      title: 'العمليات الأساسية',
      items: [
        { id: 'pos', name: 'نقاط البيع والمبيعات', icon: <ShoppingCart size={18} /> },
        { id: 'invoices', name: 'مراجعة الفواتير', icon: <FileText size={18} /> },
        { id: 'inventory', name: 'المنتجات والمخزون', icon: <Package size={18} /> },
        { id: 'crm', name: 'دليل العملاء', icon: <Users size={18} /> },
        { id: 'pets', name: 'دليل الحيوانات', icon: <Dog size={18} /> },
        { id: 'services', name: 'الخدمات والحجوزات', icon: <Scissors size={18} /> },
        { id: 'boarding', name: 'حجوزات الإقامة والتنبيهات', icon: <Calendar size={18} /> },
        { id: 'employees', name: 'إدارة المستخدمين والموظفين', icon: <Users size={18} /> },
        { id: 'roles', name: 'الأدوار والصلاحيات', icon: <Shield size={18} /> }
      ]
    },
    {
      title: 'الحسابات والذكاء الاصطناعي',
      items: [
        { id: 'finance', name: 'الدفتر المالي والمصاريف', icon: <DollarSign size={18} /> },
        { id: 'reports', name: 'التقارير المالية', icon: <BarChart3 size={18} /> },
        { id: 'ai', name: 'مستشار الذكاء الاصطناعي', icon: <Brain size={18} /> }
      ]
    }
  ];

  const filteredMenuGroups = menuGroups.map(group => {
    const items = group.items.filter(item => canAccessModule(item.id));
    return { ...group, items };
  }).filter(group => group.items.length > 0);

  return (
    <div className="erp-app">
      <header className="erp-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-3)', minWidth: 0 }}>
          <button onClick={handleHamburgerClick} className="btn-ghost" style={{ padding: '6px', border: 'none', flexShrink: 0 }}>
            <Menu size={18} />
          </button>
          <span style={{ fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
             نظام Amazon Pet
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)', flexShrink: 0 }}>
          <div>
            <button
              onClick={toggleTheme}
              className="btn-ghost"
              style={{ padding: '6px', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              title={theme === 'light' ? 'تفعيل الوضع الداكن (Dark Mode)' : 'تفعيل الوضع المضيء (Light Mode)'}
            >
              {theme === 'light' ? <Moon size={18} style={{ color: 'var(--color-text-secondary)' }} /> : <Sun size={18} style={{ color: 'var(--color-warning)' }} />}
            </button>
          </div>

          <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)', borderLeft: '1px solid var(--color-border)', paddingLeft: 'var(--spacing-3)', flexWrap: 'nowrap' }}>
            <Can permission={PERMISSIONS.SETTINGS_FACTORY_RESET}>
              <button
                onClick={handleSystemReset}
                disabled={resetting}
                className="btn-ghost hide-mobile"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  color: 'var(--color-warning)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '3px 8px',
                  cursor: 'pointer',
                  fontSize: 'var(--font-size-xs)',
                  fontWeight: 'bold',
                }}
                title="تصفير النظام بالكامل وبدء اختبار جديد بدون بيانات"
              >
                <RotateCcw size={13} />
                {resetting ? 'جاري التصفير...' : 'تصفير النظام'}
              </button>
            </Can>

            <div className="hide-mobile" style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)', fontSize: 'var(--font-size-xs)', fontWeight: 'bold', color: 'var(--color-text-primary)' }}>
              <UserCheck size={16} style={{ color: 'var(--color-text-secondary)' }} />
              <span>{currentEmployee?.fullName}</span>
            </div>

            <button
              onClick={() => {
                if (activeSession && hasPermission(PERMISSIONS.SALES_CLOSE_SHIFT)) {
                  alert(`⚠️ عذراً! لا يمكنك تسجيل الخروج والوردية/درج الكاشير مفتوح.\nيرجى إغلاق الوردية أولاً من شاشة نقاط البيع (POS).`);
                  setLogoutAfterCloseShift(true);
                  setAutoOpenCloseShiftModal(true);
                  setActiveModule('pos');
                  return;
                }
                logout();
              }}
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
                fontWeight: 'bold',
                whiteSpace: 'nowrap'
              }}
              title="تسجيل الخروج"
            >
              <LogOut size={14} />
              <span className="hide-mobile">تسجيل الخروج</span>
            </button>
          </div>
        </div>
      </header>

      {isTabletDown && mobileNavOpen && (
        <div className="erp-sidebar-backdrop visible" onClick={() => setMobileNavOpen(false)} />
      )}

      <aside className={`erp-sidebar ${sidebarCollapsed && !isTabletDown ? 'collapsed' : ''} ${isTabletDown && mobileNavOpen ? 'mobile-open' : ''}`}>
        <div style={{ flex: 1, padding: 'var(--spacing-2) 0' }}>
          {filteredMenuGroups.map((group, gIdx) => (
            <div key={group.title} style={{ marginBottom: 'var(--spacing-4)' }}>
              {gIdx > 0 && <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: 'var(--spacing-2) var(--spacing-4)' }} />}

              {showSidebarLabels && (
                <div style={{
                  fontSize: '10px',
                  fontWeight: 'var(--font-weight-semibold)',
                  textTransform: 'uppercase',
                  color: 'var(--color-text-secondary)',
                  padding: 'var(--spacing-1) var(--spacing-4)',
                  letterSpacing: '0.05em'
                }}>
                  {group.title}
                </div>
              )}

              {group.items.map(item => {
                const isActive = activeModule === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavItemClick(item.id)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: 'var(--spacing-2) var(--spacing-4)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--spacing-3)',
                      backgroundColor: isActive ? 'var(--color-primary-light)' : 'transparent',
                      color: isActive ? 'var(--color-primary)' : 'var(--color-text-primary)',
                      border: 'none',
                      borderRadius: 0,
                      cursor: 'pointer'
                    }}
                    title={!showSidebarLabels ? item.name : undefined}
                  >
                    <div style={{ display: 'flex', color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}>
                      {item.icon}
                    </div>
                    {showSidebarLabels && (
                      <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: isActive ? 'var(--font-weight-semibold)' : 'var(--font-weight-normal)' }}>
                        {item.name}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {!isTabletDown && (
          <div style={{ borderTop: '1px solid var(--color-border)', padding: 'var(--spacing-2)' }}>
            <button
              onClick={toggleSidebar}
              className="btn-ghost"
              style={{ width: '100%', border: 'none', display: 'flex', justifyContent: sidebarCollapsed ? 'center' : 'flex-end', padding: '4px' }}
            >
              {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>
          </div>
        )}
      </aside>

      <main className="erp-content">
        {children}
      </main>
    </div>
  );
};
export default ExecutiveLayout;
