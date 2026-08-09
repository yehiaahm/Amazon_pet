import React, { useMemo, useState } from 'react';
import {
  useProducts,
  useVariants,
  usePurchaseInvoices,
  useCreatePurchaseInvoice,
} from '../../core/hooks/useERPData';
import { useUIStore } from '../../core/stores/uiStore';
import type { PurchaseLineReceiptWarning } from '../../types/erp';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Badge from '../../components/ui/Badge';
import DataTable from '../../components/ui/DataTable';
import { formatMoney } from '../../core/utils/money';
import { Plus, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react';

export type DraftPurchaseLine = {
  key: string;
  productName: string;
  sku: string;
  cost: string;
  price: string;
  quantity: string;
  expiryDate: string;
  trackExpiry: boolean;
};

const emptyLine = (): DraftPurchaseLine => ({
  key: `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  productName: '',
  sku: '',
  cost: '',
  price: '',
  quantity: '1',
  expiryDate: '',
  trackExpiry: true,
});

const PurchaseInvoicePanel: React.FC = () => {
  const currentEmployee = useUIStore((s) => s.currentEmployee)!;
  const addNotification = useUIStore((s) => s.addNotification);
  const { data: products = [] } = useProducts();
  const { data: variants = [] } = useVariants();
  const { data: pastInvoices = [], refetch: refetchInvoices } = usePurchaseInvoices();
  const { mutateAsync: submitInvoice, isPending: submitting } = useCreatePurchaseInvoice();

  const [invoiceNumber, setInvoiceNumber] = useState(() => `PI-${Date.now()}`);
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [supplierName, setSupplierName] = useState('');
  const [currency, setCurrency] = useState('EGP');
  const [vat, setVat] = useState('0');
  const [discount, setDiscount] = useState('0');
  const [shipping, setShipping] = useState('0');
  const [lines, setLines] = useState<DraftPurchaseLine[]>([emptyLine()]);
  const [receiptWarnings, setReceiptWarnings] = useState<PurchaseLineReceiptWarning[]>([]);
  const [lastSavedInvoiceId, setLastSavedInvoiceId] = useState<string | null>(null);

  const skuOptions = useMemo(() => {
    if (!products || !variants) return [];
    return products.map((p) => {
      const v = variants.find((x) => x.productId === p.id);
      return {
        sku: p.sku,
        productName: p.name,
        variantId: v?.id,
        cost: v?.cost ?? 0,
        price: v?.price ?? 0,
      };
    });
  }, [products, variants]);

  const computedNet = useMemo(() => {
    const sub = lines.reduce((acc, l) => {
      const q = parseInt(l.quantity, 10) || 0;
      const c = parseFloat(l.cost) || 0;
      return acc + q * c;
    }, 0);
    const v = parseFloat(vat) || 0;
    const d = parseFloat(discount) || 0;
    const sh = parseFloat(shipping) || 0;
    return Math.max(0, sub + v + sh - d);
  }, [lines, vat, discount, shipping]);

  const updateLine = (key: string, patch: Partial<DraftPurchaseLine>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const applySkuToLine = (key: string, sku: string) => {
    const match = skuOptions.find((o) => o.sku === sku);
    if (!match) {
      updateLine(key, { sku });
      return;
    }
    updateLine(key, {
      sku: match.sku,
      productName: match.productName,
      cost: String(match.cost),
      price: String(match.price),
    });
  };

  const handleSubmit = async () => {
    setReceiptWarnings([]);
    if (!supplierName.trim()) {
      addNotification('WARNINGS', 'بيانات ناقصة', 'اسم المورد مطلوب.');
      return;
    }
    if (lines.length === 0) {
      addNotification('WARNINGS', 'بيانات ناقصة', 'أضف بنداً واحداً على الأقل.');
      return;
    }

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const qty = parseInt(l.quantity, 10) || 0;
      if (qty <= 0) continue;
      if (!l.sku.trim()) {
        addNotification('WARNINGS', 'SKU مطلوب', `البند ${i + 1}: أدخل SKU أو اختر منتجاً.`);
        return;
      }
      if (l.trackExpiry && !l.expiryDate) {
        addNotification(
          'WARNINGS',
          'تاريخ الانتهاء',
          `البند ${i + 1} (${l.sku}): تاريخ الانتهاء مطلوب لدخول المخزون كدفعة FEFO.`
        );
        return;
      }
    }

    const payload = {
      invoiceNumber,
      invoiceDate,
      supplierName,
      currency,
      vat: parseFloat(vat) || 0,
      discount: parseFloat(discount) || 0,
      shipping: parseFloat(shipping) || 0,
      netTotal: computedNet,
      grandTotal: computedNet,
      items: lines
        .filter((l) => (parseInt(l.quantity, 10) || 0) > 0)
        .map((l) => ({
          productName: l.productName || l.sku,
          sku: l.sku.trim(),
          cost: parseFloat(l.cost) || 0,
          price: parseFloat(l.price) || 0,
          quantity: parseInt(l.quantity, 10) || 0,
          expiryDate: l.trackExpiry && l.expiryDate ? l.expiryDate : null,
        })),
    };

    try {
      const result = await submitInvoice({
        invoice: payload,
        employeeId: currentEmployee.id,
      });
      setLastSavedInvoiceId(result.invoice.id);
      setReceiptWarnings(result.warnings || []);
      refetchInvoices();

      if (result.warnings?.length) {
        addNotification(
          'WARNINGS',
          'تم حفظ الفاتورة مع تحذيرات',
          `${result.warnings.length} سطر لم يدخل المخزون — راجع التفاصيل أدناه.`
        );
      } else {
        addNotification('INVENTORY', 'تم اعتماد فاتورة الشراء', 'دخلت الكميات إلى دفعات المخزون بنجاح.');
        setLines([emptyLine()]);
        setInvoiceNumber(`PI-${Date.now()}`);
      }
    } catch (e: unknown) {
      addNotification(
        'WARNINGS',
        'فشل اعتماد الفاتورة',
        e instanceof Error ? e.message : 'خطأ غير معروف'
      );
    }
  };

  const historyColumns = [
    { header: 'رقم الفاتورة', accessor: 'invoiceNumber' as const, key: 'invoiceNumber' },
    { header: 'التاريخ', accessor: 'invoiceDate' as const, key: 'invoiceDate' },
    { header: 'المورد', accessor: 'supplierName' as const, key: 'supplierName' },
    {
      header: 'الإجمالي',
      accessor: (r: { grandTotal: number; currency: string }) =>
        formatMoney(Number(r.grandTotal)) + ' ' + r.currency,
      key: 'grandTotal',
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)', direction: 'rtl' }}>
      <div>
        <h3 style={{ margin: 0 }}>فاتورة شراء — استلام مخزون ودفعات (FIFO/FEFO)</h3>
        <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
          إدخال بيانات فاتورة المورد يدويًا لإنشاء دفعات المخزون.
        </p>
      </div>

      {receiptWarnings.length > 0 && (
        <div
          style={{
            border: '2px solid var(--color-warning)',
            background: 'var(--color-warning-light, #fff8e6)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--spacing-3)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <AlertTriangle size={18} color="var(--color-warning)" />
            <strong>تحذيرات استلام المخزون — لم تُنشأ دفعات للأسطر التالية</strong>
          </div>
          <ul style={{ margin: 0, paddingRight: '20px', lineHeight: 1.8 }}>
            {receiptWarnings.map((w, i) => (
              <li key={`${w.purchaseInvoiceItemId}-${i}`}>
                <Badge variant="warning">{w.code}</Badge> {w.messageAr}
              </li>
            ))}
          </ul>
          {lastSavedInvoiceId && (
            <p style={{ fontSize: '11px', marginTop: '8px', color: 'var(--color-text-secondary)' }}>
              معرّف الفاتورة المحفوظة: {lastSavedInvoiceId}
            </p>
          )}
        </div>
      )}

      <div
        className="card"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: '12px',
          padding: 'var(--spacing-3)',
        }}
      >
        <Input label="رقم الفاتورة" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
        <Input label="تاريخ الفاتورة" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
        <Input label="اسم المورد" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
        <Input label="العملة" value={currency} onChange={(e) => setCurrency(e.target.value)} />
        <Input label="ضريبة" type="number" value={vat} onChange={(e) => setVat(e.target.value)} />
        <Input label="خصم" type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} />
        <Input label="شحن" type="number" value={shipping} onChange={(e) => setShipping(e.target.value)} />
        <div style={{ alignSelf: 'end' }}>
          <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>الإجمالي</div>
          <strong style={{ fontSize: '1.2rem' }}>{formatMoney(computedNet)}</strong>
        </div>
      </div>

      <div className="card" style={{ padding: 'var(--spacing-3)', overflowX: 'auto' }}>
        <table className="erp-table" style={{ width: '100%', minWidth: '880px' }}>
          <thead>
            <tr>
              <th>المنتج / SKU</th>
              <th>اسم العرض</th>
              <th>التكلفة</th>
              <th>سعر البيع</th>
              <th>الكمية</th>
              <th>انتهاء</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.key}>
                <td>
                  <select
                    value={line.sku}
                    onChange={(e) => applySkuToLine(line.key, e.target.value)}
                    style={{ width: '100%', minWidth: '120px' }}
                  >
                    <option value="">— اختر SKU —</option>
                    {skuOptions.map((o) => (
                      <option key={o.sku} value={o.sku}>
                        {o.sku} — {o.productName}
                      </option>
                    ))}
                  </select>
                  <input
                    placeholder="أو اكتب SKU"
                    value={line.sku}
                    onChange={(e) => updateLine(line.key, { sku: e.target.value })}
                    style={{ width: '100%', marginTop: '4px', fontSize: '11px' }}
                  />
                </td>
                <td>
                  <input
                    value={line.productName}
                    onChange={(e) => updateLine(line.key, { productName: e.target.value })}
                    style={{ width: '100%' }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    value={line.cost}
                    onChange={(e) => updateLine(line.key, { cost: e.target.value })}
                    style={{ width: '72px' }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    value={line.price}
                    onChange={(e) => updateLine(line.key, { price: e.target.value })}
                    style={{ width: '72px' }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    value={line.quantity}
                    onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                    style={{ width: '56px' }}
                  />
                </td>
                <td>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px' }}>
                    <input
                      type="checkbox"
                      checked={line.trackExpiry}
                      onChange={(e) => updateLine(line.key, { trackExpiry: e.target.checked })}
                    />
                    FEFO
                  </label>
                  <input
                    type="date"
                    disabled={!line.trackExpiry}
                    value={line.expiryDate}
                    onChange={(e) => updateLine(line.key, { expiryDate: e.target.value })}
                    style={{ width: '100%', marginTop: '4px' }}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                    disabled={lines.length <= 1}
                    title="حذف السطر"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={() => setLines((prev) => [...prev, emptyLine()])}>
            <Plus size={14} /> إضافة بند
          </Button>
          <Button variant="primary" onClick={() => void handleSubmit()} disabled={submitting}>
            <CheckCircle2 size={14} /> {submitting ? 'جاري الاعتماد...' : 'اعتماد الفاتورة ودخول المخزون'}
          </Button>
        </div>
      </div>

      <div>
        <h4 style={{ marginBottom: '8px' }}>آخر فواتير الشراء</h4>
        <DataTable
          columns={historyColumns as any}
          data={pastInvoices || []}
          rowKey="id"
        />
      </div>
    </div>
  );
};

export default PurchaseInvoicePanel;
