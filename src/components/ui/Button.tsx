import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'secondary', 
  size = 'md', 
  className = '', 
  style,
  ...props 
}) => {
  const paddingMap = {
    sm: '4px var(--spacing-2)',
    md: '6px var(--spacing-4)',
    lg: '10px var(--spacing-6)'
  };
  const sizeMap = {
    sm: 'var(--font-size-xs)',
    md: 'var(--font-size-sm)',
    lg: 'var(--font-size-base)'
  };

  return (
    <button 
      className={`btn-${variant} ${className}`}
      style={{
        padding: paddingMap[size],
        fontSize: sizeMap[size],
        ...style
      }}
      {...props}
    >
      {children}
    </button>
  );
};
export default Button;
