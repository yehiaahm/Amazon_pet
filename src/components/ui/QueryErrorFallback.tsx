import React from 'react';
import { Button } from './Button';

interface QueryErrorFallbackProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  isOffline?: boolean;
}

export const QueryErrorFallback: React.FC<QueryErrorFallbackProps> = ({
  title = 'تعذر تحميل البيانات',
  message,
  onRetry,
  isOffline,
}) => {
  const offline = isOffline ?? (typeof navigator !== 'undefined' && !navigator.onLine);
  const displayMessage =
    message ??
    (offline
      ? 'لا يوجد اتصال بالشبكة. تحقق من الإنترنت أو من تشغيل الخادم ثم أعد المحاولة.'
      : 'حدث خطأ أثناء الاتصال بالخادم. يرجى المحاولة مرة أخرى.');

  return (
    <div
      className="workspace"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--spacing-3)',
        padding: 'var(--spacing-6)',
        minHeight: '200px',
        textAlign: 'center',
      }}
      role="alert"
    >
      <h3 style={{ margin: 0, color: 'var(--color-danger)' }}>{title}</h3>
      <p style={{ margin: 0, maxWidth: '420px', color: 'var(--color-text-secondary)' }}>{displayMessage}</p>
      {onRetry && (
        <Button variant="primary" onClick={onRetry}>
          إعادة المحاولة
        </Button>
      )}
    </div>
  );
};

export default QueryErrorFallback;
