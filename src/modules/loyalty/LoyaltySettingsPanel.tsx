import React, { useEffect, useState } from 'react';
import { useLoyaltySettings, useUpdateLoyaltySettings, useProducts } from '../../core/hooks/useERPData';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';

interface CategoryOption {
  id: string;
  name: string;
}

function toggleInSet(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

const LoyaltySettingsPanel: React.FC = () => {
  const { data: settings, isLoading } = useLoyaltySettings();
  const { data: products } = useProducts();
  const { mutate: updateSettings, isPending: saving } = useUpdateLoyaltySettings();

  const categoryOptions: CategoryOption[] = React.useMemo(() => {
    const byId = new Map<string, string>();
    (products ?? []).forEach((p) => {
      if (p.categoryId && !byId.has(p.categoryId)) {
        byId.set(p.categoryId, p.categoryName || p.categoryId);
      }
    });
    return Array.from(byId.entries()).map(([id, name]) => ({ id, name }));
  }, [products]);

  const [enabled, setEnabled] = useState(false);
  const [programOpen, setProgramOpen] = useState(true);
  const [earnRatePercent, setEarnRatePercent] = useState('2');
  const [maxUsagePercent, setMaxUsagePercent] = useState('');
  const [maxUsageAmount, setMaxUsageAmount] = useState('');
  const [expirationEnabled, setExpirationEnabled] = useState(false);
  const [expirationMonths, setExpirationMonths] = useState('12');
  const [eligibleCategoryIds, setEligibleCategoryIds] = useState<Set<string>>(new Set());
  const [excludedCategoryIds, setExcludedCategoryIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!settings) return;
    setEnabled(settings.enabled);
    setProgramOpen(settings.programOpen);
    setEarnRatePercent(String(settings.earnRatePercent ?? 0));
    setMaxUsagePercent(settings.maxUsagePercent != null ? String(settings.maxUsagePercent) : '');
    setMaxUsageAmount(settings.maxUsageAmount != null ? String(settings.maxUsageAmount) : '');
    setExpirationEnabled(settings.expirationEnabled);
    setExpirationMonths(settings.expirationMonths != null ? String(settings.expirationMonths) : '12');
    setEligibleCategoryIds(new Set(settings.eligibleCategoryIds || []));
    setExcludedCategoryIds(new Set(settings.excludedCategoryIds || []));
  }, [settings]);

  if (isLoading || !settings) {
    return <div className="skeleton" style={{ height: '200px' }} />;
  }

  const handleSave = () => {
    const earnRate = parseFloat(earnRatePercent);
    if (!Number.isFinite(earnRate) || earnRate < 0 || earnRate > 100) {
      alert('نسبة الكسب يجب أن تكون رقمًا بين 0 و 100');
      return;
    }
    if (expirationEnabled && (!expirationMonths || parseInt(expirationMonths, 10) < 1)) {
      alert('مدة انتهاء الصلاحية يجب أن تكون شهرًا واحدًا على الأقل');
      return;
    }

    updateSettings({
      enabled,
      programOpen,
      earnRatePercent: earnRate,
      maxUsagePercent: maxUsagePercent.trim() ? parseFloat(maxUsagePercent) : undefined,
      maxUsageAmount: maxUsageAmount.trim() ? parseFloat(maxUsageAmount) : undefined,
      expirationEnabled,
      expirationMonths: expirationEnabled ? parseInt(expirationMonths, 10) : undefined,
      eligibleCategoryIds: Array.from(eligibleCategoryIds),
      excludedCategoryIds: Array.from(excludedCategoryIds),
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
      {/* Master switch + program status */}
      <div style={{ display: 'flex', gap: 'var(--spacing-3)', flexWrap: 'wrap' }}>
        <ToggleCard
          label="نظام الولاء"
          checked={enabled}
          onChange={setEnabled}
          activeLabel="مفعّل"
          inactiveLabel="متوقف"
        />
        <ToggleCard
          label="حالة البرنامج"
          checked={programOpen}
          onChange={setProgramOpen}
          activeLabel="مفتوح (يكسب العملاء)"
          inactiveLabel="مغلق (لا كسب حالياً)"
        />
        <ToggleCard
          label="انتهاء صلاحية الرصيد"
          checked={expirationEnabled}
          onChange={setExpirationEnabled}
          activeLabel="مفعّل"
          inactiveLabel="غير مفعّل"
        />
      </div>

      {/* Earn / redemption numbers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--spacing-3)' }}>
        <Input
          label="نسبة الكسب (%)"
          type="number"
          min={0}
          max={100}
          step="0.5"
          value={earnRatePercent}
          onChange={(e) => setEarnRatePercent(e.target.value)}
          placeholder="2"
        />
        <Input
          label="أقصى نسبة استخدام من الفاتورة (%)"
          type="number"
          min={0}
          max={100}
          step="1"
          value={maxUsagePercent}
          onChange={(e) => setMaxUsagePercent(e.target.value)}
          placeholder="بدون حد"
        />
        <Input
          label="أقصى قيمة استخدام في الفاتورة (ج.م)"
          type="number"
          min={0}
          step="1"
          value={maxUsageAmount}
          onChange={(e) => setMaxUsageAmount(e.target.value)}
          placeholder="بدون حد"
        />
        {expirationEnabled && (
          <Input
            label="مدة انتهاء الصلاحية (بالشهور)"
            type="number"
            min={1}
            step="1"
            value={expirationMonths}
            onChange={(e) => setExpirationMonths(e.target.value)}
            placeholder="12"
          />
        )}
      </div>

      {/* Category eligibility */}
      <div>
        <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '6px' }}>
          الأصناف المؤهلة للكسب (اتركها فارغة ليشمل كل الأصناف)
        </div>
        {categoryOptions.length === 0 ? (
          <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>لا توجد فئات منتجات محملة بعد.</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {categoryOptions.map((cat) => {
              const isEligible = eligibleCategoryIds.has(cat.id);
              const isExcluded = excludedCategoryIds.has(cat.id);
              return (
                <div key={cat.id} style={{ display: 'flex', gap: '4px' }}>
                  <button
                    type="button"
                    onClick={() => setEligibleCategoryIds((prev) => toggleInSet(prev, cat.id))}
                    className="btn-secondary"
                    style={{
                      fontSize: '11px', padding: '4px 8px',
                      borderColor: isEligible ? 'var(--color-primary)' : 'var(--color-border)',
                      backgroundColor: isEligible ? 'var(--color-primary-light)' : 'var(--color-surface)',
                      color: isEligible ? 'var(--color-primary)' : 'var(--color-text-primary)',
                    }}
                    title="اضغط لتضمين هذه الفئة ضمن الأصناف المؤهلة فقط"
                  >
                    {cat.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => setExcludedCategoryIds((prev) => toggleInSet(prev, cat.id))}
                    className="btn-secondary"
                    style={{
                      fontSize: '11px', padding: '4px 8px',
                      borderColor: isExcluded ? 'var(--color-danger)' : 'var(--color-border)',
                      backgroundColor: isExcluded ? 'rgba(220, 38, 38, 0.12)' : 'var(--color-surface)',
                      color: isExcluded ? 'var(--color-danger)' : 'var(--color-text-primary)',
                    }}
                    title="اضغط لاستثناء هذه الفئة من الكسب"
                  >
                    استثناء
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {(eligibleCategoryIds.size > 0 || excludedCategoryIds.size > 0) && (
          <div style={{ marginTop: '6px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {eligibleCategoryIds.size > 0 && (
              <Badge variant="primary">مؤهلة فقط: {eligibleCategoryIds.size}</Badge>
            )}
            {excludedCategoryIds.size > 0 && (
              <Badge variant="danger">مستثناة: {excludedCategoryIds.size}</Badge>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button onClick={handleSave} disabled={saving} variant="primary">
          حفظ إعدادات الولاء
        </Button>
      </div>
    </div>
  );
};

const ToggleCard: React.FC<{
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  activeLabel: string;
  inactiveLabel: string;
}> = ({ label, checked, onChange, activeLabel, inactiveLabel }) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    className="btn-secondary"
    style={{
      display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px',
      padding: '10px 14px', minWidth: '160px',
      borderColor: checked ? 'var(--color-primary)' : 'var(--color-border)',
      backgroundColor: checked ? 'var(--color-primary-light)' : 'var(--color-surface)',
    }}
  >
    <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{label}</span>
    <span style={{ fontWeight: 'bold', color: checked ? 'var(--color-primary)' : 'var(--color-text-primary)' }}>
      {checked ? activeLabel : inactiveLabel}
    </span>
  </button>
);

export default LoyaltySettingsPanel;
