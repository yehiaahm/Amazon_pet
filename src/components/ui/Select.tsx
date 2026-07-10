import React from 'react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string }[];
  error?: string;
  containerStyle?: React.CSSProperties;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({ 
  label, 
  options,
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
      <select ref={ref} className={className} style={{ width: '100%', ...style }} {...props}>
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-danger)' }}>{error}</span>}
    </div>
  );
});

Select.displayName = 'Select';
export default Select;
