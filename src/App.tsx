import React from 'react';
import { useUIStore } from './core/stores/uiStore';
import ExecutiveLayout from './layouts/ExecutiveLayout';
import POSLayout from './layouts/POSLayout';
import CommandPalette from './components/ui/CommandPalette';
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
import Settings from './modules/settings/Settings';

export const App: React.FC = () => {
  const activeModule = useUIStore(s => s.activeModule);
  const isAuthenticated = useUIStore(s => s.isAuthenticated);

  const renderActiveModule = () => {
    switch (activeModule) {
      // Dashboards
      case 'dashboard-executive':
      case 'dashboard-financial':
      case 'dashboard-inventory':
      case 'dashboard-operations':
        return <Dashboard />;
      
      // Core Operatives
      case 'pos':
        return <POS />;
      case 'inventory':
        return <Inventory />;
      case 'crm':
        return <CRM />;
      case 'pets':
        return <Pets />;
      case 'services':
        return <Services />;
      
      // Finance & Ledger
      case 'finance':
        return <Finance />;
      
      // AI advisor
      case 'ai':
        return <AIAdvisor />;
      
      // System Settings
      case 'settings':
        return <Settings />;
        
      default:
        return (
          <div className="workspace">
            <h2>Module "{activeModule}" Under Development</h2>
            <p>This layout view is being integrated.</p>
          </div>
        );
    }
  };

  // If user is not authenticated, show the lock/login screen
  if (!isAuthenticated) {
    return <Login />;
  }

  // Select Layout Shell
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

      {/* Global Command palette listening to Ctrl+K */}
      <CommandPalette />
    </>
  );
};

export default App;
