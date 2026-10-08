import React, { useEffect, useState } from 'react';
import Input from '../ui/Input';
import {
  isBelowMinAllowedSalePrice,
  lineNetUnitPrice,
} from '../../core/pos/priceOverride';

export type CartLineDiscountInputProps = {
  itemId: string;
  type: 'PRODUCT' | 'SERVICE';
  price: number;
  listPrice: number;
  discountPercent: number;
  isElevated: boolean;
  onCommit: (itemId: string, type: 'PRODUCT' | 'SERVICE', percent: number) => void;
  onWarn: (message: string) => void;
  onRequireManagerApproval: (itemId: string, type: 'PRODUCT' | 'SERVICE', percent: number) => void;
};

/** Per-line discount percent; a net price below the cashier floor needs manager approval. */
const CartLineDiscountInput: React.FC<CartLineDiscountInputProps> = ({
  itemId,
  type,
  price,
  listPrice,
  discountPercent,
  isElevated,
  onCommit,
  onWarn,
  onRequireManagerApproval,
}) => {
  const shown = discountPercent > 0 ? String(discountPercent) : '';
  const [draft, setDraft] = useState(shown);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setDraft(shown);
    }
  }, [shown, focused]);

  const commit = () => {
    setFocused(false);
    const trimmed = draft.trim();
    const next = trimmed === '' || trimmed === '.' ? 0 : parseFloat(trimmed);
    if (!Number.isFinite(next)) {
      setDraft(shown);
      return;
    }
    if (next > 100) {
      onWarn('نسبة خصم الصنف لا تتجاوز 100%.');
      setDraft(shown);
      return;
    }
    if (next === discountPercent) {
      setDraft(shown);
      return;
    }
    if (!isElevated && isBelowMinAllowedSalePrice(lineNetUnitPrice(price, next), listPrice)) {
      onRequireManagerApproval(itemId, type, next);
      setDraft(shown);
      return;
    }
    onCommit(itemId, type, next);
    setDraft(next > 0 ? String(next) : '');
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <Input
        type="text"
        inputMode="decimal"
        value={draft}
        placeholder="0"
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
        style={{ width: '56px', padding: '4px 6px', fontSize: '12px' }}
        title="نسبة خصم على هذا الصنف فقط"
      />
      <span style={{ fontSize: '11px', fontWeight: 'bold' }}>%</span>
    </div>
  );
};

export default CartLineDiscountInput;
