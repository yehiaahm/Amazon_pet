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
import { usePermissionStore } from '../core/permissions/permissionStore';
import { PERMISSIONS } from '../core/permissions/permissions';
import Can from '../components/ui/Can';

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
  
  const currentEmployee = useUIStore(s => s.currentEmployee);
  const setCurrentEmployee = useUIStore(s => s.setCurrentEmployee);
  const setAuthenticated = useUIStore(s => s.setAuthenticated);
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-3)' }}>
          <button onClick={toggleSidebar} className="btn-ghost" style={{ padding: '6px', border: 'none' }}>
            <Menu size={18} />
          </button>
          <span style={{ fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
             نظام Amazon Pet
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-4)' }}>
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

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-3)', borderLeft: '1px solid var(--color-border)', paddingLeft: 'var(--spacing-4)' }}>
            <Can permission={PERMISSIONS.SETTINGS_FACTORY_RESET}>
              <button
                onClick={handleSystemReset}
                disabled={resetting}
                className="btn-ghost"
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

            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)', fontSize: 'var(--font-size-xs)', fontWeight: 'bold', color: 'var(--color-text-primary)' }}>
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
                localStorage.removeItem('token');
                setCurrentEmployee(null);
                setAuthenticated(false);
                usePermissionStore.getState().clearPermissions();
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
                fontWeight: 'bold'
              }}
              title="تسجيل الخروج"
            >
              <LogOut size={14} />
              تسجيل الخروج
            </button>
          </div>
        </div>
      </header>

      <aside className={`erp-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div style={{ flex: 1, padding: 'var(--spacing-2) 0' }}>
          {filteredMenuGroups.map((group, gIdx) => (
            <div key={group.title} style={{ marginBottom: 'var(--spacing-4)' }}>
              {gIdx > 0 && <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: 'var(--spacing-2) var(--spacing-4)' }} />}
              
              {!sidebarCollapsed && (
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
                    onClick={() => setActiveModule(item.id)}
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
                    title={sidebarCollapsed ? item.name : undefined}
                  >
                    <div style={{ display: 'flex', color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}>
                      {item.icon}
                    </div>
                    {!sidebarCollapsed && (
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
        
        <div style={{ borderTop: '1px solid var(--color-border)', padding: 'var(--spacing-2)' }}>
          <button 
            onClick={toggleSidebar} 
            className="btn-ghost" 
            style={{ width: '100%', border: 'none', display: 'flex', justifyContent: sidebarCollapsed ? 'center' : 'flex-end', padding: '4px' }}
          >
            {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
      </aside>

      <main className="erp-content">
        {children}
      </main>
    </div>
  );
};
export default ExecutiveLayout;
