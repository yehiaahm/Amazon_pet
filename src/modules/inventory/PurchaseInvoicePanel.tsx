import React, { useEffect, useMemo, useState } from 'react';
import {
  useProducts,
  useVariants,
  usePurchaseInvoices,
  useCreatePurchaseInvoice,
  usePurchaseInvoice,
  useReturnPurchaseInvoice,
} from '../../core/hooks/useERPData';
import { useUIStore } from '../../core/stores/uiStore';
import type { PurchaseInvoice, PurchaseLineReceiptWarning } from '../../types/erp';
import { usePermissions } from '../../core/permissions/usePermissions';
import { PERMISSIONS } from '../../core/permissions/permissions';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import DatePicker from '../../components/ui/DatePicker';
import Badge from '../../components/ui/Badge';
import DataTable from '../../components/ui/DataTable';
import Modal from '../../components/ui/Modal';
import { formatMoney } from '../../core/utils/money';
import { formatLocalDate } from '../../core/utils/periodFinance';
import { Plus, Trash2, AlertTriangle, CheckCircle2, Undo2 } from 'lucide-react';

function invoiceReturnableQuantity(item: { quantity: number; quantityReturned?: number }): number {
  return Math.max(0, item.quantity - (item.quantityReturned ?? 0));
}

function invoiceHasReturnableItems(invoice: Pick<PurchaseInvoice, 'items'>): boolean {
  return (invoice.items || []).some((i) => invoiceReturnableQuantity(i) > 0);
}

/** Covers both itemized invoices (returnable line qty left) and lump-sum invoices (value left to credit). */
function invoiceIsReturnable(invoice: Pick<PurchaseInvoice, 'items' | 'grandTotal'>): boolean {
  if ((invoice.items || []).length > 0) {
    return invoiceHasReturnableItems(invoice);
  }
  return Number(invoice.grandTotal) > 0;
}

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
  const { hasPermission } = usePermissions();
  const canReturnPurchases = hasPermission(PERMISSIONS.PURCHASES_RETURN);
  const { data: products = [] } = useProducts();
  const { data: variants = [] } = useVariants();
  const { data: pastInvoices = [], refetch: refetchInvoices } = usePurchaseInvoices();
  const { mutateAsync: submitInvoice, isPending: submitting } = useCreatePurchaseInvoice();

  const [returnInvoiceId, setReturnInvoiceId] = useState<string | null>(null);
  const [returnQuantities, setReturnQuantities] = useState<Record<string, number>>({});
  const [returnAmount, setReturnAmount] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const { data: returnInvoice } = usePurchaseInvoice(returnInvoiceId);
  const { mutateAsync: submitReturn, isPending: returningInvoice } = useReturnPurchaseInvoice();
  const returnInvoiceHasItems = (returnInvoice?.items?.length ?? 0) > 0;

  useEffect(() => {
    if (!returnInvoiceId || !returnInvoice) return;
    if (returnInvoice.items && returnInvoice.items.length > 0) {
      const initial: Record<string, number> = {};
      returnInvoice.items.forEach((item) => {
        initial[item.id] = invoiceReturnableQuantity(item);
      });
      setReturnQuantities(initial);
    } else {
      setReturnAmount(String(Number(returnInvoice.grandTotal) || 0));
    }
  }, [returnInvoiceId, returnInvoice]);

  const closeReturnModal = () => {
    setReturnInvoiceId(null);
    setReturnQuantities({});
    setReturnAmount('');
    setReturnReason('');
  };

  const handleConfirmReturn = async () => {
    if (!returnInvoiceId) return;

    if (!returnInvoiceHasItems) {
      const amount = parseFloat(returnAmount) || 0;
      const remaining = Number(returnInvoice?.grandTotal) || 0;
      if (amount <= 0) {
        addNotification('WARNINGS', 'قيمة الإرجاع مطلوبة', 'أدخل قيمة أكبر من صفر.');
        return;
      }
      if (amount > remaining) {
        addNotification('WARNINGS', 'قيمة غير صحيحة', `قيمة الإرجاع تتجاوز المتبقي من الفاتورة (${formatMoney(remaining)}).`);
        return;
      }
      try {
        await submitReturn({ id: returnInvoiceId, amount, reason: returnReason || undefined });
        closeReturnModal();
        refetchInvoices();
      } catch (e: unknown) {
        addNotification('WARNINGS', 'فشل إرجاع الفاتورة', e instanceof Error ? e.message : 'خطأ غير معروف');
      }
      return;
    }

    const lines = Object.entries(returnQuantities)
      .filter(([, qty]) => qty > 0)
      .map(([purchaseInvoiceItemId, quantity]) => ({ purchaseInvoiceItemId, quantity }));

    if (lines.length === 0) {
      addNotification('WARNINGS', 'لا توجد كمية للإرجاع', 'اختر كمية سطر واحد على الأقل.');
      return;
    }

    try {
      await submitReturn({ id: returnInvoiceId, lines, reason: returnReason || undefined });
      closeReturnModal();
      refetchInvoices();
    } catch (e: unknown) {
      addNotification('WARNINGS', 'فشل إرجاع الفاتورة', e instanceof Error ? e.message : 'خطأ غير معروف');
    }
  };

  const todayLocal = useMemo(() => formatLocalDate(new Date()), []);
  const [invoiceNumber, setInvoiceNumber] = useState(() => `PI-${Date.now()}`);
  const [invoiceDate, setInvoiceDate] = useState(() => formatLocalDate(new Date()));
  const [supplierName, setSupplierName] = useState('');
  const [currency, setCurrency] = useState('EGP');
  const [vat, setVat] = useState('0');
  const [discount, setDiscount] = useState('0');
  const [shipping, setShipping] = useState('0');
  const [paymentChoice, setPaymentChoice] = useState<'CREDIT' | 'PAID_NOW'>('CREDIT');
  const [dueDate, setDueDate] = useState('');
  const [quickMode, setQuickMode] = useState(false);
  const [quickAmount, setQuickAmount] = useState('');
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
    if (quickMode) {
      return Math.max(0, parseFloat(quickAmount) || 0);
    }
    const sub = lines.reduce((acc, l) => {
      const q = parseInt(l.quantity, 10) || 0;
      const c = parseFloat(l.cost) || 0;
      return acc + q * c;
    }, 0);
    const v = parseFloat(vat) || 0;
    const d = parseFloat(discount) || 0;
    const sh = parseFloat(shipping) || 0;
    return Math.max(0, sub + v + sh - d);
  }, [quickMode, quickAmount, lines, vat, discount, shipping]);

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
    if (invoiceDate > todayLocal) {
      addNotification(
        'WARNINGS',
        'تاريخ الفاتورة في المستقبل',
        `تاريخ الفاتورة (${invoiceDate}) بعد النهاردة (${todayLocal}) — الفاتورة هتختفي من التقارير المالية لحد ما ييجي تاريخها. تأكد من التاريخ.`
      );
      return;
    }
    if (quickMode) {
      if (!(parseFloat(quickAmount) > 0)) {
        addNotification('WARNINGS', 'بيانات ناقصة', 'قيمة الفاتورة مطلوبة.');
        return;
      }
    } else {
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
    }

    if (paymentChoice === 'CREDIT' && dueDate && dueDate < invoiceDate) {
      addNotification(
        'WARNINGS',
        'تاريخ سداد غير منطقي',
        `تاريخ السداد (${dueDate}) قبل تاريخ الفاتورة (${invoiceDate}) — عدّل التاريخ.`
      );
      return;
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
      paymentType: 'LUMP_SUM',
      paymentStatus: paymentChoice === 'PAID_NOW' ? 'PAID' : 'UNPAID',
      paidAmount: paymentChoice === 'PAID_NOW' ? computedNet : 0,
      dueDate: paymentChoice === 'CREDIT' && dueDate ? dueDate : null,
      items: quickMode
        ? []
        : lines
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
        addNotification(
          'INVENTORY',
          'تم اعتماد فاتورة الشراء',
          quickMode ? 'اتسجلت الفاتورة على حساب المورد من غير تفاصيل بضاعة.' : 'دخلت الكميات إلى دفعات المخزون بنجاح.'
        );
        setLines([emptyLine()]);
        setInvoiceNumber(`PI-${Date.now()}`);
        setPaymentChoice('CREDIT');
        setDueDate('');
        setQuickAmount('');
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
    {
      header: 'الحالة',
      accessor: (r: { status: string; paymentStatus?: string | null; dueDate?: string | null }) => {
        if (r.status === 'RETURNED') return <Badge variant="danger">مرتجع بالكامل</Badge>;
        if (r.status === 'PARTIALLY_RETURNED') return <Badge variant="warning">مرتجع جزئياً</Badge>;
        if (r.paymentStatus === 'PAID') return <Badge variant="success">مدفوعة</Badge>;
        if (r.paymentStatus === 'PARTIALLY_PAID') return <Badge variant="info">مدفوعة جزئياً</Badge>;
        if (r.dueDate) return <Badge variant="warning">آجل — تستحق {r.dueDate.substring(0, 10)}</Badge>;
        return <Badge variant="gray">آجل — مفتوحة</Badge>;
      },
      key: 'paymentStatus',
    },
    ...(canReturnPurchases
      ? [{
          header: '',
          accessor: (r: PurchaseInvoice) => {
            const returnable =
              (r.status === 'COMPLETED' || r.status === 'PARTIALLY_RETURNED') && invoiceIsReturnable(r);
            return (
              <Button
                variant="secondary"
                size="sm"
                disabled={!returnable}
                onClick={() => setReturnInvoiceId(r.id)}
                title={returnable ? 'إرجاع بضاعة للمورد' : 'لا توجد قيمة قابلة للإرجاع'}
              >
                <Undo2 size={14} /> إرجاع
              </Button>
            );
          },
          key: 'actions',
        }]
      : []),
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

      <div className="card" style={{ padding: 'var(--spacing-3)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2)' }}>
        <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-text-secondary)' }}>
          طريقة التسجيل
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Button
            variant={!quickMode ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setQuickMode(false)}
          >
            تفصيلي — تسجيل البضاعة في المخزون
          </Button>
          <Button
            variant={quickMode ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setQuickMode(true)}
          >
            سريع — قيمة الفاتورة بس من غير تفاصيل بضاعة
          </Button>
        </div>
        {quickMode && (
          <p style={{ margin: 0, fontSize: '11px', color: 'var(--color-text-secondary)' }}>
            هيتسجل إن المورد ده له عندك المبلغ ده، من غير ما يتحرك رصيد المخزون.
          </p>
        )}
      </div>

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
        <DatePicker label="تاريخ الفاتورة" max={todayLocal} value={invoiceDate} onChange={setInvoiceDate} />
        <Input label="اسم المورد" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
        <Input label="العملة" value={currency} onChange={(e) => setCurrency(e.target.value)} />
        {quickMode ? (
          <Input
            label="قيمة الفاتورة"
            type="number"
            min={0}
            value={quickAmount}
            onChange={(e) => setQuickAmount(e.target.value)}
          />
        ) : (
          <>
            <Input label="ضريبة" type="number" value={vat} onChange={(e) => setVat(e.target.value)} />
            <Input label="خصم" type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} />
            <Input label="شحن" type="number" value={shipping} onChange={(e) => setShipping(e.target.value)} />
            <div style={{ alignSelf: 'end' }}>
              <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>الإجمالي</div>
              <strong style={{ fontSize: '1.2rem' }}>{formatMoney(computedNet)}</strong>
            </div>
          </>
        )}
      </div>

      <div className="card" style={{ padding: 'var(--spacing-3)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2)' }}>
        <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-text-secondary)' }}>
          السداد
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'end' }}>
          <Button
            variant={paymentChoice === 'CREDIT' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setPaymentChoice('CREDIT')}
          >
            آجل — هدفعها بعدين
          </Button>
          <Button
            variant={paymentChoice === 'PAID_NOW' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setPaymentChoice('PAID_NOW')}
          >
            دفعتها نقدي دلوقتي
          </Button>
          {paymentChoice === 'CREDIT' && (
            <DatePicker
              label="هتدفعها إمتى؟ (تاريخ الاستحقاق)"
              value={dueDate}
              onChange={setDueDate}
              containerStyle={{ maxWidth: '220px' }}
            />
          )}
        </div>
        {paymentChoice === 'PAID_NOW' && (
          <p style={{ margin: 0, fontSize: '11px', color: 'var(--color-text-secondary)' }}>
            هتتسجل الفاتورة "مسددة بالكامل" فورًا في حسابات الموردين.
          </p>
        )}
        {paymentChoice === 'CREDIT' && !dueDate && (
          <p style={{ margin: 0, fontSize: '11px', color: 'var(--color-text-secondary)' }}>
            لو سبتها فاضية، الفاتورة هتفضل "مفتوحة" تقدر تسددها أي وقت من غير موعد استحقاق مُلزم.
          </p>
        )}
      </div>

      {!quickMode && (
      <div className="card" style={{ padding: 'var(--spacing-3)' }}>
        <datalist id="purchase-invoice-sku-catalog">
          {skuOptions.map((o) => (
            <option key={o.sku} value={o.sku}>
              {o.sku} — {o.productName}
            </option>
          ))}
        </datalist>
        <div className="table-container">
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
                  <input
                    list="purchase-invoice-sku-catalog"
                    placeholder="اكتب اسم المنتج أو الـ SKU..."
                    value={line.sku}
                    onChange={(e) => applySkuToLine(line.key, e.target.value)}
                    style={{ width: '100%', minWidth: '140px' }}
                  />
                  {line.sku && !skuOptions.some((o) => o.sku === line.sku) && (
                    <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                      منتج جديد — هيتسجل تلقائيًا في الكتالوج
                    </div>
                  )}
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
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={() => setLines((prev) => [...prev, emptyLine()])}>
            <Plus size={14} /> إضافة بند
          </Button>
        </div>
      </div>
      )}

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <Button variant="primary" onClick={() => void handleSubmit()} disabled={submitting}>
          <CheckCircle2 size={14} /> {submitting ? 'جاري الاعتماد...' : quickMode ? 'اعتماد الفاتورة' : 'اعتماد الفاتورة ودخول المخزون'}
        </Button>
      </div>

      <div>
        <h4 style={{ marginBottom: '8px' }}>آخر فواتير الشراء</h4>
        <DataTable
          columns={historyColumns as any}
          data={pastInvoices || []}
          rowKey="id"
        />
      </div>

      <Modal
        isOpen={returnInvoiceId !== null}
        onClose={() => { if (!returningInvoice) closeReturnModal(); }}
        title={`إرجاع بضاعة — فاتورة ${returnInvoice?.invoiceNumber ?? ''}`}
        footer={
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Button onClick={closeReturnModal} variant="secondary" disabled={returningInvoice}>
              إلغاء
            </Button>
            <Button onClick={() => void handleConfirmReturn()} variant="danger" disabled={returningInvoice}>
              {returningInvoice ? 'جارٍ الإرجاع...' : 'تأكيد الإرجاع'}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)', fontSize: 'var(--font-size-sm)', direction: 'rtl' }}>
          {returnInvoiceHasItems ? (
            <>
              <p>اختر الكميات المراد إرجاعها للمورد <strong>{returnInvoice?.supplierName}</strong></p>
              {(returnInvoice?.items || []).map((item) => {
                const maxQ = invoiceReturnableQuantity(item);
                if (maxQ <= 0) return null;
                return (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '8px',
                      padding: 'var(--spacing-2)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-md)',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 'bold' }}>{item.productName}</div>
                      <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)' }}>
                        التكلفة: {formatMoney(item.cost)} — متاح للإرجاع: {maxQ}
                      </div>
                    </div>
                    <Input
                      type="number"
                      min={0}
                      max={maxQ}
                      value={String(returnQuantities[item.id] ?? 0)}
                      onChange={(e) => {
                        const v = Math.max(0, Math.min(maxQ, parseInt(e.target.value, 10) || 0));
                        setReturnQuantities((prev) => ({ ...prev, [item.id]: v }));
                      }}
                      style={{ width: '72px' }}
                    />
                  </div>
                );
              })}
            </>
          ) : (
            <>
              <p>
                هذه فاتورة بقيمة إجمالية بدون تفصيل بضاعة — أدخل قيمة المبلغ المراد إرجاعه من إجمالي{' '}
                <strong>{formatMoney(Number(returnInvoice?.grandTotal) || 0)}</strong> للمورد{' '}
                <strong>{returnInvoice?.supplierName}</strong>.
              </p>
              <Input
                label="قيمة الإرجاع"
                type="number"
                min={0}
                max={Number(returnInvoice?.grandTotal) || 0}
                value={returnAmount}
                onChange={(e) => setReturnAmount(e.target.value)}
              />
            </>
          )}
          <Input
            label="سبب الإرجاع (اختياري)"
            value={returnReason}
            onChange={(e) => setReturnReason(e.target.value)}
          />
          {returnInvoice && (
            <div style={{
              padding: 'var(--spacing-2)',
              background: 'var(--color-danger-light)',
              color: 'var(--color-danger)',
              borderRadius: 'var(--radius-md)',
              fontWeight: 'bold'
            }}>
              تقدير قيمة المرتجع:{' '}
              {formatMoney(
                returnInvoiceHasItems
                  ? (returnInvoice.items || [])
                      .reduce((acc, i) => acc + (returnQuantities[i.id] ?? 0) * (Number(i.cost) || 0), 0)
                  : (parseFloat(returnAmount) || 0)
              )}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default PurchaseInvoicePanel;
