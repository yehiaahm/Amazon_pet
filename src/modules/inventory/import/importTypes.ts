/** How the backend arrived at a suggestion: header aliases, the column's data, or the AI provider. */
export type MappingSource = 'HEADER' | 'VALUES' | 'AI';

/**
 * ADD_STOCK: the Excel quantity is added on top of current stock (existing default behavior).
 * INVENTORY_COUNT: the Excel quantity is the actual counted stock — the system computes and
 * applies the adjustment needed to reach it, and writes an audit trail entry per product.
 */
export type ImportMode = 'ADD_STOCK' | 'INVENTORY_COUNT';

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
  /** Echoes back the mode chosen at upload time. */
  importMode?: ImportMode;
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
  status: 'PENDING' | 'NEW' | 'UPDATE' | 'DUPLICATE' | 'COUNT_MATCHED' | 'ERROR' | 'IMPORTED' | 'UPDATED' | 'SKIPPED' | 'FAILED';
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
  /** INVENTORY_COUNT mode only. */
  systemQuantity?: number;
  countedQuantity?: number;
  adjustmentQuantity?: number;
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
  COUNT_MATCHED: 'جاهز للتسوية',
  ERROR: 'خطأ',
  IMPORTED: 'تم الاستيراد',
  UPDATED: 'تمت التسوية',
  SKIPPED: 'تم التخطي',
  FAILED: 'فشل',
  PENDING: 'قيد الانتظار',
};

/** Saved header -> field mapping the user can reapply on a future upload. */
export interface ImportMappingPreset {
  id: string;
  name: string;
  importMode: ImportMode;
  mapping: Record<string, string>;
  createdAt: string;
}
