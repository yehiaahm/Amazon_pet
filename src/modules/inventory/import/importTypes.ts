/** How the backend arrived at a suggestion: header aliases, the column's data, or the AI provider. */
export type MappingSource = 'HEADER' | 'VALUES' | 'AI';

export interface ColumnMappingSuggestion {
  header: string;
  field: string | null;
  confidence: number;
  autoMapped: boolean;
  source?: MappingSource;
}

export interface ImportUploadResponse {
  sessionId: string;
  fileName: string;
  sheetName: string;
  totalRows: number;
  headers: string[];
  suggestedMapping: ColumnMappingSuggestion[];
  /** True when the AI resolved a column the alias/value matchers could not. */
  aiAssisted?: boolean;
  /** Field codes with no column in the file — imported as 0 unless the user maps them. */
  unmappedFields?: string[];
}

export interface ImportMappingResponse {
  sessionId: string;
  totalRows: number;
  newRows: number;
  updateRows: number;
  duplicateRows: number;
  errorRows: number;
  /** Rows that will import cleanly but had something worth a second look. */
  warningRows: number;
}

export interface ImportPreviewRow {
  itemId: string;
  rowNumber: number;
  status: 'PENDING' | 'NEW' | 'UPDATE' | 'DUPLICATE' | 'ERROR' | 'IMPORTED' | 'UPDATED' | 'SKIPPED' | 'FAILED';
  barcode?: string;
  sku?: string;
  productName?: string;
  brand?: string;
  category?: string;
  variant?: string;
  unit?: string;
  quantity?: string;
  costPrice?: string;
  sellingPrice?: string;
  warehouse?: string;
  supplier?: string;
  expiryDate?: string;
  batchNumber?: string;
  duplicateMatchType?: string;
  resolution?: string;
  errors: string[];
  warnings: string[];
}

export interface ImportPreviewPage {
  content: ImportPreviewRow[];
  totalElements: number;
  totalPages: number;
}

export interface ImportSummary {
  sessionId: string;
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  executionTimeMs: number;
}

export interface ImportFieldDef {
  code: string;
  labelAr: string;
  required: boolean;
}

/**
 * `required` marks the fields the import cannot invent a value for. Only one of
 * SKU / اسم المنتج / الباركود actually has to be mapped (see `isMappingComplete`);
 * quantity and prices default to 0 with a per-row warning when the file has no column
 * for them, which is what lets a partial sheet still import.
 */
export const IMPORT_FIELDS: ImportFieldDef[] = [
  { code: 'sku', labelAr: 'SKU', required: false },
  { code: 'productName', labelAr: 'اسم المنتج', required: true },
  { code: 'barcode', labelAr: 'الباركود', required: false },
  { code: 'brand', labelAr: 'الماركة', required: false },
  { code: 'category', labelAr: 'الفئة', required: false },
  { code: 'variant', labelAr: 'الصنف/المتغير', required: false },
  { code: 'unit', labelAr: 'الوحدة', required: false },
  { code: 'quantity', labelAr: 'الكمية', required: false },
  { code: 'costPrice', labelAr: 'سعر التكلفة', required: false },
  { code: 'sellingPrice', labelAr: 'سعر البيع', required: false },
  { code: 'minimumStock', labelAr: 'حد الطلب الأدنى', required: false },
  { code: 'warehouse', labelAr: 'المخزن', required: false },
  { code: 'supplier', labelAr: 'المورد', required: false },
  { code: 'expiryDate', labelAr: 'تاريخ الصلاحية', required: false },
  { code: 'batchNumber', labelAr: 'رقم الباتش', required: false },
  { code: 'notes', labelAr: 'ملاحظات', required: false },
];

export const IMPORT_STATUS_LABELS: Record<string, string> = {
  NEW: 'جديد',
  UPDATE: 'تحديث',
  DUPLICATE: 'مكرر',
  ERROR: 'خطأ',
  IMPORTED: 'تم الاستيراد',
  UPDATED: 'تم التحديث',
  SKIPPED: 'تم التخطي',
  FAILED: 'فشل',
  PENDING: 'قيد الانتظار',
};
