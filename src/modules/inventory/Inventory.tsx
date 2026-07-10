import React, { useState } from 'react';
import { 
  useProducts, useVariants, useBatches, 
  useUpdateStock, useWarehouses, useStockMovements 
} from '../../core/hooks/useERPData';
import { useUIStore } from '../../core/stores/uiStore';
import { 
  PlusCircle, Calendar, ArrowRightLeft, 
  History, Layers 
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Modal from '../../components/ui/Modal';
import DataTable from '../../components/ui/DataTable';

export const Inventory: React.FC = () => {
  const currentEmployee = useUIStore(s => s.currentEmployee)!;
  
  // Custom queries & mutations
  const { data: products, isLoading: loadingProds } = useProducts();
  const { data: variants, isLoading: loadingVars } = useVariants();
  const { data: batches } = useBatches();
  const { data: warehouses } = useWarehouses();
  const { data: movements } = useStockMovements();
  const { mutate: adjustStock, isPending: adjusting } = useUpdateStock();

  // Local state
  const [activeSubTab, setActiveSubTab] = useState<'STOCK' | 'BATCHES' | 'MOVEMENTS'>('STOCK');
  const [selectedVariant, setSelectedVariant] = useState<any | null>(null);
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustReason, setAdjustReason] = useState('ADJUSTMENT');
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferQty, setTransferQty] = useState('');

  if (loadingProds || loadingVars) {
    return <div className="workspace"><div className="skeleton" style={{ height: '40px' }} /></div>;
  }

  // Map variants to full display objects
  const variantsTableData = variants?.map(v => {
    const prod = products?.find(p => p.id === v.productId);
    return {
      id: v.id,
      sku: prod?.sku || '',
      name: prod?.name || '',
      variant: v.name,
      price: v.price,
      cost: v.cost,
      stock: v.stockQuantity,
      limit: prod?.minStockLimit || 10,
      margin: (((v.price - v.cost) / v.price) * 100).toFixed(0) + '%'
    };
  }) || [];

  const handleAdjustStock = () => {
    if (!selectedVariant) return;
    const diff = parseInt(adjustQty) || 0;
    
    adjustStock({
      variantId: selectedVariant.id,
      diff,
      type: adjustReason as any,
      employeeId: currentEmployee.id
    }, {
      onSuccess: () => {
        setSelectedVariant(null);
        setAdjustQty('');
      }
    });
  };

  const handleTransferStock = () => {
    // Simulated stock transfer
    const qty = parseInt(transferQty) || 0;
    if (qty <= 0) return;
    
    // Deduct main and add shelves
    adjustStock({ variantId: 'v-1', diff: -qty, type: 'TRANSFER', employeeId: currentEmployee.id });
    adjustStock({ variantId: 'v-2', diff: qty, type: 'TRANSFER', employeeId: currentEmployee.id });

    setShowTransferModal(false);
    setTransferQty('');
  };

  // Columns Definitions
  const stockColumns = [
    { header: 'رمز السلعة (SKU)', accessor: 'sku' as const, key: 'sku', sortable: true },
    { header: 'اسم المنتج', accessor: 'name' as const, key: 'name', sortable: true },
    { header: 'الصنف والحجم', accessor: 'variant' as const, key: 'variant' },
    { header: 'الكمية المتاحة', accessor: 'stock' as const, key: 'stock', sortable: true },
    { header: 'الهامش %', accessor: 'margin' as const, key: 'margin' },
    { 
      header: 'سعر البيع', 
      accessor: (row: any) => `$${row.price.toFixed(2)}`,
      key: 'price',
      sortable: true
    },
    {
      header: 'حالة المخزون',
      accessor: (row: any) => (
        <Badge variant={row.stock < row.limit ? 'danger' : 'success'}>
          {row.stock < row.limit ? `منخفض (<${row.limit})` : 'ممتاز'}
        </Badge>
      ),
      key: 'status'
    },
    {
      header: 'إجراءات الجرد',
      accessor: (row: any) => (
        <div style={{ display: 'flex', gap: '4px' }}>
          <Button onClick={() => setSelectedVariant(row)} variant="secondary" size="sm">
            تعديل الكمية
          </Button>
        </div>
      ),
      key: 'actions'
    }
  ];

  const batchColumns = [
    { header: 'رقم الشحنة (Batch)', accessor: 'batchNumber' as const, key: 'batchNumber' },
    { 
      header: 'اسم المنتج', 
      accessor: (row: any) => {
        const variant = variants?.find(v => v.id === row.productVariantId);
        const prod = products?.find(p => p.id === variant?.productId);
        return `${prod?.name || ''} - ${variant?.name || ''}`;
      },
      key: 'productName'
    },
    { header: 'كمية الشحنة', accessor: 'quantity' as const, key: 'quantity' },
    { header: 'تاريخ الانتهاء', accessor: 'expiryDate' as const, key: 'expiryDate', sortable: true },
    {
      header: 'تنبيه الأمان والانتهاء',
      accessor: (row: any) => {
        const daysLeft = Math.floor((new Date(row.expiryDate).getTime() - new Date('2026-07-06').getTime()) / (1000 * 60 * 60 * 24));
        const isExpiring = daysLeft < 90;
        return (
          <Badge variant={isExpiring ? 'danger' : 'success'}>
            {isExpiring ? `تنتهي خلال ${daysLeft} يوم` : 'آمن ومستقر'}
          </Badge>
        );
      },
      key: 'warning'
    }
  ];

  const movementsColumns = [
    { header: 'تاريخ الحركة', accessor: 'timestamp' as const, key: 'timestamp', sortable: true },
    { 
      header: 'موقع المستودع', 
      accessor: (row: any) => {
        const wh = warehouses?.find(w => w.id === row.warehouseId);
        return wh?.name === 'Retail Shelves WH' ? 'رفوف العرض الأمامية' : 'المخزن الخلفي الرئيسي';
      },
      key: 'warehouse'
    },
    { 
      header: 'رمز الصنف (SKU)', 
      accessor: (row: any) => {
        const variant = variants?.find(v => v.id === row.productVariantId);
        return products?.find(p => p.id === variant?.productId)?.sku || '';
      },
      key: 'sku'
    },
    { header: 'تغيير الكمية', accessor: 'quantity' as const, key: 'quantity', sortable: true },
    { 
      header: 'نوع الحركة', 
      accessor: (row: any) => {
        if (row.type === 'SALE') return 'مبيعات الكاشير';
        if (row.type === 'PURCHASE') return 'شحنة واردة';
        if (row.type === 'TRANSFER') return 'تحويل مستودعات';
        return 'تعديل جرد يدوي';
      }, 
      key: 'type' 
    }
  ];

  return (
    <div className="workspace">
      <PageHeader 
        title="رقابة جرد ومخازن الفروع" 
        subtitle="إدارة وتتبع السلع، تواريخ الصلاحية، وحركات التحويل المخزني"
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button onClick={() => setShowTransferModal(true)} variant="secondary" size="sm">
              <ArrowRightLeft size={14} /> تحويل كميات بين المستودعات
            </Button>
            <Button variant="primary" size="sm">
              <PlusCircle size={14} /> إضافة كود SKU جديد
            </Button>
          </div>
        }
      />

      {/* Sub-tabs Navigation */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', gap: 'var(--spacing-2)', paddingBottom: '4px' }}>
        <button
          onClick={() => setActiveSubTab('STOCK')}
          className="btn-ghost"
          style={{
            fontSize: 'var(--font-size-sm)',
            padding: '6px 16px',
            borderBottom: activeSubTab === 'STOCK' ? '2px solid var(--color-primary)' : 'none',
            color: activeSubTab === 'STOCK' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            fontWeight: activeSubTab === 'STOCK' ? 'bold' : 'normal',
            display: 'flex', alignItems: 'center', gap: '6px'
          }}
        >
          <Layers size={16} /> أرصدة المستودعات الحالية
        </button>
        <button
          onClick={() => setActiveSubTab('BATCHES')}
          className="btn-ghost"
          style={{
            fontSize: 'var(--font-size-sm)',
            padding: '6px 16px',
            borderBottom: activeSubTab === 'BATCHES' ? '2px solid var(--color-primary)' : 'none',
            color: activeSubTab === 'BATCHES' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            fontWeight: activeSubTab === 'BATCHES' ? 'bold' : 'normal',
            display: 'flex', alignItems: 'center', gap: '6px'
          }}
        >
          <Calendar size={16} /> الشحنات وتواريخ الانتهاء
        </button>
        <button
          onClick={() => setActiveSubTab('MOVEMENTS')}
          className="btn-ghost"
          style={{
            fontSize: 'var(--font-size-sm)',
            padding: '6px 16px',
            borderBottom: activeSubTab === 'MOVEMENTS' ? '2px solid var(--color-primary)' : 'none',
            color: activeSubTab === 'MOVEMENTS' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            fontWeight: activeSubTab === 'MOVEMENTS' ? 'bold' : 'normal',
            display: 'flex', alignItems: 'center', gap: '6px'
          }}
        >
          <History size={16} /> لوج حركات المخزن
        </button>
      </div>

      {/* Grid Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {activeSubTab === 'STOCK' && (
          <DataTable
            data={variantsTableData}
            columns={stockColumns}
            rowKey="id"
            searchField="name"
            searchPlaceholder="ابحث باسم المنتج أو الـ SKU..."
          />
        )}
        
        {activeSubTab === 'BATCHES' && (
          <DataTable
            data={batches || []}
            columns={batchColumns}
            rowKey="id"
            searchField="batchNumber"
            searchPlaceholder="ابحث برقم الشحنة..."
          />
        )}

        {activeSubTab === 'MOVEMENTS' && (
          <DataTable
            data={[...(movements || [])].reverse()}
            columns={movementsColumns}
            rowKey="id"
          />
        )}
      </div>

      {/* 1. STOCK ADJUSTMENT DIALOG */}
      <Modal
        isOpen={selectedVariant !== null}
        onClose={() => setSelectedVariant(null)}
        title="تعديل كمية جرد المخزون"
        footer={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button onClick={() => setSelectedVariant(null)} variant="secondary">إلغاء</Button>
            <Button onClick={handleAdjustStock} disabled={adjusting} variant="primary">حفظ وتعديل الرصيد</Button>
          </div>
        }
      >
        {selectedVariant && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: 'var(--font-size-xs)', padding: 'var(--spacing-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-bg)' }}>
              <div>المنتج: <strong>{selectedVariant.name}</strong></div>
              <div>الصنف: {selectedVariant.variant}</div>
              <div>الكمية الحالية المتوفرة: {selectedVariant.stock} وحدة</div>
            </div>

            <Input
              label="فارق تعديل الكمية (مثال: +10 لزيادة الجرد، -5 للخصم)"
              value={adjustQty}
              onChange={(e) => setAdjustQty(e.target.value)}
              placeholder="0"
            />

            <Select
              label="سبب تعديل المخزون"
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
              options={[
                { value: 'ADJUSTMENT', label: 'تعديل جرد يدوي ومطابقة الدرج' },
                { value: 'PURCHASE', label: 'شحنة واردة من الموردين' },
                { value: 'SALE', label: 'مرتجع مبيعات من عميل' }
              ]}
            />
          </div>
        )}
      </Modal>

      {/* 2. WAREHOUSE TRANSFER MODAL */}
      <Modal
        isOpen={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        title="تحويل كميات المنتجات بين المستودعات"
        footer={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button onClick={() => setShowTransferModal(false)} variant="secondary">إلغاء</Button>
            <Button onClick={handleTransferStock} variant="primary">تأكيد ونقل المخزون</Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
            نقل المنتجات بين المخازن الخلفية ورفوف العرض الأمامية لنقاط البيع.
          </div>

          <Select
            label="المستودع المصدر (من)"
            value="w-1"
            options={[{ value: 'w-1', label: 'المخزن الخلفي الرئيسي (WH-MAIN)' }]}
          />
          <Select
            label="المستودع المستهدف (إلى)"
            value="w-2"
            options={[{ value: 'w-2', label: 'رفوف العرض بنقاط البيع (WH-SHELF)' }]}
          />
          
          <Select
            label="اختر المنتج المراد نقله"
            value="v-1"
            options={[
              { value: 'v-1', label: 'طعام كلاب رويال كانين (10kg) - الكمية المتاحة: 24' },
              { value: 'v-2', label: 'طعام كلاب رويال كانين (2kg) - الكمية المتاحة: 12' }
            ]}
          />

          <Input
            label="الكمية المراد نقلها"
            value={transferQty}
            onChange={(e) => setTransferQty(e.target.value)}
            placeholder="0"
          />
        </div>
      </Modal>
    </div>
  );
};

export default Inventory;
