import React, { useMemo, useState } from 'react';
import {
  useProducts,
  useVariants,
  useBarcodeSettings,
  useUpdateBarcodeSettings,
  useGenerateBarcode,
  useClearBarcode,
} from '../../core/hooks/useERPData';
import { useUIStore } from '../../core/stores/uiStore';
import { api } from '../../core/api/endpoints';
import Button from '../../components/ui/Button';
import Select from '../../components/ui/Select';
import Input from '../../components/ui/Input';
import Badge from '../../components/ui/Badge';
import { Barcode, Printer, Trash2 } from 'lucide-react';

const BarcodeAdminPanel: React.FC = () => {
  const addNotification = useUIStore((s) => s.addNotification);
  const { data: products = [] } = useProducts();
  const { data: variants = [] } = useVariants();
  const { data: settings, isLoading: loadingSettings } = useBarcodeSettings();
  const { mutate: saveSettings, isPending: savingSettings } = useUpdateBarcodeSettings();
  const { mutate: generateBarcode, isPending: generating } = useGenerateBarcode();
  const { mutate: clearBarcode, isPending: clearing } = useClearBarcode();

  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [printQty, setPrintQty] = useState('1');
  const [localSettings, setLocalSettings] = useState<any>(null);

  React.useEffect(() => {
    if (settings) setLocalSettings(settings);
  }, [settings]);

  const variantOptions = useMemo(() => {
    return variants.map((v) => {
      const p = products.find((x) => x.id === v.productId);
      return {
        value: v.id,
        label: `${p?.sku || v.id} — ${p?.name || ''} (${v.name})${v.barcode ? ` [${v.barcode}]` : ''}`,
      };
    });
  }, [variants, products]);

  const selectedVariant = variants.find((v) => v.id === selectedVariantId);

  const handlePrintPdf = async () => {
    if (!selectedVariantId) {
      addNotification('WARNINGS', 'اختر منتجاً', 'حدد صنفاً لطباعة الملصق.');
      return;
    }
    try {
      const qty = Math.max(1, parseInt(printQty, 10) || 1);
      const blob = await api.bulkPrintPdf([{ variantId: selectedVariantId, quantity: qty }]);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      addNotification('TASKS', 'تم تجهيز الملصقات', 'تم فتح ملف PDF للطباعة.');
    } catch (err: any) {
      addNotification('WARNINGS', 'فشل الطباعة', err?.message || 'تعذر إنشاء ملف PDF.');
    }
  };

  if (loadingSettings && !localSettings) {
    return <div className="skeleton" style={{ height: '200px' }} />;
  }

  const s = localSettings || settings;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div
        style={{
          padding: '16px',
          border: '1px solid var(--color-border)',
          borderRadius: '8px',
          background: 'var(--color-surface)',
        }}
      >
        <h3 style={{ marginBottom: '12px', fontSize: 'var(--font-size-md)' }}>إعدادات الباركود والملصقات</h3>
        {s && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
            <Select
              label="صيغة الباركود الافتراضية"
              value={s.defaultBarcodeFormat || 'CODE_128'}
              onChange={(e) => setLocalSettings({ ...s, defaultBarcodeFormat: e.target.value })}
              options={[
                { value: 'CODE_128', label: 'Code 128' },
                { value: 'EAN_13', label: 'EAN-13' },
                { value: 'UPC_A', label: 'UPC-A' },
                { value: 'QR_CODE', label: 'QR Code' },
              ]}
            />
            <Select
              label="حجم الملصق"
              value={s.defaultLabelSize || 'SMALL'}
              onChange={(e) => setLocalSettings({ ...s, defaultLabelSize: e.target.value })}
              options={[
                { value: 'SMALL', label: 'صغير' },
                { value: 'MEDIUM', label: 'متوسط' },
                { value: 'LARGE', label: 'كبير' },
              ]}
            />
            <Select
              label="قالب الملصق"
              value={s.defaultTemplateStyle || 'PET_SHOP_SMALL'}
              onChange={(e) => setLocalSettings({ ...s, defaultTemplateStyle: e.target.value })}
              options={[
                { value: 'PET_SHOP_SMALL', label: 'متجر — صغير' },
                { value: 'PET_SHOP_MEDIUM', label: 'متجر — متوسط' },
                { value: 'SHELF_LABEL', label: 'رف' },
                { value: 'PRICE_TAG', label: 'سعر' },
                { value: 'WAREHOUSE_LABEL', label: 'مستودع' },
              ]}
            />
          </div>
        )}
        <div style={{ marginTop: '12px' }}>
          <Button
            variant="primary"
            size="sm"
            disabled={savingSettings || !localSettings}
            onClick={() => localSettings && saveSettings(localSettings)}
          >
            {savingSettings ? 'جاري الحفظ...' : 'حفظ الإعدادات'}
          </Button>
        </div>
      </div>

      <div
        style={{
          padding: '16px',
          border: '1px solid var(--color-border)',
          borderRadius: '8px',
          background: 'var(--color-surface)',
        }}
      >
        <h3 style={{ marginBottom: '12px', fontSize: 'var(--font-size-md)' }}>توليد وطباعة الباركود</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: 520 }}>
          <Select
            label="اختر الصنف"
            value={selectedVariantId}
            onChange={(e) => setSelectedVariantId(e.target.value)}
            options={[{ value: '', label: '— اختر —' }, ...variantOptions]}
          />
          {selectedVariant && (
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
              الباركود الحالي:{' '}
              {selectedVariant.barcode ? (
                <Badge variant="primary">{selectedVariant.barcode}</Badge>
              ) : (
                <Badge variant="gray">غير مُولَّد</Badge>
              )}
            </div>
          )}
          <Input
            label="عدد الملصقات للطباعة"
            value={printQty}
            onChange={(e) => setPrintQty(e.target.value)}
            placeholder="1"
          />
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Button
              variant="secondary"
              size="sm"
              disabled={!selectedVariantId || generating}
              onClick={() =>
                generateBarcode({
                  variantId: selectedVariantId,
                  format: s?.defaultBarcodeFormat || 'CODE_128',
                })
              }
            >
              <Barcode size={14} /> {generating ? 'جاري التوليد...' : 'توليد باركود'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={!selectedVariantId || clearing}
              onClick={() => clearBarcode(selectedVariantId)}
            >
              <Trash2 size={14} /> مسح الباركود
            </Button>
            <Button variant="primary" size="sm" disabled={!selectedVariantId} onClick={() => void handlePrintPdf()}>
              <Printer size={14} /> طباعة PDF
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BarcodeAdminPanel;
