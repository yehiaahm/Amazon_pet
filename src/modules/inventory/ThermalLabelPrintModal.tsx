import React, { useState, useRef } from 'react';
import Button from '../../components/ui/Button';
import Select from '../../components/ui/Select';
import Input from '../../components/ui/Input';
import { Printer, Code, X, Check, Copy } from 'lucide-react';
import { api } from '../../core/api/endpoints';
import { useUIStore } from '../../core/stores/uiStore';

interface ThermalLabelPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  variantId: string;
  productName: string;
  sku: string;
  price: number;
  barcode: string;
}

const PRESET_LABEL_SIZES = [
  { value: '50x25', label: '50mm × 25mm (رول حراري قياسي)', widthMm: 50, heightMm: 25, style: 'PET_SHOP_MEDIUM' },
  { value: '38x25', label: '38mm × 25mm (رول صغير للمستلزمات)', widthMm: 38, heightMm: 25, style: 'PET_SHOP_SMALL' },
  { value: '40x20', label: '40mm × 20mm (ملصق صغير جداً)', widthMm: 40, heightMm: 20, style: 'PRICE_TAG' },
  { value: '60x40', label: '60mm × 40mm (ملصق رف / مستودع)', widthMm: 60, heightMm: 40, style: 'SHELF_LABEL' },
];

export const ThermalLabelPrintModal: React.FC<ThermalLabelPrintModalProps> = ({
  isOpen,
  onClose,
  variantId,
  productName,
  sku,
  price,
  barcode,
}) => {
  const addNotification = useUIStore((s) => s.addNotification);
  const [selectedSize, setSelectedSize] = useState('50x25');
  const [quantity, setQuantity] = useState('1');
  const [includeShopName, setIncludeShopName] = useState(true);
  const [includeName, setIncludeName] = useState(true);
  const [includePrice, setIncludePrice] = useState(true);
  const [includeSku, setIncludeSku] = useState(true);
  const [includeBarcodeText, setIncludeBarcodeText] = useState(true);

  const [zplCode, setZplCode] = useState<string | null>(null);
  const [loadingZpl, setLoadingZpl] = useState(false);
  const [copiedZpl, setCopiedZpl] = useState(false);

  const printAreaRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const currentSizeObj = PRESET_LABEL_SIZES.find((s) => s.value === selectedSize) || PRESET_LABEL_SIZES[0];
  const qtyNum = Math.max(1, parseInt(quantity, 10) || 1);

  // Generate SVG barcode representation using bwipjs API
  const barcodeUrl = `https://bwipjs-api.metafloor.com/?bcid=code128&text=${encodeURIComponent(barcode || '12345678')}&scale=2&height=12&textxalign=center&includetext=${includeBarcodeText}`;

  const handleDirectThermalPrint = () => {
    if (!barcode) {
      addNotification('WARNINGS', 'لا يوجد باركود', 'يرجى توليد باركود للمنتج أولاً.');
      return;
    }

    const printWindow = window.open('', '_blank', 'width=600,height=600');
    if (!printWindow) {
      addNotification('WARNINGS', 'فشل فتح نافذة الطباعة', 'يرجى السماح بالنوافذ المنبثقة (Popups) في المتصفح.');
      return;
    }

    const wMm = currentSizeObj.widthMm;
    const hMm = currentSizeObj.heightMm;

    let stickersHtml = '';
    for (let i = 0; i < qtyNum; i++) {
      stickersHtml += `
        <div class="sticker-page">
          <div class="sticker-box">
            ${includeShopName ? `<div class="shop-title">Amazon Pet Shop</div>` : ''}
            ${includeName ? `<div class="prod-title">${productName}</div>` : ''}
            <div class="meta-row">
              ${includeSku ? `<span>SKU: ${sku || '—'}</span>` : ''}
              ${includePrice ? `<strong>${price.toFixed(2)} ج.م</strong>` : ''}
            </div>
            <div class="barcode-container">
              <img src="${barcodeUrl}" alt="${barcode}" />
            </div>
          </div>
        </div>
      `;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="rtl">
      <head>
        <title>طباعة ملصق باركود حراري</title>
        <style>
          @page {
            size: ${wMm}mm ${hMm}mm;
            margin: 0;
          }
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }
          body {
            font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
            background: #fff;
            color: #000;
            direction: rtl;
          }
          .sticker-page {
            width: ${wMm}mm;
            height: ${hMm}mm;
            page-break-after: always;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            padding: 1.5mm;
          }
          .sticker-box {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            align-items: center;
            text-align: center;
          }
          .shop-title {
            font-size: 8px;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            border-bottom: 0.5px solid #000;
            width: 100%;
            padding-bottom: 1px;
            margin-bottom: 1px;
          }
          .prod-title {
            font-size: 9px;
            font-weight: bold;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 100%;
          }
          .meta-row {
            display: flex;
            justify-content: space-between;
            width: 100%;
            font-size: 8px;
            padding: 0 2px;
          }
          .barcode-container {
            width: 100%;
            display: flex;
            justify-content: center;
            align-items: center;
            margin-top: 1px;
          }
          .barcode-container img {
            max-width: 95%;
            max-height: ${hMm - 14}mm;
            object-fit: contain;
          }
        </style>
      </head>
      <body>
        ${stickersHtml}
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
              window.close();
            }, 300);
          };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleFetchZpl = async () => {
    try {
      setLoadingZpl(true);
      const res = await api.bulkPrintZpl(
        [{ variantId, quantity: qtyNum }],
        currentSizeObj.style
      );
      setZplCode(res);
      setLoadingZpl(false);
    } catch (err: any) {
      setLoadingZpl(false);
      addNotification('WARNINGS', 'فشل إنشاء كود ZPL', err?.message || 'تعذر التواصل مع السيرفر.');
    }
  };

  const handleCopyZpl = () => {
    if (zplCode) {
      navigator.clipboard.writeText(zplCode);
      setCopiedZpl(true);
      setTimeout(() => setCopiedZpl(false), 2000);
      addNotification('TASKS', 'تم النسخ', 'تم نسخ كود ZPL إلى الحافظة.');
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
    >
      <div
        style={{
          background: 'var(--color-surface)',
          borderRadius: '12px',
          border: '1px solid var(--color-border)',
          width: '100%',
          maxWidth: '680px',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: 'var(--shadow-xl)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Printer size={22} style={{ color: 'var(--color-primary)' }} />
            <div>
              <h3 style={{ margin: 0, fontSize: 'var(--font-size-md)' }}>طباعة ملصق باركود حراري حرّ مباشر</h3>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                طباعة مباشرة مخصصة لطابعات الرول الحراري (Xprinter, Zebra, TSC)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Form controls */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <Select
              label="مقاس ملصق الرول الحراري"
              value={selectedSize}
              onChange={(e) => setSelectedSize(e.target.value)}
              options={PRESET_LABEL_SIZES.map((s) => ({ value: s.value, label: s.label }))}
            />
            <Input
              label="عدد الملصقات للطباعة"
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="1"
            />
          </div>

          {/* Options Toggles */}
          <div>
            <strong style={{ fontSize: '13px', display: 'block', marginBottom: '8px' }}>محتويات الملصق:</strong>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', fontSize: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input type="checkbox" checked={includeShopName} onChange={(e) => setIncludeShopName(e.target.checked)} />
                اسم المتجر (Amazon Pet Shop)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input type="checkbox" checked={includeName} onChange={(e) => setIncludeName(e.target.checked)} />
                اسم المنتج
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input type="checkbox" checked={includePrice} onChange={(e) => setIncludePrice(e.target.checked)} />
                سعر البيع
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input type="checkbox" checked={includeSku} onChange={(e) => setIncludeSku(e.target.checked)} />
                رمز SKU
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input type="checkbox" checked={includeBarcodeText} onChange={(e) => setIncludeBarcodeText(e.target.checked)} />
                نص رقم الباركود
              </label>
            </div>
          </div>

          {/* Real Live Label Preview */}
          <div
            style={{
              padding: '16px',
              background: 'var(--color-background)',
              borderRadius: '8px',
              border: '1px solid var(--color-border)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--color-text-secondary)' }}>
              معاينة حية للملصق الحراري ({currentSizeObj.widthMm}mm × {currentSizeObj.heightMm}mm):
            </span>

            {/* Scale card proportional to mm */}
            <div
              ref={printAreaRef}
              style={{
                width: `${currentSizeObj.widthMm * 5}px`,
                height: `${currentSizeObj.heightMm * 5}px`,
                background: '#ffffff',
                color: '#000000',
                borderRadius: '4px',
                border: '1px dashed #666',
                padding: '6px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                alignItems: 'center',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                fontFamily: 'sans-serif',
                textAlign: 'center',
                overflow: 'hidden',
              }}
            >
              {includeShopName && (
                <div style={{ fontSize: '10px', fontWeight: 'bold', borderBottom: '1px solid #000', width: '100%', paddingBottom: '2px' }}>
                  Amazon Pet Shop
                </div>
              )}
              {includeName && (
                <div style={{ fontSize: '11px', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                  {productName}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: '10px' }}>
                {includeSku && <span>SKU: {sku || '—'}</span>}
                {includePrice && <strong>{price.toFixed(2)} ج.م</strong>}
              </div>
              <div style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <img
                  src={barcodeUrl}
                  alt={barcode}
                  style={{ maxHeight: `${currentSizeObj.heightMm * 2.2}px`, maxWidth: '95%', objectFit: 'contain' }}
                />
              </div>
            </div>
          </div>

          {/* ZPL Code Section */}
          {zplCode && (
            <div style={{ background: '#1e1e1e', color: '#00ff66', padding: '12px', borderRadius: '8px', fontFamily: 'monospace', fontSize: '11px', overflowX: 'auto', maxHeight: '120px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', color: '#fff' }}>
                <span>كود ZPL لطابعات زيبرا الصناعية:</span>
                <Button size="sm" variant="secondary" onClick={handleCopyZpl}>
                  {copiedZpl ? <Check size={14} /> : <Copy size={14} />} {copiedZpl ? 'تم النسخ' : 'نسخ الكود'}
                </Button>
              </div>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{zplCode}</pre>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '16px 20px',
            borderTop: '1px solid var(--color-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--color-surface)',
            borderBottomLeftRadius: '12px',
            borderBottomRightRadius: '12px',
          }}
        >
          <Button variant="secondary" onClick={handleFetchZpl} disabled={loadingZpl}>
            <Code size={16} /> {loadingZpl ? 'جاري التوليد...' : 'تصدير كود ZPL'}
          </Button>

          <div style={{ display: 'flex', gap: '10px' }}>
            <Button variant="secondary" onClick={onClose}>
              إلغاء
            </Button>
            <Button variant="primary" onClick={handleDirectThermalPrint}>
              <Printer size={16} /> طباعة حرارية مباشرة الآن ({qtyNum} ملصق)
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
