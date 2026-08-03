import React, { useRef, useState } from 'react';
import readXlsxFile from 'read-excel-file';
import {
  useImportHistory,
  useStartImportSession,
  useUploadImportChunk,
  useFinalizeImportSession,
  useUndoImportSession,
  useDeleteImportSession,
} from '../../core/hooks/useERPData';
import { useUIStore } from '../../core/stores/uiStore';
import {
  autoMapImportColumns,
  normalizeExpiryDate,
  type ImportFieldKey,
  IMPORT_FIELD_KEYS,
} from './importMapping';
import Button from '../../components/ui/Button';
import DataTable from '../../components/ui/DataTable';
import Badge from '../../components/ui/Badge';
import { Upload, RotateCcw, Trash2 } from 'lucide-react';

const CHUNK_SIZE = 50;

async function hashFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function cellValue(row: Record<string, unknown>, header: string): unknown {
  if (!header) return undefined;
  return row[header];
}

async function readWorkbookRows(file: File): Promise<Record<string, unknown>[]> {
  if (file.name.toLowerCase().endsWith('.csv')) {
    const csvText = await file.text();
    const [headerLine, ...dataLines] = csvText.split(/\r?\n/).filter((line) => line.trim() !== '');
    if (!headerLine) return [];
    const headers = headerLine.split(',').map((h) => h.trim());
    return dataLines.map((line) => {
      const values = line.split(',');
      const row: Record<string, unknown> = {};
      headers.forEach((header, index) => {
        if (!header) return;
        row[header] = values[index] ?? '';
      });
      return row;
    });
  }

  const rows = await readXlsxFile(file);
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => String(h ?? '').trim());
  if (headers.length === 0) return [];

  const normalizedRows: Record<string, unknown>[] = [];
  for (let rowNumber = 1; rowNumber < rows.length; rowNumber += 1) {
    const row = rows[rowNumber];
    const rowObject: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      if (!header) return;
      rowObject[header] = row[index] ?? '';
    });
    normalizedRows.push(rowObject);
  }
  return normalizedRows;
}

function mapRowToItem(
  row: Record<string, unknown>,
  mappings: Record<ImportFieldKey, string>
): Record<string, unknown> {
  const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const str = (v: unknown) => (v === null || v === undefined ? undefined : String(v).trim() || undefined);
  const expiryRaw = cellValue(row, mappings.expiryDate);
  return {
    sku: str(cellValue(row, mappings.sku)),
    productName: str(cellValue(row, mappings.productName)),
    variantName: str(cellValue(row, mappings.variantName)),
    cost: num(cellValue(row, mappings.cost)),
    price: num(cellValue(row, mappings.price)),
    stock: num(cellValue(row, mappings.stock)) ?? 0,
    categoryName: str(cellValue(row, mappings.categoryName)),
    brand: str(cellValue(row, mappings.brand)),
    supplier: str(cellValue(row, mappings.supplier)),
    expiryDate: normalizeExpiryDate(expiryRaw),
  };
}

const ImportPanel: React.FC = () => {
  const fileRef = useRef<HTMLInputElement>(null);
  const currentEmployee = useUIStore((s) => s.currentEmployee)!;
  const addNotification = useUIStore((s) => s.addNotification);

  const { data: history = [], isLoading: loadingHistory } = useImportHistory();
  const { mutateAsync: startSession, isPending: starting } = useStartImportSession();
  const { mutateAsync: uploadChunk, isPending: uploading } = useUploadImportChunk();
  const { mutateAsync: finalizeSession, isPending: finalizing } = useFinalizeImportSession();
  const { mutateAsync: undoSession, isPending: undoing } = useUndoImportSession();
  const { mutateAsync: deleteSession, isPending: deleting } = useDeleteImportSession();

  const [importing, setImporting] = useState(false);
  const [previewCount, setPreviewCount] = useState<number | null>(null);

  const handleFile = async (file: File) => {
    setImporting(true);
    setPreviewCount(null);
    try {
      const rows = await readWorkbookRows(file);
      if (rows.length === 0) {
        addNotification('WARNINGS', 'ملف فارغ', 'لا توجد صفوف بيانات في الملف.');
        return;
      }

      const headers = Object.keys(rows[0] || {});
      const mappings = autoMapImportColumns(headers);
      const items = rows
        .map((row) => mapRowToItem(row, mappings))
        .filter((item) => item.sku || item.productName);

      if (items.length === 0) {
        addNotification('WARNINGS', 'تعذر التعرف على الأعمدة', 'تحقق من رؤوس الأعمدة (SKU، اسم المنتج، الكمية...).');
        return;
      }

      setPreviewCount(items.length);
      const fileHash = await hashFile(file);

      const session = await startSession({
        fileName: file.name,
        fileSize: file.size,
        fileHash,
        duplicateStrategy: 'SKIP',
        targetType: 'PRODUCTS',
        uploadedBy: currentEmployee.id,
      });

      for (let i = 0; i < items.length; i += CHUNK_SIZE) {
        const chunk = items.slice(i, i + CHUNK_SIZE);
        await uploadChunk({
          sessionId: session.id,
          items: chunk,
          chunkIndex: Math.floor(i / CHUNK_SIZE),
          dryRun: false,
          employeeId: currentEmployee.id,
        });
      }

      await finalizeSession(session.id);
      addNotification('INVENTORY', 'اكتمل الاستيراد', `تم استيراد ${items.length} صف بنجاح.`);
    } catch (err: any) {
      addNotification('WARNINGS', 'فشل الاستيراد', err?.message || 'حدث خطأ أثناء معالجة الملف.');
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const busy = importing || starting || uploading || finalizing || undoing || deleting;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div
        style={{
          padding: '16px',
          border: '1px dashed var(--color-border)',
          borderRadius: '8px',
          background: 'var(--color-surface)',
        }}
      >
        <p style={{ marginBottom: '12px', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
          ارفع ملف Excel أو CSV لاستيراد المنتجات. يتم التعرف التلقائي على الأعمدة:
          {' '}
          {IMPORT_FIELD_KEYS.slice(0, 6).join('، ')}...
        </p>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          <Button
            variant="primary"
            size="sm"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={14} /> {busy ? 'جاري الاستيراد...' : 'اختيار ملف واستيراد'}
          </Button>
          {previewCount !== null && (
            <Badge variant="success">آخر استيراد: {previewCount} صف</Badge>
          )}
        </div>
      </div>

      <div>
        <h3 style={{ marginBottom: '8px', fontSize: 'var(--font-size-md)' }}>سجل عمليات الاستيراد</h3>
        {loadingHistory ? (
          <div className="skeleton" style={{ height: '120px' }} />
        ) : (
          <DataTable
            data={history}
            rowKey="id"
            searchField="fileName"
            searchPlaceholder="ابحث باسم الملف..."
            columns={[
              { header: 'الملف', accessor: 'fileName' as const, key: 'fileName', sortable: true },
              { header: 'الحالة', accessor: 'status' as const, key: 'status' },
              { header: 'الصفوف', accessor: 'totalRows' as const, key: 'totalRows' },
              { header: 'نجاح', accessor: 'successRows' as const, key: 'successRows' },
              { header: 'أخطاء', accessor: 'errorRows' as const, key: 'errorRows' },
              {
                header: 'إجراءات',
                key: 'actions',
                accessor: (row: any) => (
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {row.status === 'COMPLETED' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() =>
                          undoSession(
                            { sessionId: row.id, employeeId: currentEmployee.id },
                            {
                              onError: (err: any) =>
                                addNotification('WARNINGS', 'فشل التراجع', err?.message),
                            }
                          )
                        }
                      >
                        <RotateCcw size={12} /> تراجع
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => {
                        if (!window.confirm('حذف جلسة الاستيراد والمنتجات المرتبطة؟')) return;
                        deleteSession(
                          { sessionId: row.id, employeeId: currentEmployee.id },
                          {
                            onError: (err: any) =>
                              addNotification('WARNINGS', 'فشل الحذف', err?.message),
                          }
                        );
                      }}
                    >
                      <Trash2 size={12} /> حذف
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        )}
      </div>
    </div>
  );
};

export default ImportPanel;
