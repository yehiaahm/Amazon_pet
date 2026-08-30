import React from 'react';

interface CardProps {
  title?: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({ title, extra, children, className = '', style, onClick }) => {
  return (
    <div
      className={`card ${className}`}
      style={onClick ? { ...style, cursor: 'pointer' } : style}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      {title && (
        <div className="card-header">
          <span className="card-title">{title}</span>
          {extra && <div className="card-extra">{extra}</div>}
        </div>
      )}
      <div className="card-content-wrap" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2)' }}>
        {children}
      </div>
    </div>
  );
};
export default Card;
