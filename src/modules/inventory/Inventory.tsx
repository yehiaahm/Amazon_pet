import React, { useEffect, useMemo, useState } from 'react';
import {
  useProducts,
  useVariants,
  useBatches,
  useUpdateStock,
  useTransferStock,
  useWarehouses,
  useAddProduct,
  useUpdateProduct,
  useDeleteVariant,
} from '../../core/hooks/useERPData';
import { useUIStore } from '../../core/stores/uiStore';
import {
  PlusCircle,
  Calendar,
  Layers,
  ShoppingCart,
  Barcode,
  Settings2,
  Pencil,
  Trash2,
  Upload,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Modal from '../../components/ui/Modal';
import DataTable from '../../components/ui/DataTable';
import FifoInventoryAdmin from './FifoInventoryAdmin';
import PurchaseInvoicePanel from './PurchaseInvoicePanel';
import BarcodeAdminPanel from './BarcodeAdminPanel';
import ImportWizard from './import/ImportWizard';
import Can from '../../components/ui/Can';
import { usePermissions } from '../../core/permissions/usePermissions';
import { PERMISSIONS } from '../../core/permissions/permissions';

type MainTab = 'STOCK' | 'BATCHES' | 'PURCHASES' | 'FIFO' | 'BARCODE' | 'IMPORT';

type ProductForm = {
  sku: string;
  name: string;
  variantName: string;
  price: string;
  cost: string;
  minStockLimit: string;
  initialStock: string;
  categoryName: string;
};

const emptyProductForm = (): ProductForm => ({
  sku: '',
  name: '',
  variantName: 'Default',
  price: '',
  cost: '',
  minStockLimit: '10',
  initialStock: '0',
  categoryName: '',
});

export const Inventory: React.FC = () => {
  const currentEmployee = useUIStore((s) => s.currentEmployee)!;
  const addNotification = useUIStore((s) => s.addNotification);
  const { hasPermission } = usePermissions();

  const { data: products, isLoading: loadingProds } = useProducts();
  const { data: variants, isLoading: loadingVars } = useVariants();
  const { data: batches } = useBatches();
  const {
    data: warehouses,
    isLoading: loadingWarehouses,
    isError: warehousesFailed,
    refetch: refetchWarehouses,
  } = useWarehouses();
  const { mutate: adjustStock, isPending: adjusting } = useUpdateStock();
  const { mutate: transferStock, isPending: transferring } = useTransferStock();
  const { mutate: addProduct, isPending: addingProduct } = useAddProduct();
  const { mutate: updateProduct, isPending: updatingProduct } = useUpdateProduct();
  const { mutate: deleteVariant, isPending: deletingVariant } = useDeleteVariant();

  const [activeTab, setActiveTab] = useState<MainTab>('STOCK');
  const [selectedVariant, setSelectedVariant] = useState<any | null>(null);
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustReason, setAdjustReason] = useState('ADJUSTMENT');
  const [adjustWarehouseId, setAdjustWarehouseId] = useState('');
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferSourceWh, setTransferSourceWh] = useState('');
  const [transferTargetWh, setTransferTargetWh] = useState('');
  const [transferVariantId, setTransferVariantId] = useState('');
  const [transferQty, setTransferQty] = useState('');
  const [showProductModal, setShowProductModal] = useState(false);
  const [productMode, setProductMode] = useState<'add' | 'edit'>('add');
  const [editVariantId, setEditVariantId] = useState<string | null>(null);
  const [productForm, setProductForm] = useState<ProductForm>(emptyProductForm());

  // Dashboard KPI drill-down: a KPI card navigated here asking for a specific tab
  // (e.g. FIFO valuation). Consume once, then clear so a later manual visit to
  // Inventory doesn't re-apply a stale tab selection.
  const pendingInventoryTab = useUIStore((s) => s.pendingInventoryTab);
  const setPendingInventoryTab = useUIStore((s) => s.setPendingInventoryTab);
  useEffect(() => {
    if (pendingInventoryTab) {
      setActiveTab(pendingInventoryTab);
      setPendingInventoryTab(null);
    }
  }, [pendingInventoryTab, setPendingInventoryTab]);

  useEffect(() => {
    if (!warehouses?.length) return;
    if (!transferSourceWh) setTransferSourceWh(warehouses[0].id);
    if (!transferTargetWh && warehouses.length > 1) setTransferTargetWh(warehouses[1].id);
    else if (!transferTargetWh) setTransferTargetWh(warehouses[0].id);
  }, [warehouses, transferSourceWh, transferTargetWh]);

  // Default to the sales/shelf warehouse — the one checkout actually deducts from —
  // instead of an arbitrary "first" warehouse, so a manual adjustment can't silently
  // land stock somewhere POS never sees (the item shows "available" but sale fails).
  useEffect(() => {
    if (!selectedVariant || !warehouses?.length) return;
    const shelfWarehouse = warehouses.find((w) => w.id === 'wh-shelf');
    setAdjustWarehouseId(shelfWarehouse ? shelfWarehouse.id : warehouses[0].id);
  }, [selectedVariant, warehouses]);

  const warehouseOptions = useMemo(
    () => (warehouses || []).map((w) => ({ value: w.id, label: w.name || w.id })),
    [warehouses]
  );

  const variantTransferOptions = useMemo(() => {
    return (variants || []).map((v) => {
      const prod = products?.find((p) => p.id === v.productId);
      return {
        value: v.id,
        label: `${prod?.sku || v.id} — ${prod?.name || ''} (${v.name}) — الكمية: ${v.stockQuantity}`,
      };
    });
  }, [variants, products]);

  if (loadingProds || loadingVars) {
    return (
      <div className="workspace">
        <div className="skeleton" style={{ height: '40px' }} />
      </div>
    );
  }

  const variantsTableData =
    variants?.map((v) => {
      const prod = products?.find((p) => p.id === v.productId);
      const price = Number(v.price) || 0;
      const cost = Number(v.cost) || 0;
      return {
        id: v.id,
        productId: v.productId,
        sku: prod?.sku || v.barcode || '',
        name: prod?.name || v.name || '',
        variant: v.name,
        price,
        cost,
        stock: Number(v.stockQuantity) || 0,
        limit: prod?.minStockLimit || 10,
        margin: price > 0 && cost >= 0 ? (((price - cost) / price) * 100).toFixed(0) + '%' : '—',
      };
    }) || [];

  const openAddProduct = () => {
    setProductMode('add');
    setEditVariantId(null);
    setProductForm(emptyProductForm());
    setShowProductModal(true);
  };

  const openEditProduct = (row: (typeof variantsTableData)[0]) => {
    setProductMode('edit');
    setEditVariantId(row.id);
    setProductForm({
      sku: row.sku,
      name: row.name,
      variantName: row.variant,
      price: String(row.price),
      cost: String(row.cost),
      minStockLimit: String(row.limit),
      initialStock: '0',
      categoryName: '',
    });
    setShowProductModal(true);
  };

  const handleSaveProduct = () => {
    const price = parseFloat(productForm.price) || 0;
    const cost = parseFloat(productForm.cost) || 0;
    const minStockLimit = parseInt(productForm.minStockLimit, 10) || 10;
    const initialStock = parseInt(productForm.initialStock, 10) || 0;

    if (!productForm.sku.trim() || !productForm.name.trim()) {
      addNotification('WARNINGS', 'بيانات ناقصة', 'SKU واسم المنتج مطلوبان.');
      return;
    }

    if (productMode === 'add') {
      addProduct(
        {
          product: {
            sku: productForm.sku.trim(),
            name: productForm.name.trim(),
            categoryId: '',
            brandId: '',
            unitId: '',
            minStockLimit,
            categoryName: productForm.categoryName.trim() || undefined,
            initialStock,
          },
          variant: {
            name: productForm.variantName.trim() || 'Default',
            price,
            cost,
            initialStock,
          },
        },
        {
          onSuccess: () => {
            setShowProductModal(false);
            setProductForm(emptyProductForm());
          },
          onError: (err: any) =>
            addNotification('WARNINGS', 'فشل الإضافة', err?.message || 'تعذر حفظ المنتج.'),
        }
      );
      return;
    }

    if (!editVariantId) return;
    updateProduct(
      {
        variantId: editVariantId,
        payload: {
          product: {
            sku: productForm.sku.trim(),
            name: productForm.name.trim(),
            minStockLimit,
            categoryName: productForm.categoryName.trim() || undefined,
          },
          variant: {
            name: productForm.variantName.trim() || 'Default',
            price,
            cost,
          },
        },
      },
      {
        onSuccess: () => {
          setShowProductModal(false);
          setEditVariantId(null);
        },
        onError: (err: any) =>
          addNotification('WARNINGS', 'فشل التحديث', err?.message || 'تعذر حفظ المنتج.'),
      }
    );
  };

  const handleDeleteProduct = (variantId: string, label: string) => {
    if (!window.confirm(`هل تريد حذف "${label}" من المخزون؟`)) return;
    deleteVariant(variantId);
  };

  const handleAdjustStock = () => {
    if (!selectedVariant) return;
    const diff = parseInt(adjustQty, 10) || 0;

    if (loadingWarehouses) {
      addNotification('WARNINGS', 'جارٍ التحميل', 'جارٍ تحميل بيانات المستودعات، برجاء الانتظار لحظة وإعادة المحاولة.');
      return;
    }
    if (warehousesFailed) {
      addNotification('WARNINGS', 'تعذر تحميل المستودعات', 'حدث خطأ أثناء جلب بيانات المستودعات. يتم إعادة المحاولة الآن.');
      refetchWarehouses();
      return;
    }
    const warehouseId = adjustWarehouseId || warehouses?.[0]?.id;
    if (!warehouseId) {
      addNotification('WARNINGS', 'لا يوجد مستودع', 'لم يتم العثور على مستودع افتراضي. تواصل مع الدعم الفني.');
      return;
    }

    adjustStock(
      {
        variantId: selectedVariant.id,
        diff,
        type: adjustReason as 'SALE' | 'PURCHASE' | 'ADJUSTMENT' | 'TRANSFER',
        employeeId: currentEmployee.id,
        warehouseId,
      },
      {
        onSuccess: () => {
          setSelectedVariant(null);
          setAdjustQty('');
        },
        onError: (err: any) =>
          addNotification('WARNINGS', 'فشل التعديل', err?.message || 'تعذر تعديل المخزون.'),
      }
    );
  };

  const handleTransferStock = () => {
    const qty = parseInt(transferQty, 10) || 0;
    if (qty <= 0) {
      addNotification('WARNINGS', 'كمية غير صالحة', 'أدخل كمية أكبر من صفر.');
      return;
    }
    if (!transferSourceWh || !transferTargetWh || !transferVariantId) {
      addNotification('WARNINGS', 'بيانات ناقصة', 'اختر المستودعات والصنف.');
      return;
    }
    if (transferSourceWh === transferTargetWh) {
      addNotification('WARNINGS', 'مستودعات متطابقة', 'يجب اختيار مستودعين مختلفين.');
      return;
    }

    transferStock(
      {
        sourceWhId: transferSourceWh,
        targetWhId: transferTargetWh,
        variantId: transferVariantId,
        quantity: qty,
        employeeId: currentEmployee.id,
      },
      {
        onSuccess: () => {
          setShowTransferModal(false);
          setTransferQty('');
        },
      }
    );
  };

  const stockColumns = [
    { header: 'رمز السلعة (SKU)', accessor: 'sku' as const, key: 'sku', sortable: true },
    { header: 'اسم المنتج', accessor: 'name' as const, key: 'name', sortable: true },
    { header: 'الصنف والحجم', accessor: 'variant' as const, key: 'variant' },
    { header: 'الكمية المتاحة', accessor: 'stock' as const, key: 'stock', sortable: true },
    { header: 'الهامش %', accessor: 'margin' as const, key: 'margin' },
    {
      header: 'سعر الشراء',
      accessor: (row: any) => row.cost > 0 ? `${Number(row.cost).toFixed(2)} ج.م` : '—',
      key: 'cost',
      sortable: true,
    },
    {
      header: 'سعر البيع',
      accessor: (row: any) => row.price > 0 ? `${Number(row.price).toFixed(2)} ج.م` : '—',
      key: 'price',
      sortable: true,
    },
    {
      header: 'حالة المخزون',
      accessor: (row: any) => (
        <Badge variant={row.stock < row.limit ? 'danger' : 'success'}>
          {row.stock < row.limit ? `منخفض (<${row.limit})` : 'ممتاز'}
        </Badge>
      ),
      key: 'status',
    },
    {
      header: 'إجراءات',
      accessor: (row: any) => (
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          <Can permission={PERMISSIONS.INVENTORY_ADJUSTMENT}>
            <Button onClick={() => setSelectedVariant(row)} variant="secondary" size="sm">
              تعديل الكمية
            </Button>
          </Can>
          <Can permission={PERMISSIONS.PRODUCTS_EDIT}>
            <Button onClick={() => openEditProduct(row)} variant="secondary" size="sm">
              <Pencil size={12} /> تعديل
            </Button>
          </Can>
          <Can permission={PERMISSIONS.PRODUCTS_DELETE}>
            <Button
              onClick={() => handleDeleteProduct(row.id, row.name)}
              variant="secondary"
              size="sm"
              disabled={deletingVariant}
            >
              <Trash2 size={12} />
            </Button>
          </Can>
        </div>
      ),
      key: 'actions',
    },
  ];

  const batchColumns = [
    { header: 'رقم الشحنة (Batch)', accessor: 'batchNumber' as const, key: 'batchNumber' },
    {
      header: 'اسم المنتج',
      accessor: (row: any) => {
        const variant = variants?.find((v) => v.id === row.productVariantId);
        const prod = products?.find((p) => p.id === variant?.productId);
        return `${prod?.name || ''} - ${variant?.name || ''}`;
      },
      key: 'productName',
    },
    { header: 'كمية الشحنة', accessor: 'quantity' as const, key: 'quantity' },
    { header: 'تاريخ الانتهاء', accessor: 'expiryDate' as const, key: 'expiryDate', sortable: true },
    {
      header: 'تنبيه الأمان والانتهاء',
      accessor: (row: any) => {
        const daysLeft = Math.floor(
          (new Date(row.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );
        const isExpiring = daysLeft < 90;
        return (
          <Badge variant={isExpiring ? 'danger' : 'success'}>
            {isExpiring ? `تنتهي خلال ${daysLeft} يوم` : 'آمن ومستقر'}
          </Badge>
        );
      },
      key: 'warning',
    },
  ];

  const tabBtn = (id: MainTab, label: string, icon: React.ReactNode) => (
    <button
      type="button"
      onClick={() => setActiveTab(id)}
      className="btn-ghost"
      style={{
        fontSize: 'var(--font-size-sm)',
        padding: '6px 12px',
        borderBottom: activeTab === id ? '2px solid var(--color-primary)' : 'none',
        color: activeTab === id ? 'var(--color-primary)' : 'var(--color-text-secondary)',
        fontWeight: activeTab === id ? 'bold' : 'normal',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        whiteSpace: 'nowrap',
      }}
    >
      {icon} {label}
    </button>
  );

  return (
    <div className="workspace" style={{ overflowY: 'hidden', paddingBottom: 0 }}>
      <PageHeader
        title="رقابة جرد ومخازن الفروع"
        subtitle="إدارة وتتبع السلع، تواريخ الصلاحية، وحركات التحويل المخزني"
        actions={
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Can permission={PERMISSIONS.PRODUCTS_ADD}>
              <Button onClick={openAddProduct} variant="primary" size="sm">
                <PlusCircle size={14} /> إضافة كود SKU جديد
              </Button>
            </Can>
          </div>
        }
      />

      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--color-border)',
          gap: 'var(--spacing-1)',
          paddingBottom: '4px',
          overflowX: 'auto',
          flexWrap: 'nowrap',
        }}
      >
        {tabBtn('STOCK', 'أرصدة المخزون', <Layers size={16} />)}
        {tabBtn('BATCHES', 'الشحنات', <Calendar size={16} />)}
        {hasPermission(PERMISSIONS.PURCHASES_VIEW) && tabBtn('PURCHASES', 'فواتير الشراء', <ShoppingCart size={16} />)}
        {hasPermission(PERMISSIONS.INVENTORY_BATCH) && tabBtn('FIFO', 'FIFO / FEFO', <Settings2 size={16} />)}
        {hasPermission(PERMISSIONS.PRODUCTS_PRINT_BARCODE) && tabBtn('BARCODE', 'الباركود', <Barcode size={16} />)}
        {hasPermission(PERMISSIONS.PRODUCTS_IMPORT) && tabBtn('IMPORT', 'استيراد Excel', <Upload size={16} />)}
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginTop: '12px', overflowY: 'auto', paddingBottom: 'var(--spacing-6)', paddingRight: '4px' }}>
        {activeTab === 'STOCK' && (
          <DataTable
            data={variantsTableData}
            columns={stockColumns}
            rowKey="id"
            searchField="name"
            searchPlaceholder="ابحث باسم المنتج أو الـ SKU..."
          />
        )}

        {activeTab === 'BATCHES' && (
          <DataTable
            data={batches || []}
            columns={batchColumns}
            rowKey="id"
            searchField="batchNumber"
            searchPlaceholder="ابحث برقم الشحنة..."
          />
        )}

        {activeTab === 'PURCHASES' && <PurchaseInvoicePanel />}
        {activeTab === 'FIFO' && <FifoInventoryAdmin />}
        {activeTab === 'BARCODE' && <BarcodeAdminPanel />}
        {activeTab === 'IMPORT' && <ImportWizard />}
      </div>

      <Modal
        isOpen={selectedVariant !== null}
        onClose={() => setSelectedVariant(null)}
        title="تعديل كمية جرد المخزون"
        footer={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button onClick={() => setSelectedVariant(null)} variant="secondary">
              إلغاء
            </Button>
            <Button onClick={handleAdjustStock} disabled={adjusting || loadingWarehouses} variant="primary">
              {loadingWarehouses ? 'جارٍ التحميل...' : 'حفظ وتعديل الرصيد'}
            </Button>
          </div>
        }
      >
        {selectedVariant && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                fontSize: 'var(--font-size-xs)',
                padding: 'var(--spacing-2)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-bg)',
              }}
            >
              <div>
                المنتج: <strong>{selectedVariant.name}</strong>
              </div>
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
                { value: 'SALE', label: 'مرتجع مبيعات من عميل' },
              ]}
            />

            <Select
              label="المستودع"
              value={adjustWarehouseId}
              onChange={(e) => setAdjustWarehouseId(e.target.value)}
              options={warehouseOptions.length ? warehouseOptions : [{ value: '', label: 'لا توجد مستودعات' }]}
            />
            {adjustWarehouseId && adjustWarehouseId !== 'wh-shelf' && (
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-warning)' }}>
                تنبيه: هذا ليس مستودع البيع. الكمية المضافة هنا لن تظهر كمتاحة في شاشة نقاط البيع (POS) حتى يتم تحويلها لمستودع البيع.
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        isOpen={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        title="تحويل كميات المنتجات بين المستودعات"
        footer={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button onClick={() => setShowTransferModal(false)} variant="secondary">
              إلغاء
            </Button>
            <Button onClick={handleTransferStock} disabled={transferring} variant="primary">
              {transferring ? 'جاري النقل...' : 'تأكيد ونقل المخزون'}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
            نقل المنتجات بين المخازن الخلفية ورفوف العرض الأمامية لنقاط البيع.
          </div>

          <Select
            label="المستودع المصدر (من)"
            value={transferSourceWh}
            onChange={(e) => setTransferSourceWh(e.target.value)}
            options={warehouseOptions.length ? warehouseOptions : [{ value: '', label: 'لا توجد مستودعات' }]}
          />
          <Select
            label="المستودع المستهدف (إلى)"
            value={transferTargetWh}
            onChange={(e) => setTransferTargetWh(e.target.value)}
            options={warehouseOptions.length ? warehouseOptions : [{ value: '', label: 'لا توجد مستودعات' }]}
          />
          <Select
            label="اختر المنتج المراد نقله"
            value={transferVariantId}
            onChange={(e) => setTransferVariantId(e.target.value)}
            options={[
              { value: '', label: '— اختر صنفاً —' },
              ...variantTransferOptions,
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

      <Modal
        isOpen={showProductModal}
        onClose={() => setShowProductModal(false)}
        title={productMode === 'add' ? 'إضافة منتج جديد (SKU)' : 'تعديل بيانات المنتج'}
        footer={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button onClick={() => setShowProductModal(false)} variant="secondary">
              إلغاء
            </Button>
            <Button
              onClick={handleSaveProduct}
              disabled={addingProduct || updatingProduct}
              variant="primary"
            >
              {addingProduct || updatingProduct ? 'جاري الحفظ...' : 'حفظ المنتج'}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
          <Input
            label="رمز SKU"
            value={productForm.sku}
            onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })}
          />
          <Input
            label="اسم المنتج"
            value={productForm.name}
            onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
          />
          <Input
            label="اسم الصنف / الحجم"
            value={productForm.variantName}
            onChange={(e) => setProductForm({ ...productForm, variantName: e.target.value })}
          />
          <Input
            label="سعر البيع"
            value={productForm.price}
            onChange={(e) => setProductForm({ ...productForm, price: e.target.value })}
          />
          <Input
            label="سعر التكلفة"
            value={productForm.cost}
            onChange={(e) => setProductForm({ ...productForm, cost: e.target.value })}
          />
          <Input
            label="حد إعادة الطلب"
            value={productForm.minStockLimit}
            onChange={(e) => setProductForm({ ...productForm, minStockLimit: e.target.value })}
          />
          {productMode === 'add' && (
            <Input
              label="الرصيد الافتتاحي"
              value={productForm.initialStock}
              onChange={(e) => setProductForm({ ...productForm, initialStock: e.target.value })}
            />
          )}
          <Input
            label="التصنيف (اختياري)"
            value={productForm.categoryName}
            onChange={(e) => setProductForm({ ...productForm, categoryName: e.target.value })}
          />
        </div>
      </Modal>
    </div>
  );
};

export default Inventory;
