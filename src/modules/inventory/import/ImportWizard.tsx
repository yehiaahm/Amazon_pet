import React, { useMemo, useState } from 'react';
import { CheckCircle2, AlertTriangle, ArrowRight, RotateCcw, Download, Save, FolderOpen } from 'lucide-react';
import Button from '../../../components/ui/Button';
import Badge from '../../../components/ui/Badge';
import Select from '../../../components/ui/Select';
import FileDropzone from '../../../components/ui/FileDropzone';
import DataTable from '../../../components/ui/DataTable';
import { api } from '../../../core/api/endpoints';
import { useUIStore } from '../../../core/stores/uiStore';
import {
  useUploadImportSession,
  useConfirmImportMapping,
  useImportPreview,
  useResolveImportDuplicates,
  useCommitImport,
  useImportMappingPresets,
  useSaveImportMappingPreset,
  useDeleteImportMappingPreset,
} from '../../../core/hooks/useERPData';
import { IMPORT_FIELDS, IMPORT_STATUS_LABELS, ImportPreviewRow, ImportUploadResponse, ImportMappingResponse, ImportSummary, MappingSource, ImportMode } from './importTypes';

type WizardStep = 'UPLOAD' | 'MAPPING' | 'PREVIEW' | 'DONE';

const FIELD_LABELS: Record<string, string> = Object.fromEntries(IMPORT_FIELDS.map(f => [f.code, f.labelAr]));

const SOURCE_LABELS: Record<MappingSource, string> = {
  HEADER: 'من اسم العمود',
  VALUES: 'من محتوى العمود',
  AI: 'بالذكاء الاصطناعي',
};

/** Below this, a guess is offered as a starting point but never applied on its own. */
const HINT_CONFIDENCE = 0.4;

const STATUS_BADGE: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'gray'> = {
  NEW: 'success',
  UPDATE: 'info',
  DUPLICATE: 'warning',
  COUNT_MATCHED: 'info',
  ERROR: 'danger',
  IMPORTED: 'success',
  UPDATED: 'info',
  SKIPPED: 'gray',
  FAILED: 'danger',
};

export const ImportWizard: React.FC = () => {
  const [step, setStep] = useState<WizardStep>('UPLOAD');
  const [mode, setMode] = useState<ImportMode>('ADD_STOCK');
  const [uploadResult, setUploadResult] = useState<ImportUploadResponse | null>(null);
  const [mappingSummary, setMappingSummary] = useState<ImportMappingResponse | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [autoCreateSupplier, setAutoCreateSupplier] = useState(true);
  const [priceWarningOnly, setPriceWarningOnly] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [autoMapError, setAutoMapError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [downloadingReport, setDownloadingReport] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const addNotification = useUIStore(s => s.addNotification);

  const isCountMode = mode === 'INVENTORY_COUNT';

  const uploadMutation = useUploadImportSession();
  const mappingMutation = useConfirmImportMapping();
  const resolveDuplicatesMutation = useResolveImportDuplicates();
  const commitMutation = useCommitImport();
  const mappingPresetsQuery = useImportMappingPresets(mode);
  const savePresetMutation = useSaveImportMappingPreset();
  const deletePresetMutation = useDeleteImportMappingPreset();

  const sessionId = uploadResult?.sessionId ?? null;
  const previewQuery = useImportPreview(step === 'PREVIEW' ? sessionId : null, { status: statusFilter || undefined });

  // Mirrors the backend's only blocking rule: something in the file has to identify the
  // product. Missing quantity/price columns are imported as 0 with a per-row warning
  // rather than blocking the whole file.
  const isMappingComplete = (candidateMapping: Record<string, string>) => {
    const mappedFields = new Set(Object.values(candidateMapping));
    return mappedFields.has('productName') || mappedFields.has('sku') || mappedFields.has('barcode');
  };

  const submitMapping = async (targetSessionId: string, mappingToUse: Record<string, string>) => {
    const result = await mappingMutation.mutateAsync({
      sessionId: targetSessionId,
      mapping: mappingToUse,
      autoCreateSupplier,
      priceBelowCostIsWarningOnly: priceWarningOnly,
    });
    setMappingSummary(result);
    setStep('PREVIEW');
  };

  const handleFileSelected = async (file: File) => {
    setAutoMapError(null);
    setUploadError(null);
    let result: ImportUploadResponse;
    try {
      result = await uploadMutation.mutateAsync({ file, mode });
    } catch (err: any) {
      // A file we couldn't even read (wrong type, corrupt, empty) — nothing to map yet.
      setUploadError(err?.message || 'تعذر قراءة الملف');
      return;
    }
    setUploadResult(result);
    const initialMapping: Record<string, string> = {};
    result.suggestedMapping.forEach(s => {
      if (s.autoMapped && s.field) initialMapping[s.header] = s.field;
    });
    setMapping(initialMapping);

    // Inventory-count mode always needs a human glance at the mapping (there's no product
    // creation to fall back on if a column is guessed wrong), so it never auto-skips to preview.
    if (isCountMode) {
      setStep('MAPPING');
      return;
    }

    // Always try to go straight to the preview — the column-mapping screen is
    // never shown automatically. It only becomes reachable if auto-mapping
    // genuinely can't proceed (no column identifies the product at all).
    try {
      await submitMapping(result.sessionId, initialMapping);
    } catch (err: any) {
      // Don't leave the user on the upload screen with an error and nothing to do:
      // drop them straight into manual mapping, pre-filled with the best guesses so
      // they only have to correct what's actually wrong.
      const guessed: Record<string, string> = { ...initialMapping };
      result.suggestedMapping.forEach(s => {
        if (!guessed[s.header] && s.field && s.confidence >= HINT_CONFIDENCE
            && !Object.values(guessed).includes(s.field)) {
          guessed[s.header] = s.field;
        }
      });
      setMapping(guessed);
      setAutoMapError(err?.message || 'تعذر التعرف على أعمدة الملف تلقائيًا');
      setStep('MAPPING');
    }
  };

  const requiredFieldsMapped = useMemo(() => isMappingComplete(mapping), [mapping]);

  /** Value columns the file has no equivalent for — they import as 0, so say so up front. */
  const missingValueColumns = useMemo(() => {
    const mapped = new Set(Object.values(mapping));
    const relevant = isCountMode ? ['quantity'] : ['quantity', 'costPrice', 'sellingPrice'];
    return relevant.filter(code => !mapped.has(code)).map(code => FIELD_LABELS[code] || code);
  }, [mapping, isCountMode]);

  const handleConfirmMapping = async () => {
    if (!sessionId) return;
    await submitMapping(sessionId, mapping);
  };

  const handleResolveAll = async (status: 'UPDATE_EXISTING' | 'SKIP' | 'CREATE_NEW') => {
    if (!sessionId || !previewQuery.data) return;
    const itemIds = previewQuery.data.content.filter(r => r.status === 'DUPLICATE').map(r => r.itemId);
    if (itemIds.length === 0) return;
    await resolveDuplicatesMutation.mutateAsync({ sessionId, itemIds, resolution: status });
  };

  const handleCommit = async () => {
    if (!sessionId) return;
    const result = await commitMutation.mutateAsync(sessionId);
    setSummary(result);
    setStep('DONE');
  };

  const handleDownloadErrorReport = async () => {
    if (!sessionId) return;
    setDownloadingReport(true);
    try {
      const blob = await api.downloadImportErrorReport(sessionId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `import-errors-${sessionId}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      addNotification('WARNINGS', 'فشل تحميل تقرير الأخطاء', err?.message || 'تعذر إنشاء التقرير.');
    } finally {
      setDownloadingReport(false);
    }
  };

  const handleSavePreset = async () => {
    if (!presetName.trim()) return;
    await savePresetMutation.mutateAsync({ name: presetName.trim(), mode, mapping });
    setPresetName('');
  };

  const handleApplyPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    const preset = mappingPresetsQuery.data?.find(p => p.id === presetId);
    if (!preset || !uploadResult) return;
    // Only apply entries whose header still exists in this file — a saved mapping from a
    // different sheet layout must not silently point at the wrong column.
    const applicable: Record<string, string> = {};
    uploadResult.headers.forEach(header => {
      if (preset.mapping[header]) applicable[header] = preset.mapping[header];
    });
    setMapping(applicable);
  };

  const handleDeletePreset = async (presetId: string) => {
    await deletePresetMutation.mutateAsync({ id: presetId, mode });
    if (selectedPresetId === presetId) setSelectedPresetId('');
  };

  const resetWizard = () => {
    setStep('UPLOAD');
    setUploadResult(null);
    setMappingSummary(null);
    setSummary(null);
    setMapping({});
    setStatusFilter('');
    setAutoMapError(null);
    setUploadError(null);
    setSelectedPresetId('');
  };

  const addStockPreviewColumns = [
    { header: 'الحالة', key: 'status', accessor: (row: ImportPreviewRow) => (
      <Badge variant={STATUS_BADGE[row.status] || 'gray'}>{IMPORT_STATUS_LABELS[row.status] || row.status}</Badge>
    ) },
    { header: 'اسم المنتج', key: 'productName', accessor: 'productName' as const },
    { header: 'SKU', key: 'sku', accessor: 'sku' as const },
    { header: 'الباركود', key: 'barcode', accessor: 'barcode' as const },
    { header: 'الفئة', key: 'category', accessor: 'category' as const },
    { header: 'المورد', key: 'supplier', accessor: 'supplier' as const },
    { header: 'الصنف/المتغير', key: 'variant', accessor: 'variant' as const },
    { header: 'الماركة', key: 'brand', accessor: 'brand' as const },
    { header: 'الوحدة', key: 'unit', accessor: 'unit' as const },
    { header: 'المخزن', key: 'warehouse', accessor: 'warehouse' as const },
    { header: 'التكلفة', key: 'costPrice', accessor: 'costPrice' as const },
    { header: 'سعر البيع', key: 'sellingPrice', accessor: 'sellingPrice' as const },
    { header: 'الكمية', key: 'quantity', accessor: 'quantity' as const },
    { header: 'تاريخ الصلاحية', key: 'expiryDate', accessor: 'expiryDate' as const },
    { header: 'ملاحظات', key: 'notes', accessor: (row: ImportPreviewRow) => (
      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-danger)' }}>
        {[...(row.errors || []), ...(row.warnings || [])].join(' | ')}
      </span>
    ) },
  ];

  const countPreviewColumns = [
    { header: 'الحالة', key: 'status', accessor: (row: ImportPreviewRow) => (
      <Badge variant={STATUS_BADGE[row.status] || 'gray'}>{IMPORT_STATUS_LABELS[row.status] || row.status}</Badge>
    ) },
    { header: 'اسم المنتج', key: 'productName', accessor: 'productName' as const },
    { header: 'SKU', key: 'sku', accessor: 'sku' as const },
    { header: 'الباركود', key: 'barcode', accessor: 'barcode' as const },
    { header: 'المخزن', key: 'warehouse', accessor: 'warehouse' as const },
    { header: 'الكمية الحالية', key: 'systemQuantity', accessor: (row: ImportPreviewRow) => row.systemQuantity ?? '—' },
    { header: 'الكمية المجرودة', key: 'countedQuantity', accessor: (row: ImportPreviewRow) => row.countedQuantity ?? '—' },
    { header: 'الفرق', key: 'adjustmentQuantity', accessor: (row: ImportPreviewRow) => {
      if (row.adjustmentQuantity === undefined || row.adjustmentQuantity === null) return '—';
      const diff = row.adjustmentQuantity;
      return (
        <span style={{ color: diff > 0 ? 'var(--color-success)' : diff < 0 ? 'var(--color-danger)' : 'var(--color-text-secondary)', fontWeight: 'bold' }}>
          {diff > 0 ? `+${diff}` : diff}
        </span>
      );
    } },
    { header: 'الكمية النهائية', key: 'finalQuantity', accessor: (row: ImportPreviewRow) => row.countedQuantity ?? '—' },
    { header: 'ملاحظات', key: 'notes', accessor: (row: ImportPreviewRow) => (
      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-danger)' }}>
        {[...(row.errors || []), ...(row.warnings || [])].join(' | ')}
      </span>
    ) },
  ];

  const previewColumns = isCountMode ? countPreviewColumns : addStockPreviewColumns;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
      <div style={{ display: 'flex', gap: 'var(--spacing-2)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
        {(['UPLOAD', 'MAPPING', 'PREVIEW', 'DONE'] as WizardStep[]).map((s, i) => (
          <React.Fragment key={s}>
            {i > 0 && <ArrowRight size={14} />}
            <span style={{ fontWeight: step === s ? 'bold' : 'normal', color: step === s ? 'var(--color-primary)' : undefined }}>
              {{
                UPLOAD: '1. رفع الملف',
                MAPPING: '2. ربط الأعمدة',
                PREVIEW: isCountMode ? '3. المعاينة والتسوية' : '3. المعاينة والاستيراد',
                DONE: '4. النتيجة',
              }[s]}
            </span>
          </React.Fragment>
        ))}
      </div>

      {step === 'UPLOAD' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2)' }}>
            <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'bold' }}>نوع عملية الاستيراد</span>
            <div style={{ display: 'flex', gap: 'var(--spacing-2)' }}>
              <button
                type="button"
                onClick={() => setMode('ADD_STOCK')}
                disabled={uploadMutation.isPending}
                style={{
                  flex: 1, textAlign: 'right', padding: 'var(--spacing-3)', borderRadius: 'var(--radius-md)',
                  border: `2px solid ${mode === 'ADD_STOCK' ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  background: mode === 'ADD_STOCK' ? 'var(--color-primary-subtle, rgba(59,130,246,0.08))' : 'transparent',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: 'bold', fontSize: 'var(--font-size-sm)' }}>إضافة مخزون (Add Stock)</div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                  الكمية في الملف تُضاف فوق الكمية الحالية — الوضع الافتراضي المعتاد
                </div>
              </button>
              <button
                type="button"
                onClick={() => setMode('INVENTORY_COUNT')}
                disabled={uploadMutation.isPending}
                style={{
                  flex: 1, textAlign: 'right', padding: 'var(--spacing-3)', borderRadius: 'var(--radius-md)',
                  border: `2px solid ${mode === 'INVENTORY_COUNT' ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  background: mode === 'INVENTORY_COUNT' ? 'var(--color-primary-subtle, rgba(59,130,246,0.08))' : 'transparent',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: 'bold', fontSize: 'var(--font-size-sm)' }}>جرد / تسوية مخزون (Inventory Count)</div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                  الكمية في الملف هي الكمية الفعلية بعد الجرد — سيتم حساب الفرق وتطبيقه تلقائيًا
                </div>
              </button>
            </div>
          </div>

          <FileDropzone
            onFileSelected={handleFileSelected}
            disabled={uploadMutation.isPending || mappingMutation.isPending}
            hint={(uploadMutation.isPending || mappingMutation.isPending)
              ? 'جارٍ رفع الملف وفهم بياناته تلقائيًا...'
              : 'اسحب وأفلت ملف Excel (.xlsx) أو CSV هنا، أو اضغط للاختيار — سيتم التعرف على البيانات وإضافتها تلقائيًا'}
          />
          {uploadError && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: 'var(--spacing-3)', borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-danger)', color: 'var(--color-danger)',
              fontSize: 'var(--font-size-sm)',
            }}>
              <AlertTriangle size={14} /> {uploadError}
            </div>
          )}
        </div>
      )}

      {step === 'MAPPING' && uploadResult && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
          <div style={{ fontSize: 'var(--font-size-sm)' }}>
            <strong>{uploadResult.fileName}</strong> — {uploadResult.totalRows} صف في ورقة "{uploadResult.sheetName}"
            {isCountMode && <Badge variant="info" style={{ marginRight: 8 }}>وضع الجرد</Badge>}
          </div>

          {autoMapError && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: 'var(--spacing-3)', borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-danger)', color: 'var(--color-danger)',
              fontSize: 'var(--font-size-sm)',
            }}>
              <AlertTriangle size={14} /> {autoMapError} — راجع الربط المقترح بالأسفل وصحّح ما يلزم ثم تابع
            </div>
          )}

          {isCountMode && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '6px', padding: 'var(--spacing-2)',
              borderRadius: 'var(--radius-md)', border: '1px solid var(--color-info)', fontSize: 'var(--font-size-xs)',
            }}>
              <AlertTriangle size={14} />
              عمود "الكمية" هنا يمثل الكمية الفعلية بعد الجرد وليس كمية إضافية — يجب ربطه، ويجب أن يكون كل منتج مسجلاً في النظام مسبقًا.
            </div>
          )}

          {mappingPresetsQuery.data && mappingPresetsQuery.data.length > 0 && (
            <div style={{ display: 'flex', gap: 'var(--spacing-2)', alignItems: 'center' }}>
              <FolderOpen size={14} />
              <span style={{ fontSize: 'var(--font-size-sm)' }}>تخطيطات محفوظة:</span>
              <Select
                value={selectedPresetId}
                onChange={(e) => handleApplyPreset(e.target.value)}
                options={[{ value: '', label: '— اختر تخطيطًا —' }, ...mappingPresetsQuery.data.map(p => ({ value: p.id, label: p.name }))]}
              />
              {selectedPresetId && (
                <Button size="sm" variant="secondary" onClick={() => handleDeletePreset(selectedPresetId)}>حذف</Button>
              )}
            </div>
          )}

          <div className="table-container">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>العمود في الملف</th>
                  <th>الحقل في النظام</th>
                  <th>الثقة</th>
                </tr>
              </thead>
              <tbody>
                {uploadResult.headers.map(header => {
                  const suggestion = uploadResult.suggestedMapping.find(s => s.header === header);
                  return (
                    <tr key={header}>
                      <td>{header}</td>
                      <td>
                        <Select
                          value={mapping[header] || ''}
                          onChange={(e) => setMapping(prev => ({ ...prev, [header]: e.target.value }))}
                          options={[{ value: '', label: '— بدون ربط —' }, ...IMPORT_FIELDS.map(f => ({ value: f.code, label: f.labelAr + (f.required ? ' *' : '') }))]}
                        />
                      </td>
                      <td>
                        {suggestion && suggestion.field && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Badge variant={suggestion.autoMapped ? 'success' : 'warning'}>
                              {Math.round(suggestion.confidence * 100)}%
                            </Badge>
                            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                              {SOURCE_LABELS[suggestion.source || 'HEADER']}
                            </span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!isCountMode && (
            <div style={{ display: 'flex', gap: 'var(--spacing-4)', fontSize: 'var(--font-size-sm)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <input type="checkbox" checked={autoCreateSupplier} onChange={(e) => setAutoCreateSupplier(e.target.checked)} />
                إنشاء الموردين تلقائيًا إذا لم يكونوا موجودين
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <input type="checkbox" checked={priceWarningOnly} onChange={(e) => setPriceWarningOnly(e.target.checked)} />
                اعتبار سعر البيع الأقل من التكلفة تحذيرًا فقط (وليس خطأ)
              </label>
            </div>
          )}

          <div style={{ display: 'flex', gap: 'var(--spacing-2)', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="اسم التخطيط لحفظه..."
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              style={{ padding: 'var(--spacing-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: 'var(--font-size-sm)' }}
            />
            <Button size="sm" variant="secondary" disabled={!presetName.trim() || savePresetMutation.isPending} onClick={handleSavePreset}>
              <Save size={14} /> حفظ التخطيط
            </Button>
          </div>

          {!requiredFieldsMapped && (
            <div style={{ color: 'var(--color-danger)', fontSize: 'var(--font-size-xs)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertTriangle size={14} /> اربط عمودًا واحدًا على الأقل يحدد المنتج: اسم المنتج أو SKU أو الباركود
            </div>
          )}
          {requiredFieldsMapped && missingValueColumns.length > 0 && (
            <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertTriangle size={14} /> لا يوجد في الملف عمود لـ: {missingValueColumns.join('، ')}
              {isCountMode ? ' — يجب ربط عمود الكمية المجرودة لكل منتج' : ' — سيتم استيرادها بقيمة 0 ويمكنك تعديلها بعد الاستيراد'}
            </div>
          )}

          <div style={{ display: 'flex', gap: 'var(--spacing-2)', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={resetWizard}>إلغاء</Button>
            <Button variant="primary" disabled={!requiredFieldsMapped || mappingMutation.isPending} onClick={handleConfirmMapping}>
              {mappingMutation.isPending ? 'جارٍ التحقق من البيانات...' : 'التحقق من صحة البيانات ومتابعة'}
            </Button>
          </div>
        </div>
      )}

      {step === 'PREVIEW' && mappingSummary && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
          <div style={{ display: 'flex', gap: 'var(--spacing-2)', flexWrap: 'wrap' }}>
            <Badge variant="gray">الإجمالي: {mappingSummary.totalRows}</Badge>
            {isCountMode ? (
              <Badge variant="info">جاهزة للتسوية: {mappingSummary.updateRows}</Badge>
            ) : (
              <>
                <Badge variant="success">منتجات جديدة: {mappingSummary.newRows}</Badge>
                <Badge variant="warning">منتجات للتحديث: {mappingSummary.duplicateRows}</Badge>
              </>
            )}
            <Badge variant="info">تحذيرات: {mappingSummary.warningRows}</Badge>
            <Badge variant="danger">أخطاء: {mappingSummary.errorRows}</Badge>
            {uploadResult?.aiAssisted && <Badge variant="info">تم ربط بعض الأعمدة بالذكاء الاصطناعي</Badge>}
          </div>

          {/* The wizard skips the mapping screen when auto-mapping succeeds, so anything it
              had to assume is surfaced here — the last stop before data is written. */}
          {!isCountMode && missingValueColumns.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
              <AlertTriangle size={14} />
              <span>لم يتم التعرف على عمود لـ: {missingValueColumns.join('، ')} — سيتم استيرادها بقيمة 0</span>
              <Button size="sm" variant="secondary" onClick={() => setStep('MAPPING')}>مراجعة ربط الأعمدة</Button>
            </div>
          )}

          {isCountMode && mappingSummary.errorRows > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)', fontSize: 'var(--font-size-xs)', color: 'var(--color-danger)' }}>
              <AlertTriangle size={14} />
              <span>{mappingSummary.errorRows} صف لن يتم تسويته (منتج غير موجود، مكرر بالملف، أو كمية غير صحيحة) — راجع القائمة قبل المتابعة</span>
            </div>
          )}

          {!isCountMode && mappingSummary.duplicateRows > 0 && (
            <div style={{ display: 'flex', gap: 'var(--spacing-2)', alignItems: 'center' }}>
              <span style={{ fontSize: 'var(--font-size-sm)' }}>تطبيق على كل التكرارات:</span>
              <Button size="sm" variant="secondary" onClick={() => handleResolveAll('UPDATE_EXISTING')}>تحديث الموجود</Button>
              <Button size="sm" variant="secondary" onClick={() => handleResolveAll('SKIP')}>تخطي</Button>
              <Button size="sm" variant="secondary" onClick={() => handleResolveAll('CREATE_NEW')}>إنشاء جديد</Button>
            </div>
          )}

          <div style={{ display: 'flex', gap: 'var(--spacing-2)' }}>
            {(isCountMode ? ['', 'COUNT_MATCHED', 'ERROR'] : ['', 'NEW', 'DUPLICATE', 'ERROR']).map(s => (
              <Button key={s || 'ALL'} size="sm" variant={statusFilter === s ? 'primary' : 'secondary'} onClick={() => setStatusFilter(s)}>
                {s === '' ? 'الكل' : IMPORT_STATUS_LABELS[s]}
              </Button>
            ))}
          </div>

          <DataTable
            data={previewQuery.data?.content || []}
            columns={previewColumns as any}
            rowKey="itemId"
            searchField="productName"
            searchPlaceholder="ابحث في المعاينة..."
            pageSize={20}
          />

          <div style={{ display: 'flex', gap: 'var(--spacing-2)', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setStep('MAPPING')}>رجوع</Button>
            <Button variant="primary" disabled={commitMutation.isPending} onClick={handleCommit}>
              {commitMutation.isPending
                ? (isCountMode ? 'جارٍ تنفيذ الجرد...' : 'جارٍ تنفيذ الاستيراد...')
                : (isCountMode ? 'تأكيد الجرد (Confirm Inventory Reconciliation)' : 'تنفيذ الاستيراد')}
            </Button>
          </div>
        </div>
      )}

      {step === 'DONE' && summary && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)', alignItems: 'center', padding: 'var(--spacing-8)' }}>
          <CheckCircle2 size={48} style={{ color: 'var(--color-success)' }} />
          <h3>{isCountMode ? 'اكتملت تسوية المخزون' : 'اكتمل الاستيراد'}</h3>
          <div style={{ display: 'flex', gap: 'var(--spacing-4)', flexWrap: 'wrap', justifyContent: 'center' }}>
            {isCountMode ? (
              <Badge variant="info">تمت تسويتها: {summary.updated}</Badge>
            ) : (
              <>
                <Badge variant="success">تم استيراد: {summary.imported}</Badge>
                <Badge variant="info">تم تحديث: {summary.updated}</Badge>
                <Badge variant="gray">تم تخطي: {summary.skipped}</Badge>
              </>
            )}
            <Badge variant="danger">فشل: {summary.failed}</Badge>
          </div>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
            زمن التنفيذ: {(summary.executionTimeMs / 1000).toFixed(1)} ثانية
          </span>
          <div style={{ display: 'flex', gap: 'var(--spacing-2)' }}>
            {summary.failed > 0 && (
              <Button variant="secondary" disabled={downloadingReport} onClick={handleDownloadErrorReport}>
                <Download size={14} /> {downloadingReport ? 'جارٍ التحميل...' : 'تحميل تقرير الأخطاء'}
              </Button>
            )}
            <Button variant="primary" onClick={resetWizard}>
              <RotateCcw size={14} /> استيراد ملف آخر
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImportWizard;
