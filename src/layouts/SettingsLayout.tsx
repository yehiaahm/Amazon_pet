import React from 'react';

interface SettingsLayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const SettingsLayout: React.FC<SettingsLayoutProps> = ({ children, activeTab, setActiveTab }) => {
  const tabs = [
    { id: 'general', name: 'الإعدادات العامة' },
    { id: 'pos', name: 'إعدادات نقاط البيع والدرج' },
    { id: 'tax', name: 'الضرائب والفواتير' },
    { id: 'ai', name: 'نماذج ومفاتيح الذكاء الاصطناعي' }
  ];

  return (
    <div style={{ display: 'flex', gap: 'var(--spacing-6)', flex: 1, minHeight: 0 }}>
      {/* Left Side: Navigation Menu */}
      <div style={{
        width: '240px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        flexShrink: 0
      }}>
        {tabs.map(t => {
          const isSel = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                textAlign: 'right',
                padding: 'var(--spacing-2) var(--spacing-4)',
                backgroundColor: isSel ? 'var(--color-primary-light)' : 'transparent',
                color: isSel ? 'var(--color-primary)' : 'var(--color-text-primary)',
                fontWeight: isSel ? 'var(--font-weight-semibold)' : 'var(--font-weight-normal)',
                borderRadius: 'var(--radius-md)',
                border: 'none',
                cursor: 'pointer',
                width: '100%'
              }}
            >
              {t.name}
            </button>
          );
        })}
      </div>
      
      {/* Right Side: Active View */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        {children}
      </div>
    </div>
  );
};

export default SettingsLayout;
