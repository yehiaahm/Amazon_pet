import React from 'react';
import Card from './Card';
import Badge from './Badge';

interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  trend?: {
    value: string;
    type: 'up' | 'down' | 'neutral';
  };
  icon?: React.ReactNode;
  onClick?: () => void;
}

export const StatCard: React.FC<StatCardProps> = ({ title, value, description, trend, icon, onClick }) => {
  return (
    <Card style={{ padding: 'var(--spacing-4)' }} onClick={onClick}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {title}
        </span>
        {icon && <div style={{ color: 'var(--color-text-secondary)' }}>{icon}</div>}
      </div>
      <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-primary)', marginTop: '4px' }}>
        {value}
      </div>
      {(trend || description) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)', marginTop: '8px', fontSize: 'var(--font-size-xs)' }}>
          {trend && (
            <Badge variant={trend.type === 'up' ? 'success' : trend.type === 'down' ? 'danger' : 'gray'}>
              {trend.value}
            </Badge>
          )}
          {description && <span style={{ color: 'var(--color-text-secondary)' }}>{description}</span>}
        </div>
      )}
    </Card>
  );
};

export default StatCard;
