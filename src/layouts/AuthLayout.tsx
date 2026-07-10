import React from 'react';

interface AuthLayoutProps {
  children: React.ReactNode;
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({ children }) => {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      width: '100vw',
      backgroundColor: 'var(--color-bg)'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '400px',
        margin: 'var(--spacing-4)'
      }}>
        {children}
      </div>
    </div>
  );
};

export default AuthLayout;
