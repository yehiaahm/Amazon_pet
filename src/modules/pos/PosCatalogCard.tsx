import { memo, useCallback } from 'react';
import Badge from '../../components/ui/Badge';
import { formatMoney } from '../../core/utils/money';
import type { PosCatalogLine } from '../../core/pos/catalogDedupe';

export interface PosCatalogCardProps {
  item: PosCatalogLine;
  onSelect: (item: PosCatalogLine) => void;
}

export const PosCatalogCard = memo(function PosCatalogCard({ item, onSelect }: PosCatalogCardProps) {
  const isOutOfStock = item.type === 'PRODUCT' && item.stock != null && item.stock <= 0;

  const handleClick = useCallback(() => {
    if (!isOutOfStock) onSelect(item);
  }, [isOutOfStock, item, onSelect]);

  return (
    <div
      role="button"
      tabIndex={isOutOfStock ? -1 : 0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      style={{
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--spacing-3)',
        cursor: isOutOfStock ? 'not-allowed' : 'pointer',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        height: '110px',
        opacity: isOutOfStock ? 0.5 : 1,
        backgroundColor: 'var(--color-bg)',
        transition: 'border-color var(--transition-fast)',
      }}
    >
      <div>
        <div
          style={{
            fontSize: 'var(--font-size-xs)',
            fontWeight: 'bold',
            color: 'var(--color-text-primary)',
            lineBreak: 'anywhere',
          }}
        >
          {item.name}
        </div>
        <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
          رمز الصنف: {item.sku.slice(0, 10)}
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 'auto',
        }}
      >
        <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'bold', color: 'var(--color-primary)' }}>
          {formatMoney(item.price)}
        </span>
        {item.stock !== null && (
          <Badge
            variant={item.stock < 10 ? 'danger' : 'success'}
            style={{ fontSize: '9px', padding: '1px 4px' }}
          >
            {item.stock} متاح
          </Badge>
        )}
      </div>
    </div>
  );
});

export default PosCatalogCard;
