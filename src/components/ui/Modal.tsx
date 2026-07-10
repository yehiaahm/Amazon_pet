import React from 'react';
import Button from './Button';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, footer, maxWidth = '500px' }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className="modal-content" 
        style={{ maxWidth }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--spacing-4)', borderBottom: '1px solid var(--color-border)' }}>
          <span style={{ fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-primary)' }}>
            {title}
          </span>
          <button 
            onClick={onClose} 
            className="btn-ghost" 
            style={{ 
              padding: '2px 8px', 
              fontSize: '1.25rem',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            &times;
          </button>
        </div>
        <div style={{ padding: 'var(--spacing-4)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
          {children}
        </div>
        <div style={{ 
          padding: 'var(--spacing-3) var(--spacing-4)', 
          borderTop: '1px solid var(--color-border)', 
          display: 'flex', 
          justifyContent: 'flex-end', 
          gap: 'var(--spacing-2)', 
          backgroundColor: 'var(--color-bg)' 
        }}>
          {footer || (
            <Button onClick={onClose} variant="secondary">Close</Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Modal;
