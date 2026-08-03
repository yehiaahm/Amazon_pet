import React, { useState, useMemo } from 'react';
import type { Product, ProductVariant, PurchaseInvoice } from '../../types/erp';
import {
  matchProductInCatalog,
  saveSupplierAlias,
  type MatchStatus,
} from '../../core/utils/productMatcher';
import { formatMoney } from '../../core/utils/money';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Badge from '../../components/ui/Badge';
import {
  AlertTriangle,
  Package,
  Layers,
  FileSearch,
  Eye,
  Info,
} from 'lucide-react';

export type ReviewLineItem = {
  key: string;
  productName: string;
  barcode?: string;
  sku: string;
  unitCost: number; // Unit purchase price
  price: number; // Selling price
  quantity: number;
  unitName: string; // e.g. Carton, Box, Piece
  conversionFactor: number; // e.g. 12 pieces per carton
  lineTotal: number;
  lotNumber: string;
  expiryDate: string;
  confidenceName?: number; // 0.0 to 1.0
  confidenceQty?: number;
  confidenceCost?: number;
  confidencePrice?: number;
  // Match state
  matchStatus: MatchStatus;
  matchedProductId?: string;
  matchedVariantId?: string;
  isNewProduct: boolean;
};

interface PurchaseInvoiceReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentFileUrl?: string; // Image base64 or blob URL
  mimeType?: string;
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string;
  currency: string;
  vat: number;
  discount: number;
  shipping: number;
  items: ReviewLineItem[];
  products: Product[];
  variants: ProductVariant[];
  pastInvoices: PurchaseInvoice[];
  onConfirm: (payload: {
    supplierName: string;
    invoiceNumber: string;
    invoiceDate: string;
    currency: string;
    vat: number;
    discount: number;
    shipping: number;
    netTotal: number;
    grandTotal: number;
    items: ReviewLineItem[];
    rawOcrJson?: string;
  }) => Promise<void>;
  isSubmitting?: boolean;
}

export const PurchaseInvoiceReviewModal: React.FC<PurchaseInvoiceReviewModalProps> = ({
  isOpen,
  onClose,
  documentFileUrl,
  mimeType,
  supplierName: initialSupplier,
  invoiceNumber: initialInvoiceNo,
  invoiceDate: initialInvoiceDate,
  currency: initialCurrency,
  vat: initialVat,
  discount: initialDiscount,
  shipping: initialShipping,
  items: initialItems,
  products,
  variants,
  pastInvoices,
  onConfirm,
  isSubmitting = false,
}) => {
  const [activeTab, setActiveTab] = useState<'REVIEW' | 'IMPACT'>('REVIEW');

  // Editable header state
  const [supplierName, setSupplierName] = useState(initialSupplier);
  const [invoiceNumber, setInvoiceNumber] = useState(initialInvoiceNo);
  const [invoiceDate, setInvoiceDate] = useState(initialInvoiceDate);
  const [currency, setCurrency] = useState(initialCurrency || 'EGP');
  const [vat, setVat] = useState(String(initialVat || 0));
  const [discount, setDiscount] = useState(String(initialDiscount || 0));
  const [shipping, setShipping] = useState(String(initialShipping || 0));

  // Editable items state
  const [lines, setLines] = useState<ReviewLineItem[]>(() => {
    return initialItems.map((item) => {
      const match = matchProductInCatalog(
        { productName: item.productName, barcode: item.barcode, sku: item.sku },
        products,
        variants,
        initialSupplier
      );

      const matchedP = match.matchedProduct;
      const matchedV = match.matchedVariant;

      return {
        ...item,
        sku: item.sku || matchedP?.sku || `SKU-${Date.now()}`,
        barcode: item.barcode || matchedP?.sku || '',
        price: item.price || matchedV?.price || 0,
        unitCost: item.unitCost || matchedV?.cost || 0,
        unitName: item.unitName || 'قطعة',
        conversionFactor: item.conversionFactor || 1,
        matchStatus: match.status,
        matchedProductId: matchedP?.id,
        matchedVariantId: matchedV?.id,
        isNewProduct: match.status === 'UNMATCHED',
      };
    });
  });

  // Check Duplicate Invoice
  const duplicateInvoice = useMemo(() => {
    if (!invoiceNumber.trim()) return null;
    return pastInvoices.find(
      (inv) =>
        inv.invoiceNumber.trim().toLowerCase() === invoiceNumber.trim().toLowerCase() ||
        (inv.supplierName.trim().toLowerCase() === supplierName.trim().toLowerCase() &&
          inv.invoiceNumber.trim().toLowerCase() === invoiceNumber.trim().toLowerCase())
    );
  }, [invoiceNumber, supplierName, pastInvoices]);

  // Recalculate Subtotal and Grand Total
  const computedSubtotal = useMemo(() => {
    return lines.reduce((acc, l) => acc + (l.quantity || 0) * (l.unitCost || 0), 0);
  }, [lines]);

  const computedGrandTotal = useMemo(() => {
    const v = parseFloat(vat) || 0;
    const d = parseFloat(discount) || 0;
    const sh = parseFloat(shipping) || 0;
    return Math.max(0, computedSubtotal + v + sh - d);
  }, [computedSubtotal, vat, discount, shipping]);

  // Math Validation Discrepancy
  const mathDiscrepancy = useMemo(() => {
    const sumLineTotals = lines.reduce((acc, l) => acc + (l.lineTotal || l.quantity * l.unitCost), 0);
    const expected = sumLineTotals + (parseFloat(vat) || 0) + (parseFloat(shipping) || 0) - (parseFloat(discount) || 0);
    const diff = Math.abs(expected - computedGrandTotal);
    return diff > 1.0 ? { expected, sumLineTotals, diff } : null;
  }, [lines, vat, discount, shipping, computedGrandTotal]);

  const updateLine = (key: string, patch: Partial<ReviewLineItem>) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const updated = { ...l, ...patch };
        // Recalculate line total if cost or qty changed
        if ('unitCost' in patch || 'quantity' in patch || 'conversionFactor' in patch) {
          updated.lineTotal = updated.quantity * updated.unitCost;
        }
        return updated;
      })
    );
  };

  const handleSelectCatalogProduct = (lineKey: string, productId: string) => {
    const selectedP = products.find((p) => p.id === productId);
    const selectedV = variants.find((v) => v.productId === productId);
    if (!selectedP) return;

    updateLine(lineKey, {
      matchedProductId: selectedP.id,
      matchedVariantId: selectedV?.id,
      sku: selectedP.sku,
      productName: selectedP.name,
      price: selectedV?.price || 0,
      unitCost: selectedV?.cost || 0,
      matchStatus: 'MATCHED_SKU',
      isNewProduct: false,
    });

    // Save alias memory
    const line = lines.find((l) => l.key === lineKey);
    if (line && supplierName) {
      saveSupplierAlias(supplierName, line.productName, selectedP.sku);
    }
  };

  const renderConfidenceBadge = (score?: number) => {
    if (score == null) return null;
    const pct = Math.round(score * 100);
    let colorStyle = { backgroundColor: '#e6f4ea', color: '#137333', border: '1px solid #ceead6' }; // Green
    if (pct < 70) {
      colorStyle = { backgroundColor: '#fce8e6', color: '#c5221f', border: '1px solid #fad2cf' }; // Red
    } else if (pct < 90) {
      colorStyle = { backgroundColor: '#fef7e0', color: '#b06000', border: '1px solid #feefc3' }; // Yellow
    }

    return (
      <span
        style={{
          fontSize: '10px',
          padding: '2px 6px',
          borderRadius: '4px',
          fontWeight: 'bold',
          marginLeft: '4px',
          ...colorStyle,
        }}
        title={`نسبة دقة القراءة: ${pct}%`}
      >
        {pct}%
      </span>
    );
  };

  const renderMatchBadge = (status: MatchStatus, score: number) => {
    switch (status) {
      case 'MATCHED_BARCODE':
        return <Badge variant="success">مطابق بالباركود</Badge>;
      case 'MATCHED_SKU':
        return <Badge variant="success">مطابق بـ SKU</Badge>;
      case 'MATCHED_ALIAS':
        return <Badge variant="info">مطابق بذاكرة المورد</Badge>;
      case 'MATCHED_FUZZY':
        return <Badge variant="warning">{`مطابق بالاسم (${Math.round(score * 100)}%)`}</Badge>;
      case 'UNMATCHED':
      default:
        return <Badge variant="danger">منتج جديد بالكتالوج</Badge>;
    }
  };

  const handleConfirmSubmit = async () => {
    const payload = {
      supplierName,
      invoiceNumber,
      invoiceDate,
      currency,
      vat: parseFloat(vat) || 0,
      discount: parseFloat(discount) || 0,
      shipping: parseFloat(shipping) || 0,
      netTotal: computedSubtotal,
      grandTotal: computedGrandTotal,
      items: lines,
    };
    await onConfirm(payload);
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="شاشة مراجعة فاتورة الشراء وتدقيق القراءة الذكية (Review Screen)"
      maxWidth="1280px"
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', fontSize: '13px' }}>
            <span>
              إجمالي الأصناف: <strong>{lines.length}</strong>
            </span>
            <span>
              إجمالي الفاتورة: <strong style={{ color: 'var(--color-primary)', fontSize: '1.1rem' }}>{formatMoney(computedGrandTotal)} {currency}</strong>
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
              إلغاء
            </Button>
            <Button variant="primary" onClick={handleConfirmSubmit} disabled={isSubmitting || !!duplicateInvoice}>
              {isSubmitting ? 'جاري الاعتماد وإنشاء الدفعات...' : 'اعتماد الفاتورة ودخول المخزون (FIFO)'}
            </Button>
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', direction: 'rtl' }}>
        {/* Navigation Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', gap: '12px' }}>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setActiveTab('REVIEW')}
            style={{
              padding: '8px 16px',
              borderBottom: activeTab === 'REVIEW' ? '2px solid var(--color-primary)' : 'none',
              fontWeight: activeTab === 'REVIEW' ? 'bold' : 'normal',
              color: activeTab === 'REVIEW' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <FileSearch size={16} /> تدقيق البيانات ومطابقة المنتجات
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setActiveTab('IMPACT')}
            style={{
              padding: '8px 16px',
              borderBottom: activeTab === 'IMPACT' ? '2px solid var(--color-primary)' : 'none',
              fontWeight: activeTab === 'IMPACT' ? 'bold' : 'normal',
              color: activeTab === 'IMPACT' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Layers size={16} /> معاينة أثر المخزون والدفعات قبل الاعتماد (Inventory Impact Preview)
          </button>
        </div>

        {/* Duplicate Invoice Alert Banner */}
        {duplicateInvoice && (
          <div
            style={{
              border: '2px solid #c5221f',
              backgroundColor: '#fce8e6',
              borderRadius: '8px',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
            }}
          >
            <AlertTriangle size={20} color="#c5221f" style={{ marginTop: '2px' }} />
            <div>
              <strong style={{ color: '#c5221f', fontSize: '14px' }}>
                ⚠ تحذير: فاتورة مكررة مسجلة مسبقاً بالنظام (Duplicate Invoice Detected)
              </strong>
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#5f6368' }}>
                تم استيراد فاتورة من المورد <strong>{duplicateInvoice.supplierName}</strong> بنفس رقم الفاتورة (
                <strong>{duplicateInvoice.invoiceNumber}</strong>) بتاريخ {duplicateInvoice.invoiceDate} وإجمالي{' '}
                {formatMoney(Number(duplicateInvoice.grandTotal))} {duplicateInvoice.currency}.
                يرجى التأكد لمنع دخول الكميات والمخزون مرتين.
              </p>
            </div>
          </div>
        )}

        {/* Math Validation Discrepancy Banner */}
        {mathDiscrepancy && (
          <div
            style={{
              border: '1px solid #f9ab00',
              backgroundColor: '#fef7e0',
              borderRadius: '8px',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '12px',
            }}
          >
            <Info size={18} color="#b06000" />
            <div>
              <strong style={{ color: '#b06000' }}>تنبيه صحة المعادلات والضرائب:</strong> مجموع البنود المستخرجة (
              {formatMoney(mathDiscrepancy.sumLineTotals)}) مع الضريبة والشحن والخصم يعطي إجمالي مفترض (
              {formatMoney(mathDiscrepancy.expected)}) بفارق بسيط عن الإجمالي النهائي المعروض.
            </div>
          </div>
        )}

        {/* Main Content Area based on Tab */}
        {activeTab === 'REVIEW' ? (
          <div style={{ display: 'grid', gridTemplateColumns: documentFileUrl ? '1fr 2fr' : '1fr', gap: '16px' }}>
            {/* Document Viewer Side-Pane (If preview available) */}
            {documentFileUrl && (
              <div
                style={{
                  border: '1px solid var(--color-border)',
                  borderRadius: '8px',
                  backgroundColor: '#1e1e1e',
                  padding: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  maxHeight: '650px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    paddingBottom: '8px',
                    borderBottom: '1px solid #333',
                    marginBottom: '8px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span><Eye size={14} style={{ verticalAlign: 'middle' }} /> معاينة مستند الفاتورة (Image / PDF)</span>
                  <a href={documentFileUrl} target="_blank" rel="noreferrer" style={{ color: '#8ab4f8', fontSize: '11px' }}>
                    فتح بمستعرض مستقل ↗
                  </a>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                  {mimeType?.includes('pdf') ? (
                    <iframe
                      src={documentFileUrl}
                      title="Invoice PDF Preview"
                      style={{ width: '100%', height: '580px', border: 'none' }}
                    />
                  ) : (
                    <img
                      src={documentFileUrl}
                      alt="Invoice Document"
                      style={{ maxWidth: '100%', maxHeight: '580px', objectFit: 'contain', borderRadius: '4px' }}
                    />
                  )}
                </div>
              </div>
            )}

            {/* Extracted Data & Editing Section */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Header Info Form */}
              <div
                className="card"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                  gap: '10px',
                  padding: '12px',
                }}
              >
                <Input label="اسم المورد" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
                <Input label="رقم الفاتورة" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
                <Input label="تاريخ الفاتورة" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
                <Input label="العملة" value={currency} onChange={(e) => setCurrency(e.target.value)} />
                <Input label="ضريبة (VAT)" type="number" value={vat} onChange={(e) => setVat(e.target.value)} />
                <Input label="خصم" type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} />
                <Input label="مصاريف شحن" type="number" value={shipping} onChange={(e) => setShipping(e.target.value)} />
              </div>

              {/* Items Table */}
              <div className="card" style={{ padding: '12px', overflowX: 'auto', maxHeight: '480px', overflowY: 'auto' }}>
                <table className="erp-table" style={{ width: '100%', minWidth: '950px', fontSize: '12px' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '35px' }}>#</th>
                      <th>المنتج المستخرج بالـ OCR</th>
                      <th>مطابقة الكتالوج</th>
                      <th style={{ width: '70px' }}>الكمية</th>
                      <th style={{ width: '110px' }}>التعبئة والوحدة</th>
                      <th style={{ width: '85px' }}>سعر الشراء</th>
                      <th style={{ width: '85px' }}>سعر البيع</th>
                      <th>رقم التشغيلة / الانتهاء</th>
                      <th>إجمالي السطر</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, idx) => {
                      const matchedVariant = variants.find((v) => v.id === line.matchedVariantId);
                      const currentCost = matchedVariant?.cost ?? 0;
                      const isCostIncreased = line.unitCost > currentCost && currentCost > 0;
                      const costDiffPct = currentCost > 0 ? (((line.unitCost - currentCost) / currentCost) * 100).toFixed(1) : '0';

                      // Suggested selling price based on 35% margin
                      const suggestedPrice = Math.ceil(line.unitCost * 1.35);

                      return (
                        <tr key={line.key}>
                          <td>{idx + 1}</td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <div style={{ display: 'flex', alignItems: 'center' }}>
                                <input
                                  style={{ fontWeight: '500', width: '100%' }}
                                  value={line.productName}
                                  onChange={(e) => updateLine(line.key, { productName: e.target.value })}
                                />
                                {renderConfidenceBadge(line.confidenceName)}
                              </div>
                              <span style={{ fontSize: '10px', color: 'var(--color-text-secondary)' }}>
                                SKU: {line.sku || 'بدون'} | Barcode: {line.barcode || 'بدون'}
                              </span>
                            </div>
                          </td>

                          {/* Catalog Match Selector */}
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              {renderMatchBadge(line.matchStatus, line.confidenceName || 0)}
                              <select
                                style={{ fontSize: '11px', padding: '2px 4px' }}
                                value={line.matchedProductId || ''}
                                onChange={(e) => handleSelectCatalogProduct(line.key, e.target.value)}
                              >
                                <option value="">-- اختر منتج من الكتالوج --</option>
                                {products.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.sku} | {p.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </td>

                          {/* Quantity */}
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                              <input
                                type="number"
                                min={1}
                                style={{ width: '50px', textAlign: 'center' }}
                                value={line.quantity}
                                onChange={(e) => updateLine(line.key, { quantity: parseInt(e.target.value, 10) || 1 })}
                              />
                              {renderConfidenceBadge(line.confidenceQty)}
                            </div>
                          </td>

                          {/* Unit Conversion */}
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '10px' }}>
                              <input
                                placeholder="الوحدة e.g. كرتونة"
                                style={{ fontSize: '10px', padding: '2px' }}
                                value={line.unitName}
                                onChange={(e) => updateLine(line.key, { unitName: e.target.value })}
                              />
                              <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                                <span>×</span>
                                <input
                                  type="number"
                                  min={1}
                                  title="معامل تحويل الوحدة لقطع"
                                  style={{ width: '40px', fontSize: '10px', padding: '2px' }}
                                  value={line.conversionFactor}
                                  onChange={(e) => updateLine(line.key, { conversionFactor: parseInt(e.target.value, 10) || 1 })}
                                />
                                <span>قطع</span>
                              </div>
                              {line.conversionFactor > 1 && (
                                <span style={{ color: 'var(--color-primary)', fontWeight: 'bold' }}>
                                  صافي المخزون: {line.quantity * line.conversionFactor} قطعة
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Unit Cost & Price Change Alert */}
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <div style={{ display: 'flex', alignItems: 'center' }}>
                                <input
                                  type="number"
                                  style={{ width: '65px' }}
                                  value={line.unitCost}
                                  onChange={(e) => updateLine(line.key, { unitCost: parseFloat(e.target.value) || 0 })}
                                />
                                {renderConfidenceBadge(line.confidenceCost)}
                              </div>
                              {isCostIncreased && (
                                <span
                                  style={{ fontSize: '9px', color: '#c5221f', fontWeight: 'bold' }}
                                  title={`التكلفة السابقة بالكتالوج: ${currentCost}`}
                                >
                                  ⚠ ارتفعت (+{costDiffPct}%)
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Selling Price & AI Suggestion */}
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <input
                                type="number"
                                style={{ width: '65px' }}
                                value={line.price}
                                onChange={(e) => updateLine(line.key, { price: parseFloat(e.target.value) || 0 })}
                              />
                              {isCostIncreased && (
                                <span
                                  style={{ fontSize: '9px', color: '#137333', cursor: 'pointer', textDecoration: 'underline' }}
                                  onClick={() => updateLine(line.key, { price: suggestedPrice })}
                                  title="انقر لتطبيق سعر البيع المقترح لضمان هامش الربح"
                                >
                                  مقترح: {suggestedPrice}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Lot Number & Expiry Date */}
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <input
                                placeholder="LOT / رقم الدفعة"
                                style={{ fontSize: '10px', padding: '2px' }}
                                value={line.lotNumber}
                                onChange={(e) => updateLine(line.key, { lotNumber: e.target.value })}
                              />
                              <input
                                type="date"
                                style={{ fontSize: '10px', padding: '2px' }}
                                value={line.expiryDate}
                                onChange={(e) => updateLine(line.key, { expiryDate: e.target.value })}
                              />
                            </div>
                          </td>

                          {/* Line Total */}
                          <td>
                            <strong>{formatMoney(line.quantity * line.unitCost)}</strong>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          /* Inventory Impact Preview Tab */
          <div className="card" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <Layers color="var(--color-primary)" size={20} />
              <strong style={{ fontSize: '15px' }}>معاينة التأثير التلقائي على أثر أرصدة المخزون والدفعات</strong>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
              يوضح هذا الجدول التغير في كمية المخزون لكل منتج والرقم المعياري المنشأ لكل دفعة (Batch Number) فور اعتماد الفاتورة:
            </p>

            <table className="erp-table" style={{ width: '100%', fontSize: '13px' }}>
              <thead>
                <tr>
                  <th>اسم المنتج بالكتالوج</th>
                  <th>رمز السلعة (SKU)</th>
                  <th>الرصيد الحالي</th>
                  <th>الكمية الواردة بالدفعة</th>
                  <th>الرصيد المتوقع بعد الاعتماد</th>
                  <th>رقم الدفعة المعياري (Batch Number)</th>
                  <th>تكلفة الوحدة بالدفعة</th>
                  <th>تاريخ الانتهاء</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, idx) => {
                  const matchedV = variants.find((v) => v.id === line.matchedVariantId);
                  const currentStock = matchedV?.stockQuantity ?? 0;
                  const incomingQty = (line.quantity || 0) * (line.conversionFactor || 1);
                  const projectedStock = currentStock + incomingQty;

                  const generatedBatchNo =
                    line.lotNumber?.trim() ||
                    `B-${(invoiceNumber || 'INV').replace(/\s+/g, '')}-${String(idx + 1).padStart(3, '0')}`;

                  return (
                    <tr key={line.key}>
                      <td>
                        <strong>{line.productName}</strong>
                        {line.isNewProduct && (
                          <span style={{ fontSize: '10px', color: 'var(--color-primary)', marginRight: '6px' }}>
                            (منتج جديد سيتم إنشاؤه)
                          </span>
                        )}
                      </td>
                      <td><code>{line.sku}</code></td>
                      <td>{currentStock}</td>
                      <td>
                        <strong style={{ color: '#137333' }}>+{incomingQty}</strong>
                      </td>
                      <td>
                        <strong style={{ color: 'var(--color-primary)', fontSize: '1.05rem' }}>{projectedStock}</strong>
                      </td>
                      <td>
                        <Badge variant="gray">
                          <Package size={12} style={{ marginLeft: '4px' }} />
                          {generatedBatchNo}
                        </Badge>
                      </td>
                      <td>{formatMoney(line.unitCost)} {currency}</td>
                      <td>{line.expiryDate || 'بدون تاريخ'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default PurchaseInvoiceReviewModal;
