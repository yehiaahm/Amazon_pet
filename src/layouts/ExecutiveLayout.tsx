import React, { useState } from 'react';
import { useUIStore } from '../core/stores/uiStore';
import { 
  Menu, Bell, Globe, ChevronLeft, ChevronRight,
  LayoutDashboard, ShoppingCart, Package, Truck, Users, 
  Scissors, DollarSign, BarChart3, LineChart, Brain, 
  UserSquare2, Settings, Dog, UserCheck, LogOut
} from 'lucide-react';
import Drawer from '../components/ui/Drawer';
import Badge from '../components/ui/Badge';

interface ExecutiveLayoutProps {
  children: React.ReactNode;
}

export const ExecutiveLayout: React.FC<ExecutiveLayoutProps> = ({ children }) => {
  const sidebarCollapsed = useUIStore(s => s.sidebarCollapsed);
  const toggleSidebar = useUIStore(s => s.toggleSidebar);
  const activeModule = useUIStore(s => s.activeModule);
  const setActiveModule = useUIStore(s => s.setActiveModule);
  
  const currentEmployee = useUIStore(s => s.currentEmployee);
  const setCurrentEmployee = useUIStore(s => s.setCurrentEmployee);
  const setAuthenticated = useUIStore(s => s.setAuthenticated);
  
  const notifications = useUIStore(s => s.notifications);
  const markNotificationRead = useUIStore(s => s.markNotificationRead);
  const clearNotifications = useUIStore(s => s.clearNotifications);

  const [notifOpen, setNotifOpen] = useState(false);
  const [activeNotifTab, setActiveNotifTab] = useState<'ALL' | 'ALERTS' | 'INVENTORY' | 'AI' | 'FINANCE'>('ALL');
  
  const employeesList = [
    { id: 'e-1', username: 'owner_yahia', fullName: 'يحيى (المالك)', email: 'owner@animasys.com', role: 'OWNER', branchId: 'b-1', active: true },
    { id: 'e-2', username: 'cashier_alice', fullName: 'أليس (الكاشير)', email: 'alice@animasys.com', role: 'CASHIER', branchId: 'b-1', active: true },
    { id: 'e-3', username: 'groomer_bob', fullName: 'بوب (الحلاق)', email: 'bob@animasys.com', role: 'GROOMER', branchId: 'b-1', active: true }
  ];

  // Sidebar navigation configuration
  const menuGroups = [
    {
      title: 'لوحات التحكم',
      items: [
        { id: 'dashboard-executive', name: 'التقرير التنفيذي', icon: <LayoutDashboard size={18} /> },
        { id: 'dashboard-financial', name: 'التقرير المالي', icon: <DollarSign size={18} /> },
        { id: 'dashboard-inventory', name: 'تقرير المخازن', icon: <Package size={18} /> },
        { id: 'dashboard-operations', name: 'التقرير التشغيلي', icon: <BarChart3 size={18} /> }
      ]
    },
    {
      title: 'العمليات الأساسية',
      items: [
        { id: 'pos', name: 'نقاط البيع والمبيعات', icon: <ShoppingCart size={18} /> },
        { id: 'inventory', name: 'المخازن والمخزون', icon: <Package size={18} /> },
        { id: 'purchasing', name: 'المشتريات والشحنات', icon: <Truck size={18} /> },
        { id: 'crm', name: 'دليل العملاء', icon: <Users size={18} /> },
        { id: 'pets', name: 'دليل الحيوانات', icon: <Dog size={18} /> },
        { id: 'services', name: 'الخدمات والحجوزات', icon: <Scissors size={18} /> }
      ]
    },
    {
      title: 'الحسابات والذكاء الاصطناعي',
      items: [
        { id: 'finance', name: 'الدفتر المالي والمصاريف', icon: <DollarSign size={18} /> },
        { id: 'reports', name: 'التقارير المالية', icon: <BarChart3 size={18} /> },
        { id: 'analytics', name: 'محرك الأرقام والمؤشرات', icon: <LineChart size={18} /> },
        { id: 'ai', name: 'مستشار الذكاء الاصطناعي', icon: <Brain size={18} /> }
      ]
    },
    {
      title: 'تهيئة النظام',
      items: [
        { id: 'employees', name: 'دليل الموظفين', icon: <UserSquare2 size={18} /> },
        { id: 'settings', name: 'إعدادات النظام', icon: <Settings size={18} /> }
      ]
    }
  ];

  // Filter menuGroups based on the currentEmployee role
  const filteredMenuGroups = menuGroups.map(group => {
    const items = group.items.filter(item => {
      if (!currentEmployee) return false;
      if (currentEmployee.role === 'OWNER') return true;
      if (currentEmployee.role === 'CASHIER') {
        return ['pos', 'crm', 'pets'].includes(item.id);
      }
      if (currentEmployee.role === 'GROOMER') {
        return ['services', 'pets'].includes(item.id);
      }
      return false;
    });
    return { ...group, items };
  }).filter(group => group.items.length > 0);

  // Filtering notifications by category tab
  const filteredNotifs = notifications.filter(n => {
    if (activeNotifTab === 'ALL') return true;
    return n.category === activeNotifTab;
  });

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="erp-app">
      {/* 1. TOP BAR */}
      <header className="erp-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-3)' }}>
          <button onClick={toggleSidebar} className="btn-ghost" style={{ padding: '6px', border: 'none' }}>
            <Menu size={18} />
          </button>
          <span style={{ fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
             نظام أنيماسيس ERP
          </span>
          <Badge variant="gray" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Globe size={12} /> فرع وسط المدينة
          </Badge>
        </div>

        {/* Global Search & User Settings */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-4)' }}>
          {/* Notification icon */}
          <div style={{ position: 'relative' }}>
            <button 
              onClick={() => setNotifOpen(true)} 
              className="btn-ghost" 
              style={{ padding: '6px', border: 'none', position: 'relative' }}
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span style={{
                  position: 'absolute',
                  top: '2px',
                  right: '2px',
                  width: '8px',
                  height: '8px',
                  backgroundColor: 'var(--color-danger)',
                  borderRadius: 'var(--radius-full)'
                }} />
              )}
            </button>
          </div>

          {/* User selector & Logout */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-3)', borderLeft: '1px solid var(--color-border)', paddingLeft: 'var(--spacing-4)' }}>
            {currentEmployee?.role === 'OWNER' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)' }}>
                <UserCheck size={16} style={{ color: 'var(--color-text-secondary)' }} />
                <select
                  value={currentEmployee.id}
                  onChange={(e) => {
                    const emp = employeesList.find(emp => emp.id === e.target.value);
                    if (emp) setCurrentEmployee(emp);
                  }}
                  style={{ width: 'auto', border: 'none', padding: '2px var(--spacing-2)', backgroundColor: 'transparent', fontWeight: 'var(--font-weight-medium)', cursor: 'pointer' }}
                >
                  {employeesList.map(e => (
                    <option key={e.id} value={e.id}>{e.fullName}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)', fontSize: 'var(--font-size-xs)', fontWeight: 'bold', color: 'var(--color-text-primary)' }}>
                <UserCheck size={16} style={{ color: 'var(--color-text-secondary)' }} />
                <span>{currentEmployee?.fullName}</span>
              </div>
            )}

            <button
              onClick={() => {
                setCurrentEmployee(null);
                setAuthenticated(false);
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

      {/* 2. COLLAPSIBLE SIDEBAR */}
      <aside className={`erp-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div style={{ flex: 1, padding: 'var(--spacing-2) 0' }}>
          {filteredMenuGroups.map((group, gIdx) => (
            <div key={group.title} style={{ marginBottom: 'var(--spacing-4)' }}>
              {/* Divider lines between groups */}
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
        
        {/* Toggle Collapse Trigger */}
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

      {/* 3. CONTENT AREA */}
      <main className="erp-content">
        {children}
      </main>

      {/* 4. NOTIFICATION CENTER DRAWER */}
      <Drawer isOpen={notifOpen} onClose={() => setNotifOpen(false)} title="System Alerts & Notifications">
        {/* Drawer Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', marginBottom: 'var(--spacing-3)', gap: 'var(--spacing-2)', overflowX: 'auto', paddingBottom: '4px' }}>
          {(['ALL', 'ALERTS', 'INVENTORY', 'FINANCE', 'AI'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveNotifTab(tab)}
              className="btn-ghost"
              style={{
                fontSize: '11px',
                padding: '4px 8px',
                borderBottom: activeNotifTab === tab ? '2px solid var(--color-primary)' : 'none',
                color: activeNotifTab === tab ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                fontWeight: activeNotifTab === tab ? 'bold' : 'normal'
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Action controls */}
        {notifications.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--spacing-2)' }}>
            <button 
              onClick={clearNotifications} 
              className="btn-ghost" 
              style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-danger)', border: 'none', padding: 0 }}
            >
              Clear All
            </button>
          </div>
        )}

        {/* Notifications list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2)', flex: 1 }}>
          {filteredNotifs.length === 0 ? (
            <div style={{ padding: 'var(--spacing-8)', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)' }}>
              No notifications in this category.
            </div>
          ) : (
            filteredNotifs.map(n => (
              <div 
                key={n.id} 
                onClick={() => markNotificationRead(n.id)}
                style={{
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--spacing-3)',
                  backgroundColor: n.read ? 'var(--color-surface)' : 'var(--color-primary-light)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Badge variant={
                    n.category === 'AI' ? 'info' : 
                    n.category === 'ALERTS' ? 'danger' : 
                    n.category === 'INVENTORY' ? 'warning' : 'gray'
                  }>
                    {n.category}
                  </Badge>
                  <span style={{ fontSize: '10px', color: 'var(--color-text-secondary)' }}>{n.timestamp}</span>
                </div>
                <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-primary)' }}>
                  {n.title}
                </div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                  {n.message}
                </div>
              </div>
            ))
          )}
        </div>
      </Drawer>
    </div>
  );
};
export default ExecutiveLayout;
