import React from 'react';
import { useUIStore } from './core/stores/uiStore';
import ExecutiveLayout from './layouts/ExecutiveLayout';
import POSLayout from './layouts/POSLayout';
import CommandPalette from './components/ui/CommandPalette';
import ToastContainer from './components/ui/ToastContainer';
import Login from './components/ui/Login';

// Workspace Modules
import Dashboard from './modules/dashboard/Dashboard';
import POS from './modules/pos/POS';
import Inventory from './modules/inventory/Inventory';
import Finance from './modules/finance/Finance';
import Services from './modules/services/Services';
import CRM from './modules/crm/CRM';
import Pets from './modules/pets/Pets';
import AIAdvisor from './modules/ai/AIAdvisor';
import InvoiceReview from './modules/invoices/InvoiceReview';
import Boarding from './modules/boarding/Boarding';
import Reports from './modules/reports/Reports';
import Employees from './modules/employees/Employees';
import RolesPermissions from './modules/roles/RolesPermissions';
import { usePermissions } from './core/permissions/usePermissions';
import { useMyPermissions } from './core/hooks/useERPData';
import AccessDenied from './components/ui/AccessDenied';
import { ErrorBoundary } from './components/ui/ErrorBoundary';

function withModuleBoundary(name: string, node: React.ReactNode) {
  return <ErrorBoundary moduleName={name}>{node}</ErrorBoundary>;
}

export const App: React.FC = () => {
  const activeModule = useUIStore(s => s.activeModule);
  const setActiveModule = useUIStore(s => s.setActiveModule);
  const isAuthenticated = useUIStore(s => s.isAuthenticated);
  const theme = useUIStore(s => s.theme);
  const { canAccessModule, resolveDefaultModule } = usePermissions();
  useMyPermissions();

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  React.useEffect(() => {
    if (!isAuthenticated) return;
    if (!canAccessModule(activeModule)) {
      const fallback = resolveDefaultModule();
      if (fallback && fallback !== activeModule) {
        setActiveModule(fallback);
      }
    }
  }, [isAuthenticated, activeModule, setActiveModule, canAccessModule, resolveDefaultModule]);

  const renderActiveModule = () => {
    if (!canAccessModule(activeModule)) {
      return (
        <AccessDenied
          moduleName={activeModule}
          onGoHome={() => {
            const fallback = resolveDefaultModule();
            if (fallback) setActiveModule(fallback);
          }}
        />
      );
    }

    switch (activeModule) {
      case 'dashboard-executive':
      case 'dashboard-financial':
      case 'dashboard-inventory':
      case 'dashboard-operations':
        return withModuleBoundary('لوحة التحكم', <Dashboard />);
      case 'pos':
        return withModuleBoundary('نقطة البيع', <POS />);
      case 'inventory':
        return withModuleBoundary('المخزون', <Inventory />);
      case 'crm':
        return withModuleBoundary('العملاء', <CRM />);
      case 'pets':
        return withModuleBoundary('الحيوانات', <Pets />);
      case 'services':
        return withModuleBoundary('الخدمات', <Services />);
      case 'boarding':
        return withModuleBoundary('الإيواء', <Boarding />);
      case 'invoices':
        return withModuleBoundary('مراجعة الفواتير', <InvoiceReview />);
      case 'finance':
        return withModuleBoundary('المالية', <Finance />);
      case 'reports':
        return withModuleBoundary('التقارير', <Reports />);
      case 'ai':
        return withModuleBoundary('المستشار الذكي', <AIAdvisor />);
      case 'settings':
        return withModuleBoundary('الإعدادات', <Dashboard />);
      case 'employees':
        return withModuleBoundary('الموظفين', <Employees />);
      case 'roles':
        return withModuleBoundary('الصلاحيات', <RolesPermissions />);
      default:
        return (
          <div className="workspace">
            <h2>Module "{activeModule}" Under Development</h2>
            <p>This layout view is being integrated.</p>
          </div>
        );
    }
  };

  if (!isAuthenticated) {
    return <Login />;
  }

  const isPOS = activeModule === 'pos';

  return (
    <>
      {isPOS ? (
        <POSLayout>
          {renderActiveModule()}
        </POSLayout>
      ) : (
        <ExecutiveLayout>
          {renderActiveModule()}
        </ExecutiveLayout>
      )}

      <CommandPalette />
      <ToastContainer />
    </>
  );
};

export default App;
