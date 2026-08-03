import React from 'react';
import { ShieldOff } from 'lucide-react';
import Button from './Button';

interface AccessDeniedProps {
  moduleName?: string;
  onGoHome?: () => void;
}

export const AccessDenied: React.FC<AccessDeniedProps> = ({ moduleName, onGoHome }) => (
  <div className="workspace" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '320px', gap: 'var(--spacing-4)', textAlign: 'center' }}>
    <ShieldOff size={48} style={{ color: 'var(--color-warning)' }} />
    <h2 style={{ margin: 0 }}>غير مصرح بالوصول</h2>
    <p style={{ color: 'var(--color-text-secondary)', maxWidth: '420px', margin: 0 }}>
      {moduleName
        ? `لا تملك الصلاحية المطلوبة للوصول إلى "${moduleName}".`
        : 'لا تملك الصلاحية المطلوبة لهذه الصفحة.'}
    </p>
    {onGoHome && (
      <Button variant="primary" onClick={onGoHome}>
        العودة للصفحة الرئيسية
      </Button>
    )}
  </div>
);

export default AccessDenied;
