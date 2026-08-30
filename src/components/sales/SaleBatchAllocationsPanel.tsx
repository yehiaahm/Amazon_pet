import React from 'react';
import { formatMoney } from '../../core/utils/money';
import type { SaleBatchAllocationRow } from '../../types/erp';

type Props = {
  rows: SaleBatchAllocationRow[];
  loading?: boolean;
};

export const SaleBatchAllocationsPanel: React.FC<Props> = ({ rows, loading }) => {
  if (loading) {
    return (
      <p style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>جاري تحميل تخصيص الدفعات...</p>
    );
  }
  if (!rows.length) {
    return (
      <p style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
        لا توجد تخصيصات دفعات (قد تكون فاتورة خدمات فقط).
      </p>
    );
  }

  return (
    <div
      style={{
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        padding: '8px',
        fontSize: '11px',
        direction: 'rtl',
      }}
    >
      <strong style={{ display: 'block', marginBottom: '6px' }}>تخصيص الدفعات (FIFO/FEFO) و COGS</strong>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'right' }}>
            <th style={{ padding: '4px' }}>الصنف</th>
            <th style={{ padding: '4px' }}>Batch</th>
            <th style={{ padding: '4px' }}>كمية</th>
            <th style={{ padding: '4px' }}>ت. وحدة</th>
            <th style={{ padding: '4px' }}>COGS</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={`${row.saleItemId}-${row.inventoryBatchId}-${idx}`}>
              <td style={{ padding: '4px' }}>{row.productName}</td>
              <td style={{ padding: '4px', direction: 'ltr' }}>{row.batchNumber || row.inventoryBatchId}</td>
              <td style={{ padding: '4px' }}>{row.quantityAllocated}</td>
              <td style={{ padding: '4px' }}>{formatMoney(Number(row.unitCostAtSale || 0))}</td>
              <td style={{ padding: '4px' }}>{formatMoney(Number(row.totalAllocatedCost || 0))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default SaleBatchAllocationsPanel;
