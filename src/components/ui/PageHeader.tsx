import React from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, actions }) => {
  return (
    <div className="workspace-header">
      <div>
        <h1 style={{ 
          fontSize: 'var(--font-size-xl)', 
          fontWeight: 'var(--font-weight-bold)', 
          color: 'var(--color-text-primary)',
          lineHeight: '1.2' 
        }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div style={{ display: 'flex', gap: 'var(--spacing-2)' }}>{actions}</div>}
    </div>
  );
};

export default PageHeader;
