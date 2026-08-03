import React from 'react';
import { X, CheckCircle2, AlertTriangle, Bell, DollarSign, Package, Brain } from 'lucide-react';
import { useUIStore, ToastItem } from '../../core/stores/uiStore';

const TOAST_DURATION_MS = 5000;

function toastIcon(category: ToastItem['category']) {
  const size = 18;
  switch (category) {
    case 'WARNINGS':
    case 'ALERTS':
      return <AlertTriangle size={size} />;
    case 'FINANCE':
      return <DollarSign size={size} />;
    case 'INVENTORY':
      return <Package size={size} />;
    case 'AI':
      return <Brain size={size} />;
    case 'APPROVALS':
      return <Bell size={size} />;
    default:
      return <CheckCircle2 size={size} />;
  }
}

function toastVariant(category: ToastItem['category']): string {
  if (category === 'WARNINGS' || category === 'ALERTS') return 'toast-warning';
  if (category === 'FINANCE') return 'toast-finance';
  if (category === 'INVENTORY') return 'toast-inventory';
  if (category === 'AI') return 'toast-ai';
  return 'toast-success';
}

const ToastContainer: React.FC = () => {
  const toasts = useUIStore((s) => s.toasts);
  const dismissToast = useUIStore((s) => s.dismissToast);

  React.useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((toast) =>
      window.setTimeout(() => dismissToast(toast.id), TOAST_DURATION_MS)
    );
    return () => timers.forEach(clearTimeout);
  }, [toasts, dismissToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" aria-live="polite" aria-relevant="additions">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast-item ${toastVariant(toast.category)}`} role="status">
          <div className="toast-icon">{toastIcon(toast.category)}</div>
          <div className="toast-body">
            <strong>{toast.title}</strong>
            <span>{toast.message}</span>
          </div>
          <button
            type="button"
            className="toast-close"
            onClick={() => dismissToast(toast.id)}
            aria-label="إغلاق"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
};

export default ToastContainer;
