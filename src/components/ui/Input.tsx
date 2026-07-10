import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  containerStyle?: React.CSSProperties;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ 
  label, 
  error, 
  className = '', 
  containerStyle,
  style,
  ...props 
}, ref) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-1)', width: '100%', ...containerStyle }}>
      {label && (
        <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-text-secondary)' }}>
          {label}
        </label>
      )}
      <input ref={ref} className={className} style={{ width: '100%', ...style }} {...props} />
      {error && <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-danger)' }}>{error}</span>}
    </div>
  );
});

Input.displayName = 'Input';
export default Input;
