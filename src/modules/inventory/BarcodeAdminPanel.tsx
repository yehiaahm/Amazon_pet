import React, { useMemo, useState, useRef, useEffect } from 'react';
import {
  useProducts,
  useVariants,
  useBarcodeSettings,
  useUpdateBarcodeSettings,
  useGenerateBarcode,
  useUpdateCustomBarcode,
  useClearBarcode,
} from '../../core/hooks/useERPData';
import { useUIStore } from '../../core/stores/uiStore';
import { api } from '../../core/api/endpoints';
import Button from '../../components/ui/Button';
import Select from '../../components/ui/Select';
import Input from '../../components/ui/Input';
import Badge from '../../components/ui/Badge';
import { Barcode, Printer, Trash2, Edit3, Flame, Search, X, Check, Wrench } from 'lucide-react';
import { ThermalLabelPrintModal } from './ThermalLabelPrintModal';
import { printTestThermalReceipt80mm } from '../../core/pos/amazonPetInvoice';

const BarcodeAdminPanel: React.FC = () => {
  const addNotification = useUIStore((s) => s.addNotification);
  const { data: products = [] } = useProducts();
  const { data: variants = [] } = useVariants();
  const { data: settings, isLoading: loadingSettings } = useBarcodeSettings();
  const { mutate: saveSettings, isPending: savingSettings } = useUpdateBarcodeSettings();
  const { mutate: generateBarcode, isPending: generating } = useGenerateBarcode();
  const { mutate: updateCustomBarcode, isPending: updatingCustom } = useUpdateCustomBarcode();
  const { mutate: clearBarcode, isPending: clearing } = useClearBarcode();

  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [customBarcodeVal, setCustomBarcodeVal] = useState('');
  const [printQty, setPrintQty] = useState('1');
  const [localSettings, setLocalSettings] = useState<any>(null);
  const [showThermalModal, setShowThermalModal] = useState(false);

  useEffect(() => {
    if (settings) setLocalSettings(settings);
  }, [settings]);

  // Click outside to close combobox dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedVariant = useMemo(() => {
    return variants.find((v) => v.id === selectedVariantId);
  }, [variants, selectedVariantId]);

  const selectedProduct = useMemo(() => {
    if (!selectedVariant) return undefined;
    return products.find((p) => p.id === selectedVariant.productId);
  }, [products, selectedVariant]);

  useEffect(() => {
    if (selectedVariant?.barcode) {
      setCustomBarcodeVal(selectedVariant.barcode);
    } else {
      setCustomBarcodeVal('');
    }
  }, [selectedVariantId, selectedVariant]);

  // Filtered variants for instant search autocomplete
  const filteredVariants = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return variants.slice(0, 40);
    return variants
      .filter((v) => {
        const p = products.find((x) => x.id === v.productId);
        const nameMatch = p?.name?.toLowerCase().includes(q) || v.name?.toLowerCase().includes(q);
        const skuMatch = p?.sku?.toLowerCase().includes(q) || v.id?.toLowerCase().includes(q);
        const barcodeMatch = v.barcode?.toLowerCase().includes(q);
        return nameMatch || skuMatch || barcodeMatch;
      })
      .slice(0, 40);
  }, [variants, products, productSearch]);

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
      addNotification('TASKS', 'تم تجهيز الملصقات', 'تم فتح ملف A4 PDF للطباعة.');
    } catch (err: any) {
      addNotification('WARNINGS', 'فشل الطباعة', err?.message || 'تعذر إنشاء ملف PDF.');
    }
  };

  const handleSaveCustomBarcode = () => {
    if (!selectedVariantId) {
      addNotification('WARNINGS', 'اختر منتجاً', 'يرجى اختيار صنف أولاً.');
      return;
    }
    if (!customBarcodeVal.trim()) {
      addNotification('WARNINGS', 'باركود فارغ', 'يرجى إدخال رمز باركود صالح.');
      return;
    }
    updateCustomBarcode({
      variantId: selectedVariantId,
      customBarcode: customBarcodeVal.trim(),
      format: localSettings?.defaultBarcodeFormat || 'CODE_128',
    });
  };

  if (loadingSettings && !localSettings) {
    return <div className="skeleton" style={{ height: '200px' }} />;
  }

  const s = localSettings || settings;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Barcode Settings Card */}
      <div
        style={{
          padding: '20px',
          border: '1px solid var(--color-border)',
          borderRadius: '12px',
          background: 'var(--color-surface)',
        }}
      >
        <h3 style={{ marginBottom: '16px', fontSize: 'var(--font-size-md)' }}>إعدادات الباركود والملصقات</h3>
        {s && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' }}>
            <Select
              label="صيغة الباركود الافتراضية"
              value={s.defaultBarcodeFormat || 'CODE_128'}
              onChange={(e) => setLocalSettings({ ...s, defaultBarcodeFormat: e.target.value })}
              options={[
                { value: 'CODE_128', label: 'Code 128 (موصى به للمستودعات والمحلات)' },
                { value: 'EAN_13', label: 'EAN-13 (باركود مصنع 13 رقم)' },
                { value: 'UPC_A', label: 'UPC-A (باركود عالمي 12 رقم)' },
                { value: 'QR_CODE', label: 'QR Code (رمز استجابة سريعة)' },
              ]}
            />
            <Select
              label="حجم الملصق"
              value={s.defaultLabelSize || 'SMALL'}
              onChange={(e) => setLocalSettings({ ...s, defaultLabelSize: e.target.value })}
              options={[
                { value: 'SMALL', label: 'صغير (50x25mm / 38x25mm)' },
                { value: 'MEDIUM', label: 'متوسط (60x40mm)' },
                { value: 'LARGE', label: 'كبير (100x50mm)' },
              ]}
            />
            <Select
              label="قالب الملصق"
              value={s.defaultTemplateStyle || 'PET_SHOP_SMALL'}
              onChange={(e) => setLocalSettings({ ...s, defaultTemplateStyle: e.target.value })}
              options={[
                { value: 'PET_SHOP_SMALL', label: 'متجر — رول صغير (38x25mm)' },
                { value: 'PET_SHOP_MEDIUM', label: 'متجر — رول قياسي (50x25mm)' },
                { value: 'SHELF_LABEL', label: 'ملصق رفوف (60x40mm)' },
                { value: 'PRICE_TAG', label: 'بطاقة سعر (40x20mm)' },
                { value: 'WAREHOUSE_LABEL', label: 'ملصق كرتونة مستودع (100x50mm)' },
              ]}
            />
          </div>
        )}
        <div style={{ marginTop: '16px' }}>
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

      {/* Barcode Operations Panel */}
      <div
        style={{
          padding: '20px',
          border: '1px solid var(--color-border)',
          borderRadius: '12px',
          background: 'var(--color-surface)',
        }}
      >
        <h3 style={{ marginBottom: '16px', fontSize: 'var(--font-size-md)' }}>إدارة، تعديل وطباعة الباركود</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: 640 }}>

          {/* Instant Searchable Product Combobox */}
          <div ref={dropdownRef} style={{ position: 'relative' }}>
            <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 'bold', marginBottom: '6px' }}>
              اختر المنتج (اكتب اسم المنتج أو الكود للبحث الفوري):
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search size={18} style={{ position: 'absolute', right: '12px', color: 'var(--color-text-secondary)', pointerEvents: 'none' }} />
              <input
                type="text"
                value={productSearch}
                onFocus={() => setIsDropdownOpen(true)}
                onChange={(e) => {
                  setProductSearch(e.target.value);
                  setIsDropdownOpen(true);
                }}
                placeholder="ابحث باسم المنتج، الكود، أو الباركود... (مثال: رويال، درك)"
                style={{
                  width: '100%',
                  padding: '10px 38px 10px 36px',
                  borderRadius: '8px',
                  border: selectedVariantId ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                  background: 'var(--color-background)',
                  color: 'var(--color-text-primary)',
                  fontSize: 'var(--font-size-sm)',
                  outline: 'none',
                }}
              />
              {productSearch && (
                <button
                  type="button"
                  onClick={() => {
                    setProductSearch('');
                    setSelectedVariantId('');
                    setIsDropdownOpen(false);
                  }}
                  style={{
                    position: 'absolute',
                    left: '10px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--color-text-secondary)',
                    padding: '2px',
                  }}
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Dropdown Options List */}
            {isDropdownOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  left: 0,
                  zIndex: 50,
                  marginTop: '4px',
                  maxHeight: '280px',
                  overflowY: 'auto',
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '8px',
                  boxShadow: 'var(--shadow-xl)',
                }}
              >
                {filteredVariants.length === 0 ? (
                  <div style={{ padding: '14px', fontSize: '13px', color: 'var(--color-text-secondary)', textAlign: 'center' }}>
                    لا توجد نتائج مطابقة لـ "{productSearch}"
                  </div>
                ) : (
                  filteredVariants.map((v) => {
                    const p = products.find((x) => x.id === v.productId);
                    const isSelected = v.id === selectedVariantId;
                    return (
                      <div
                        key={v.id}
                        onClick={() => {
                          setSelectedVariantId(v.id);
                          setProductSearch(`${p?.name || ''} ${v.name ? `(${v.name})` : ''} — SKU: ${p?.sku || v.id}`);
                          setIsDropdownOpen(false);
                        }}
                        style={{
                          padding: '10px 14px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          borderBottom: '1px solid var(--color-border)',
                          background: isSelected ? 'var(--color-primary-light)' : 'transparent',
                          transition: 'background-color 0.15s ease',
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) e.currentTarget.style.background = 'var(--color-background)';
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <strong style={{ fontSize: '13px', color: 'var(--color-text-primary)' }}>
                            {p?.name || 'منتج'} {v.name ? `(${v.name})` : ''}
                          </strong>
                          <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', fontFamily: 'monospace' }}>
                            SKU: {p?.sku || v.id}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {v.barcode ? (
                            <Badge variant="primary" style={{ fontSize: '11px', fontFamily: 'monospace' }}>
                              {v.barcode}
                            </Badge>
                          ) : (
                            <Badge variant="gray" style={{ fontSize: '10px' }}>بدون باركود</Badge>
                          )}
                          {isSelected && <Check size={16} style={{ color: 'var(--color-primary)' }} />}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {selectedVariant && (
            <div
              style={{
                padding: '14px',
                background: 'var(--color-background)',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>الباركود الحالي بالنظام:</span>
                {selectedVariant.barcode ? (
                  <Badge variant="primary" style={{ fontSize: '13px', padding: '4px 10px', fontFamily: 'monospace' }}>
                    {selectedVariant.barcode}
                  </Badge>
                ) : (
                  <Badge variant="gray">غير مُولَّد</Badge>
                )}
              </div>

              {/* Custom Barcode Input */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <Input
                    label="تعيين أو تعديل الباركود يدوياً (مثلاً باركود المصنع EAN-13)"
                    value={customBarcodeVal}
                    onChange={(e) => setCustomBarcodeVal(e.target.value)}
                    placeholder="أدخل باركود مخصص..."
                  />
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={updatingCustom || !customBarcodeVal.trim()}
                  onClick={handleSaveCustomBarcode}
                >
                  <Edit3 size={14} /> {updatingCustom ? 'جاري الحفظ...' : 'حفظ الباركود اليدوي'}
                </Button>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Input
              label="عدد الملصقات المطلوب طباعتها"
              value={printQty}
              onChange={(e) => setPrintQty(e.target.value)}
              placeholder="1"
            />
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '4px' }}>
            <Button
              variant="primary"
              size="sm"
              disabled={!selectedVariantId || generating}
              onClick={() =>
                generateBarcode({
                  variantId: selectedVariantId,
                  format: s?.defaultBarcodeFormat || 'CODE_128',
                  force: true,
                })
              }
            >
              <Barcode size={14} /> {generating ? 'جاري التوليد...' : selectedVariant?.barcode ? 'توليد / استبدال بباركود جديد' : 'توليد باركود للمنتج'}
            </Button>

            <Button
              variant="secondary"
              size="sm"
              disabled={!selectedVariantId || clearing}
              onClick={() => clearBarcode(selectedVariantId)}
            >
              <Trash2 size={14} style={{ color: 'var(--color-error)' }} /> مسح الباركود
            </Button>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '12px 0' }} />

          {/* Hardware Calibration Section */}
          <div
            style={{
              background: 'var(--color-surface-hover)',
              padding: '14px',
              borderRadius: '8px',
              border: '1px dashed var(--color-primary)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-primary)', fontWeight: 'bold', fontSize: '13px' }}>
              <Wrench size={16} /> مركز معايرة واختبار طابعات المحل الميدانية (Hardware Calibration)
            </div>
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-secondary)' }}>
              استخدم هذه الأدوات لمعايرة أبعاد ستيكر الباركود الحراري ووصل الكاشير 80mm على ماكينات المحل المادية قبل التسليم النهائى.
            </p>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  printTestThermalReceipt80mm();
                  addNotification('TASKS', 'جاري طباعة إيصال معايرة', 'تم إرسال وصل كاشير تجريبي 80mm لطابعة الفواتير.');
                }}
              >
                <Printer size={14} /> طباعة وصل كاشير تجريبي (80mm Thermal Receipt Test)
              </Button>
            </div>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '8px 0' }} />

          {/* Printing Buttons Section */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <Button
              variant="primary"
              size="md"
              disabled={!selectedVariantId || !selectedVariant?.barcode}
              onClick={() => setShowThermalModal(true)}
              style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', borderColor: '#059669' }}
            >
              <Flame size={18} /> طباعة حرارية مباشرة للطابعات (Xprinter, Zebra, TSC)
            </Button>

            <Button
              variant="secondary"
              size="md"
              disabled={!selectedVariantId || !selectedVariant?.barcode}
              onClick={() => void handlePrintPdf()}
            >
              <Printer size={18} /> طباعة ورقة A4 PDF
            </Button>
          </div>
        </div>
      </div>

      {/* Thermal Sticker Modal */}
      {selectedVariant && (
        <ThermalLabelPrintModal
          isOpen={showThermalModal}
          onClose={() => setShowThermalModal(false)}
          variantId={selectedVariant.id}
          productName={selectedProduct?.name || selectedVariant.name}
          sku={selectedProduct?.sku || (selectedVariant as any).sku || ''}
          price={selectedVariant.price}
          barcode={selectedVariant.barcode || ''}
        />
      )}
    </div>
  );
};

export default BarcodeAdminPanel;
