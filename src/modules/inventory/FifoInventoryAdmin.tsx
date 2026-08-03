import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../core/api/endpoints';
import DataTable from '../../components/ui/DataTable';
import Button from '../../components/ui/Button';
import Select from '../../components/ui/Select';
import Input from '../../components/ui/Input';
import { formatMoney } from '../../core/utils/money';

type FifoPanel = 'VALUATION' | 'LEDGER' | 'STRATEGY';

const FifoInventoryAdmin: React.FC = () => {
  const qc = useQueryClient();
  const [panel, setPanel] = useState<FifoPanel>('VALUATION');
  const [variantId, setVariantId] = useState('');

  const { data: valuation, isLoading: loadingValuation } = useQuery({
    queryKey: ['fifoValuation'],
    queryFn: () => api.getFifoValuation(),
    enabled: panel === 'VALUATION',
  });

  const { data: strategy } = useQuery({
    queryKey: ['fifoStrategy'],
    queryFn: () => api.getFifoDeductionStrategy(),
    enabled: panel === 'STRATEGY',
  });

  const { data: ledger } = useQuery({
    queryKey: ['fifoLedger', variantId],
    queryFn: () => api.getFifoLedger(variantId),
    enabled: panel === 'LEDGER' && !!variantId.trim(),
  });

  const strategyMutation = useMutation({
    mutationFn: (s: 'FIFO' | 'FEFO') => api.setFifoDeductionStrategy(s),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fifoStrategy'] }),
  });

  const reconcileMutation = useMutation({
    mutationFn: () => api.reconcileInventory(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['batches'] });
      qc.invalidateQueries({ queryKey: ['variants'] });
      qc.invalidateQueries({ queryKey: ['fifoValuation'] });
    },
  });

  const panelBtn = (id: FifoPanel, label: string) => (
    <button
      type="button"
      onClick={() => setPanel(id)}
      style={{
        padding: '8px 12px',
        border: 'none',
        background: 'transparent',
        borderBottom: panel === id ? '2px solid var(--color-primary)' : 'none',
        color: panel === id ? 'var(--color-primary)' : 'var(--color-text-secondary)',
        fontWeight: panel === id ? 'bold' : 'normal',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', borderBottom: '1px solid var(--color-border)' }}>
        {panelBtn('VALUATION', 'تقييم المخزون')}
        {panelBtn('LEDGER', 'دفتر الحركات')}
        {panelBtn('STRATEGY', 'FIFO / FEFO')}
      </div>

      {panel === 'VALUATION' && (
        <div style={{ padding: '16px', background: 'var(--color-surface)', borderRadius: '8px' }}>
          {loadingValuation ? (
            <p>جاري التحميل...</p>
          ) : (
            <>
              <p style={{ fontSize: '1.1rem', marginBottom: '8px' }}>
                إجمالي تقييم المخزون (من دفعات FIFO):
              </p>
              <strong style={{ fontSize: '1.5rem', color: 'var(--color-primary)' }}>
                {formatMoney(Number(valuation?.totalValuation) || 0)}
              </strong>
              <div style={{ display: 'flex', gap: '24px', marginTop: '12px', flexWrap: 'wrap' }}>
                <span>الدفعات النشطة: <strong>{valuation?.totalActiveBatches ?? '—'}</strong></span>
                <span>إجمالي الوحدات: <strong>{valuation?.totalQuantityInStock ?? '—'}</strong></span>
              </div>
              <p style={{ marginTop: '8px', color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
                المصدر: <code>inventory_batches</code> — متزامن مع كميات المخزون المعروضة.
              </p>
              <div style={{ marginTop: '12px' }}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => reconcileMutation.mutate()}
                  disabled={reconcileMutation.isPending}
                >
                  {reconcileMutation.isPending ? 'جاري المزامنة...' : 'مزامنة المخزون مع الدفعات'}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {panel === 'LEDGER' && (
        <div>
          <div style={{ maxWidth: 360, marginBottom: '12px' }}>
            <Input
              label="معرّف Variant"
              value={variantId}
              onChange={(e) => setVariantId(e.target.value)}
              placeholder="v-..."
            />
          </div>
          {variantId.trim() && (
            <DataTable
              data={ledger || []}
              rowKey="id"
              columns={[
                { header: 'النوع', accessor: 'transactionType' as const, key: 'type' },
                { header: 'التغير', accessor: 'quantityChange' as const, key: 'qty' },
                { header: 'التكلفة', accessor: (r: any) => formatMoney(Number(r.totalCost)), key: 'cost' },
                { header: 'المرجع', accessor: 'referenceType' as const, key: 'ref' },
                { header: 'التاريخ', accessor: 'createdAt' as const, key: 'at' },
              ]}
              searchField="referenceType"
            />
          )}
        </div>
      )}

      {panel === 'STRATEGY' && (
        <div style={{ maxWidth: 400, display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <p>طريقة خصم الدفعات عند البيع:</p>
          <Select
            label="الاستراتيجية"
            value={strategy?.strategy || 'FIFO'}
            onChange={(e) => strategyMutation.mutate(e.target.value as 'FIFO' | 'FEFO')}
            options={[
              { value: 'FIFO', label: 'FIFO — أقدم شراء أولاً' },
              { value: 'FEFO', label: 'FEFO — أقرب انتهاء أولاً' },
            ]}
          />
          {strategyMutation.isPending && <span>جاري الحفظ...</span>}
        </div>
      )}
    </div>
  );
};

export default FifoInventoryAdmin;
