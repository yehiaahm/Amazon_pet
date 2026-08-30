import React from 'react';
import Button from './Button';

interface ModalFooterActionsProps {
  onCancel: () => void;
  onSave: () => void;
  saveDisabled?: boolean;
  cancelLabel?: string;
  saveLabel?: string;
}

export const ModalFooterActions: React.FC<ModalFooterActionsProps> = ({
  onCancel,
  onSave,
  saveDisabled,
  cancelLabel = 'إلغاء',
  saveLabel = 'حفظ',
}) => (
  <div style={{ display: 'flex', gap: '8px' }}>
    <Button variant="secondary" onClick={onCancel}>{cancelLabel}</Button>
    <Button variant="primary" onClick={onSave} disabled={saveDisabled}>{saveLabel}</Button>
  </div>
);

export const ModalHint: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', margin: 0 }}>
    {children}
  </p>
);
