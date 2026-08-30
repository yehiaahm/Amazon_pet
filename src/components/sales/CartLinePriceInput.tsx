import React, { useEffect, useState } from 'react';
import Input from '../ui/Input';
import {
  MAX_POS_PRICE_DISCOUNT_PERCENT,
  isBelowMinAllowedSalePrice,
} from '../../core/pos/priceOverride';

export type CartLinePriceInputProps = {
  itemId: string;
  type: 'PRODUCT' | 'SERVICE';
  price: number;
  listPrice: number;
  minAllowedPrice: number;
  isElevated: boolean;
  onCommit: (
    itemId: string,
    type: 'PRODUCT' | 'SERVICE',
    price: number,
    opts?: { belowMinApproved?: boolean }
  ) => void;
  onWarn: (message: string) => void;
  onRequireManagerApproval: (itemId: string, type: 'PRODUCT' | 'SERVICE', price: number) => void;
};

/** Editable unit price: allows clearing while typing; raise freely or lower within cap. */
const CartLinePriceInput: React.FC<CartLinePriceInputProps> = ({
  itemId,
  type,
  price,
  listPrice,
  minAllowedPrice,
  isElevated,
  onCommit,
  onWarn,
  onRequireManagerApproval,
}) => {
  const [draft, setDraft] = useState(String(price));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setDraft(String(price));
    }
  }, [price, focused]);

  const tryApplyPrice = (next: number) => {
    if (next <= 0) {
      onWarn('سعر البيع يجب أن يكون أكبر من صفر.');
      onCommit(itemId, type, listPrice > 0 ? listPrice : price);
      setDraft(String(listPrice > 0 ? listPrice : price));
      return;
    }
    if (!isElevated && isBelowMinAllowedSalePrice(next, listPrice)) {
      onRequireManagerApproval(itemId, type, next);
      setDraft(String(price));
      return;
    }
    onCommit(itemId, type, next);
    setDraft(String(next));
  };

  const commit = () => {
    setFocused(false);
    const trimmed = draft.trim();
    if (trimmed === '' || trimmed === '.') {
      setDraft(String(price));
      return;
    }
    const next = parseFloat(trimmed);
    if (!Number.isFinite(next)) {
      setDraft(String(price));
      return;
    }
    tryApplyPrice(next);
  };

  const nudge = (delta: number) => {
    const base = Number.isFinite(price) ? price : listPrice;
    const next = parseFloat((base + delta).toFixed(2));
    tryApplyPrice(Math.max(0.01, next));
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <button
        type="button"
        className="btn-secondary"
        onClick={() => nudge(-1)}
        title="تخفيض السعر بجنيه"
        style={{
          padding: '2px 8px',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          fontWeight: 'bold',
        }}
      >
        −
      </button>
      <Input
        type="text"
        inputMode="decimal"
        value={draft}
        onFocus={(e) => {
          setFocused(true);
          e.target.select();
        }}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '' || /^\d*\.?\d*$/.test(raw)) {
            setDraft(raw);
          }
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur();
          }
        }}
        style={{ width: '88px', padding: '4px 6px', fontSize: '12px' }}
        title={`عدّل سعر البيع لهذه الفاتورة — الحد الأدنى ${minAllowedPrice.toFixed(2)} (خصم ${MAX_POS_PRICE_DISCOUNT_PERCENT}% كحد أقصى)`}
      />
      <button
        type="button"
        className="btn-secondary"
        onClick={() => nudge(1)}
        title="زيادة السعر بجنيه"
        style={{
          padding: '2px 8px',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          fontWeight: 'bold',
        }}
      >
        +
      </button>
    </div>
  );
};

export default CartLinePriceInput;
