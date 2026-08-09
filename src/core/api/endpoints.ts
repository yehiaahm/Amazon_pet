import { 
  Product, ProductVariant, Warehouse, StockMovement, 
  Customer, Pet, Service, Appointment, Expense, 
  DailyClosing, POSSession, Sale, KPIMetrics, DashboardMetrics, AIAdvisorInsight,
  PurchaseInvoice, BoardingReservation, TenantBarcodeSettings,
  PurchaseInvoiceCreateResponse, SaleRefundResult, SaleBatchAllocationRow,
  AccountsPayableDashboard, PurchaseInvoiceInstallment,
  SalesQueryParams, SalesPageResult
} from '../../types/erp';
import { useUIStore } from '../stores/uiStore';
import { usePermissionStore } from '../permissions/permissionStore';
import { getBackendUrl } from './backendUrl';
import {
  ImportUploadResponse, ImportMappingResponse, ImportPreviewPage, ImportSummary,
} from '../../modules/inventory/import/importTypes';

export interface CatalogQueryParams {
  page?: number;
  size?: number;
  sort?: string;
  search?: string;
  category?: string;
  brand?: string;
  supplier?: string;
  status?: string;
  barcode?: string;
  sku?: string;
  lowStock?: boolean;
}

export interface CatalogVariantRow {
  variantId: string;
  productId: string;
  sku: string;
  productName: string;
  variantName: string;
  price: number;
  cost: number;
  wholesalePrice?: number;
  stockQuantity: number;
  minStockLimit: number;
  reorderLevel: number;
  barcode?: string;
  barcodeFormat?: ProductVariant['barcodeFormat'];
  barcodeGenerated?: boolean;
  barcodeSource?: ProductVariant['barcodeSource'];
  barcodeStatus?: ProductVariant['barcodeStatus'];
  categoryId?: string;
  categoryName?: string;
  brandId?: string;
  brandName?: string;
  supplierId?: string;
  supplierName?: string;
}

export interface CatalogPageResult {
  content: CatalogVariantRow[];
  totalElements: number;
  totalPages: number;
  page: number;
  size: number;
  sort: string;
}

function mapCatalogToProducts(rows: CatalogVariantRow[]): Product[] {
  const byProduct = new Map<string, Product>();
  for (const row of rows) {
    if (!row.productId || byProduct.has(row.productId)) continue;
    byProduct.set(row.productId, {
      id: row.productId,
      sku: row.sku,
      name: row.productName,
      categoryId: row.categoryId || 'cat-1',
      brandId: row.brandId || 'br-1',
      unitId: 'u-1',
      minStockLimit: row.minStockLimit ?? 10,
      reorderLevel: row.reorderLevel ?? 0,
      categoryName: row.categoryName,
      brandName: row.brandName,
      supplierId: row.supplierId,
      supplierName: row.supplierName,
    });
  }
  return Array.from(byProduct.values());
}

function mapCatalogToVariants(rows: CatalogVariantRow[]): ProductVariant[] {
  return rows.map((row) => ({
    id: row.variantId,
    productId: row.productId,
    name: row.variantName,
    price: Number(row.price),
    cost: Number(row.cost),
    wholesalePrice: row.wholesalePrice != null ? Number(row.wholesalePrice) : undefined,
    stockQuantity: row.stockQuantity,
    barcode: row.barcode,
    barcodeFormat: row.barcodeFormat,
    barcodeGenerated: row.barcodeGenerated,
    barcodeSource: row.barcodeSource,
    barcodeStatus: row.barcodeStatus,
  }));
}

// ─── HTTP helpers ───────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 30_000;

function generateRequestId(): string {
  return crypto.randomUUID?.()?.substring(0, 12) ?? `${Date.now()}`;
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('انتهت مهلة الطلب — تحقق من اتصال الخادم وحاول مجدداً');
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new Error('لا يوجد اتصال بالشبكة — تحقق من الإنترنت أو الخادم');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

const getHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    'X-Request-Id': generateRequestId(),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

/** Multipart upload: no Content-Type here — the browser sets the boundary itself. */
async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const token = localStorage.getItem('token');
  const res = await fetchWithTimeout(`${getBackendUrl()}${path}`, {
    method: 'POST',
    headers: {
      'X-Request-Id': generateRequestId(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem('token');
      useUIStore.getState().setAuthenticated(false);
      useUIStore.getState().setCurrentEmployee(null);
      usePermissionStore.getState().clearPermissions();
    }
    let errMsg = `HTTP ${res.status}`;
    try {
      const errorJson = await res.json();
      if (errorJson?.message) errMsg = errorJson.message;
    } catch (_) { /* ignore */ }
    throw new Error(errMsg);
  }

  const json = await res.json();
  if (!json.success) {
    throw new Error(json.message || 'Request failed');
  }
  return json.data as T;
}

/** Like apiFetch but also returns optional API warnings (e.g. purchase receipt lines). */
async function apiFetchWithMeta<T>(
  path: string,
  options: RequestInit = {}
): Promise<{ data: T; warnings: unknown[] }> {
  const url = `${getBackendUrl()}${path}`;
  const res = await fetchWithTimeout(url, {
    ...options,
    headers: {
      ...getHeaders(),
      ...(options.headers as Record<string, string> || {}),
    },
  });

  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem('token');
      useUIStore.getState().setAuthenticated(false);
      useUIStore.getState().setCurrentEmployee(null);
      usePermissionStore.getState().clearPermissions();
    }
    let errMsg = `HTTP ${res.status}`;
    try {
      const errorJson = await res.json();
      if (errorJson && errorJson.message) {
        errMsg = errorJson.message;
      }
    } catch (_) {
      // ignore
    }
    throw new Error(errMsg);
  }

  const json = await res.json();
  if (!json.success) {
    throw new Error(json.message || 'Request failed');
  }
  return {
    data: json.data as T,
    warnings: Array.isArray(json.warnings) ? json.warnings : [],
  };
}

/** Central fetch with unified error handling — no silent swallows */
async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { data } = await apiFetchWithMeta<T>(path, options);
  return data;
}

// ─── API surface ─────────────────────────────────────────────────────────────

/** Normalize sale payload from API (nested employee/customer → flat ids). */
function normalizeSale(s: any): Sale {
  return {
    ...s,
    employeeId: s.employee?.id ?? s.employeeId,
    employeeFullName: s.employee?.fullName ?? s.employeeFullName,
    customerId: s.customer?.id ?? s.customerId,
    posSessionId: s.posSession?.id ?? s.posSessionId,
    items: (s.items || []).map((item: any) => ({
      ...item,
      quantityReturned: item.quantityReturned ?? 0,
    })),
  };
}

export const api = {

  // ── PRODUCTS & VARIANTS (paginated catalog) ─────────────────────────────

  async getCatalog(params: CatalogQueryParams = {}): Promise<CatalogPageResult> {
    const qs = new URLSearchParams();
    if (params.page != null) qs.set('page', String(params.page));
    if (params.size != null) qs.set('size', String(params.size));
    if (params.sort) qs.set('sort', params.sort);
    if (params.search) qs.set('search', params.search);
    if (params.category) qs.set('category', params.category);
    if (params.brand) qs.set('brand', params.brand);
    if (params.supplier) qs.set('supplier', params.supplier);
    if (params.status) qs.set('status', params.status);
    if (params.barcode) qs.set('barcode', params.barcode);
    if (params.sku) qs.set('sku', params.sku);
    if (params.lowStock != null) qs.set('lowStock', String(params.lowStock));
    const query = qs.toString();
    const data = await apiFetch<CatalogPageResult>(
      `/v1/inventory/variants${query ? `?${query}` : ''}`
    );
    return data;
  },

  /** @deprecated Use getCatalog — returns catalog mapped to legacy Product shape. */
  async getProducts(params?: CatalogQueryParams): Promise<Product[]> {
    const page = await api.getCatalog({ page: 0, size: 5000, sort: 'name,asc', ...params });
    return mapCatalogToProducts(page.content);
  },

  /** @deprecated Use getCatalog — returns catalog mapped to legacy ProductVariant shape. */
  async getVariants(params?: CatalogQueryParams): Promise<ProductVariant[]> {
    const page = await api.getCatalog({ page: 0, size: 5000, sort: 'name,asc', ...params });
    return mapCatalogToVariants(page.content);
  },

  async getBatches(): Promise<any[]> {
    const data = await apiFetch<any[]>('/v1/inventory/batches');
    return data.map((b: any) => ({
      id: b.id,
      productVariantId: b.productVariantId,
      batchNumber: b.batchNumber,
      expiryDate: b.expiryDate || '',
      quantity: b.quantity ?? b.remainingQuantity ?? 0,
      unitCost: b.unitCost,
      purchaseInvoiceId: b.purchaseInvoiceId,
    }));
  },

  async getFifoValuation(): Promise<{
    totalValuation: number;
    totalActiveBatches?: number;
    totalQuantityInStock?: number;
    generatedAt?: string;
    batchSummaries?: Array<{
      batchId: string;
      batchNumber: string;
      productVariantName?: string;
      remainingQuantity: number;
      unitCost: number;
      totalCostValue: number;
    }>;
  }> {
    return await apiFetch('/v1/inventory/fifo/valuation');
  },

  async getFifoLedger(productVariantId: string): Promise<any[]> {
    return await apiFetch(`/v1/inventory/fifo/ledger/${encodeURIComponent(productVariantId)}`);
  },

  async getFifoDeductionStrategy(): Promise<{ strategy: 'FIFO' | 'FEFO' }> {
    return await apiFetch('/v1/inventory/fifo/strategy');
  },

  async setFifoDeductionStrategy(strategy: 'FIFO' | 'FEFO'): Promise<{ strategy: string }> {
    return await apiFetch('/v1/inventory/fifo/strategy', {
      method: 'PUT',
      body: JSON.stringify({ strategy }),
    });
  },

  async getSaleBatchAllocations(saleId: string): Promise<SaleBatchAllocationRow[]> {
    return await apiFetch(`/v1/sales/${encodeURIComponent(saleId)}/batch-allocations`);
  },

  async reconcileInventory(): Promise<Record<string, unknown>> {
    return await apiFetch('/v1/inventory/reconcile', { method: 'POST' });
  },

  async postInventoryWriteOff(args: {
    inventoryBatchId: string;
    warehouseId?: string;
    quantity: number;
    reason: string;
  }): Promise<void> {
    const wh = args.warehouseId || 'wh-shelf';
    const q = new URLSearchParams({
      inventoryBatchId: args.inventoryBatchId,
      warehouseId: wh,
      quantity: String(args.quantity),
      reason: args.reason,
    });
    await apiFetch(`/v1/inventory/fifo/write-off?${q.toString()}`, { method: 'POST' });
  },

  async getWarehouses(): Promise<Warehouse[]> {
    return await apiFetch<Warehouse[]>('/v1/inventory/warehouses');
  },

  async getLowStockAlerts(): Promise<Array<{
    productVariantId: string;
    sku: string;
    productName: string;
    variantName: string;
    stockQuantity: number;
    minStockLimit: number;
    deficit: number;
  }>> {
    return await apiFetch('/v1/inventory/low-stock');
  },

  async applyPhysicalCount(args: {
    variantId: string;
    warehouseId: string;
    countedQuantity: number;
    reason?: string;
  }): Promise<{ variant: ProductVariant; systemQuantity: number; countedQuantity: number; difference: number }> {
    return await apiFetch('/v1/inventory/count', {
      method: 'POST',
      body: JSON.stringify(args),
    });
  },

  async addProduct(
    product: Omit<Product, 'id'> & { categoryName?: string; brandName?: string; supplierName?: string; initialStock?: number },
    variant: Omit<ProductVariant, 'id' | 'productId' | 'stockQuantity'> & { initialStock?: number; barcode?: string; barcodeFormat?: string }
  ): Promise<Product> {
    const data = await apiFetch<any>('/v1/products', {
      method: 'POST',
      body: JSON.stringify({
        product: {
          sku: product.sku,
          name: product.name,
          categoryId: product.categoryId,
          categoryName: product.categoryName,
          brandName: product.brandName,
          brandId: product.brandId,
          supplierName: product.supplierName,
          supplierId: product.supplierId,
          unitId: product.unitId,
          minStockLimit: product.minStockLimit,
          reorderLevel: product.reorderLevel ?? 0,
          initialStock: product.initialStock ?? variant.initialStock,
        },
        variant: {
          name: variant.name,
          price: variant.price,
          cost: variant.cost,
          wholesalePrice: variant.wholesalePrice,
          initialStock: variant.initialStock ?? product.initialStock,
          barcode: variant.barcode,
          barcodeFormat: variant.barcodeFormat,
        },
      }),
    });
    return {
      id: data.id,
      sku: data.sku,
      name: data.name,
      categoryId: data.categoryId || product.categoryId || '',
      brandId: data.brandId || product.brandId || '',
      unitId: data.unitId || product.unitId || '',
      minStockLimit: Number(data.minStockLimit ?? product.minStockLimit ?? 10),
    };
  },

  async updateStock(
    variantId: string,
    diff: number,
    type: StockMovement['type'],
    employeeId: string,
    warehouseId: string
  ): Promise<ProductVariant> {
    const data = await apiFetch<any>('/v1/inventory/adjust', {
      method: 'POST',
      body: JSON.stringify({ variantId, warehouseId, diff, type, employeeId }),
    });
    return {
      id: data.id,
      productId: data.product?.id || data.productId || '',
      name: data.name,
      price: Number(data.price ?? 0),
      cost: Number(data.cost ?? 0),
      stockQuantity: Number(data.stockQuantity ?? 0),
      barcode: data.barcode,
      barcodeFormat: data.barcodeFormat,
      barcodeGenerated: data.barcodeGenerated,
      barcodeGeneratedAt: data.barcodeGeneratedAt,
      barcodeSource: data.barcodeSource,
      barcodeStatus: data.barcodeStatus,
    };
  },

  async updateVariantPricing(
    variantId: string,
    pricing: { price?: number; cost?: number; wholesalePrice?: number }
  ): Promise<ProductVariant> {
    const data = await apiFetch<any>(`/v1/inventory/variants/${variantId}/pricing`, {
      method: 'PUT',
      body: JSON.stringify(pricing),
    });
    return {
      id: data.id,
      productId: data.product?.id || data.productId || '',
      name: data.name,
      price: Number(data.price ?? 0),
      cost: Number(data.cost ?? 0),
      wholesalePrice: data.wholesalePrice != null ? Number(data.wholesalePrice) : undefined,
      stockQuantity: Number(data.stockQuantity ?? 0),
      barcode: data.barcode,
      barcodeFormat: data.barcodeFormat,
      barcodeGenerated: data.barcodeGenerated,
      barcodeGeneratedAt: data.barcodeGeneratedAt,
      barcodeSource: data.barcodeSource,
      barcodeStatus: data.barcodeStatus,
    };
  },

  async deleteVariant(variantId: string): Promise<void> {
    await apiFetch<void>(`/v1/products/variants/${variantId}`, {
      method: 'DELETE',
    });
  },

  async updateProduct(
    variantId: string,
    payload: {
      product?: Partial<Product> & { categoryName?: string; brandName?: string; supplierName?: string };
      variant?: Partial<ProductVariant>;
    }
  ): Promise<any> {
    return apiFetch<any>(`/v1/products/variants/${variantId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async deleteBatch(batchId: string): Promise<void> {
    await apiFetch<void>(`/v1/inventory/batches/${batchId}`, {
      method: 'DELETE',
    });
  },

  async transferStock(
    sourceWhId: string,
    targetWhId: string,
    variantId: string,
    quantity: number,
    employeeId: string
  ): Promise<boolean> {
    await apiFetch<void>('/v1/inventory/transfer', {
      method: 'POST',
      body: JSON.stringify({ variantId, sourceWarehouseId: sourceWhId, targetWarehouseId: targetWhId, quantity, employeeId }),
    });
    return true;
  },

  // ── POS SESSIONS ─────────────────────────────────────────────────────────

  async getPOSSessions(): Promise<POSSession[]> {
    return await apiFetch<POSSession[]>('/v1/pos-sessions');
  },

  async openPOSSession(openedById: string, openingBalance: number): Promise<POSSession> {
    return await apiFetch<POSSession>('/v1/pos-sessions/open', {
      method: 'POST',
      body: JSON.stringify({ branchId: 'b-1', openedById, openingBalance }),
    });
  },

  async closePOSSession(
    sessionId: string,
    closingBalance: number,
    expectedBalance: number,
    physicalBalance: number,
    closedById: string
  ): Promise<POSSession> {
    const safeClosing = isNaN(Number(closingBalance)) ? 0 : Number(closingBalance);
    const safeExpected = isNaN(Number(expectedBalance)) ? safeClosing : Number(expectedBalance);
    const safePhysical = isNaN(Number(physicalBalance)) ? safeClosing : Number(physicalBalance);

    return await apiFetch<POSSession>(`/v1/pos-sessions/${sessionId}/close`, {
      method: 'POST',
      body: JSON.stringify({
        closingBalance: safeClosing,
        expectedBalance: safeExpected,
        physicalBalance: safePhysical,
        closedById
      }),
    });
  },

  // ── SALES ─────────────────────────────────────────────────────────────────

  async getSales(params: SalesQueryParams = {}): Promise<SalesPageResult> {
    const q = new URLSearchParams();
    if (params.page != null) q.set('page', String(params.page));
    if (params.size != null) q.set('size', String(params.size));
    if (params.sort) q.set('sort', params.sort);
    if (params.search) q.set('search', params.search);
    if (params.dateFrom) q.set('dateFrom', params.dateFrom);
    if (params.dateTo) q.set('dateTo', params.dateTo);
    if (params.customer) q.set('customer', params.customer);
    if (params.employee) q.set('employee', params.employee);
    if (params.status) q.set('status', params.status);
    if (params.paymentMethod) q.set('paymentMethod', params.paymentMethod);
    const suffix = q.toString() ? `?${q.toString()}` : '';
    const data = await apiFetch<any>(`/v1/sales${suffix}`);
    const content = (data.content || []).map((row: any) =>
      normalizeSale({ ...row, items: row.items || [] })
    );
    return {
      content,
      totalElements: data.totalElements ?? content.length,
      totalPages: data.totalPages ?? 1,
      page: data.page ?? 0,
      size: data.size ?? content.length,
      sort: data.sort ?? 'date,desc',
    };
  },

  async getSale(saleId: string): Promise<Sale> {
    const row = await apiFetch<any>(`/v1/sales/${encodeURIComponent(saleId)}`);
    return normalizeSale(row);
  },

  async createSale(
    sale: Omit<Sale, 'id' | 'saleNumber' | 'date'> & { managerPassword?: string; managerUsername?: string; idempotencyKey?: string }
  ): Promise<Sale> {
    const payload = {
      posSessionId: sale.posSessionId,
      totalAmount: sale.totalAmount,
      tax: sale.tax,
      discount: sale.discount,
      paymentMethod: sale.paymentMethod,
      customerId: sale.customerId,
      ...(sale.managerPassword ? { managerPassword: sale.managerPassword } : {}),
      ...(sale.managerUsername ? { managerUsername: sale.managerUsername } : {}),
      items: (sale.items || []).map((item) => ({
        type: item.type,
        itemId: item.itemId,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        listPrice: item.listPrice ?? item.price,
        cost: item.cost ?? 0,
      })),
    };
    
    const headers: Record<string, string> = {};
    if (sale.idempotencyKey) {
      headers['Idempotency-Key'] = sale.idempotencyKey;
    }

    return await apiFetch<Sale>('/v1/sales', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
  },

  async refundSale(
    saleId: string,
    employeeId: string,
    opts?: {
      managerPassword?: string;
      managerUsername?: string;
      lines?: Array<{ saleItemId: string; quantity: number }>;
    }
  ): Promise<SaleRefundResult> {
    return await apiFetch<SaleRefundResult>(`/v1/sales/${saleId}/refund`, {
      method: 'POST',
      body: JSON.stringify({
        employeeId,
        ...(opts?.managerPassword ? { managerPassword: opts.managerPassword } : {}),
        ...(opts?.managerUsername ? { managerUsername: opts.managerUsername } : {}),
        ...(opts?.lines && opts.lines.length > 0 ? { lines: opts.lines } : {}),
      }),
    });
  },

  // ── SERVICES & APPOINTMENTS ───────────────────────────────────────────────

  async getServices(): Promise<Service[]> {
    return await apiFetch<Service[]>('/v1/services');
  },

  async createService(service: {
    name: string;
    price: number;
    durationMinutes: number;
  }): Promise<Service> {
    return await apiFetch<Service>('/v1/services', {
      method: 'POST',
      body: JSON.stringify(service),
    });
  },

  async updateService(
    id: string,
    service: { name: string; price: number; durationMinutes: number }
  ): Promise<Service> {
    return await apiFetch<Service>(`/v1/services/${id}`, {
      method: 'PUT',
      body: JSON.stringify(service),
    });
  },

  async deleteService(id: string): Promise<void> {
    await apiFetch<void>(`/v1/services/${id}`, {
      method: 'DELETE',
    });
  },

  async seedDefaultServices(): Promise<Service[]> {
    return await apiFetch<Service[]>('/v1/services/seed-defaults', {
      method: 'POST',
    });
  },

  async getAppointments(): Promise<Appointment[]> {
    return await apiFetch<Appointment[]>('/v1/appointments');
  },

  async createAppointment(appointment: Omit<Appointment, 'id' | 'status'>): Promise<Appointment> {
    return await apiFetch<Appointment>('/v1/appointments', {
      method: 'POST',
      body: JSON.stringify(appointment),
    });
  },

  async updateAppointmentStatus(
    appointmentId: string,
    status: Appointment['status']
  ): Promise<Appointment> {
    return await apiFetch<Appointment>(`/v1/appointments/${appointmentId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  // ── CRM ───────────────────────────────────────────────────────────────────

  async getCustomers(): Promise<Customer[]> {
    return await apiFetch<Customer[]>('/v1/customers');
  },

  async getPets(): Promise<Pet[]> {
    return await apiFetch<Pet[]>('/v1/pets');
  },

  async addCustomer(
    customer: Omit<Customer, 'id'>,
    pet?: Omit<Pet, 'id' | 'customerId'>
  ): Promise<Customer> {
    return await apiFetch<Customer>('/v1/customers', {
      method: 'POST',
      body: JSON.stringify({ customer, pet }),
    });
  },

  async updateCustomer(
    id: string,
    customer: Partial<Omit<Customer, 'id'>>
  ): Promise<Customer> {
    return await apiFetch<Customer>(`/v1/customers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(customer),
    });
  },

  async deleteCustomer(id: string): Promise<void> {
    await apiFetch<void>(`/v1/customers/${id}`, {
      method: 'DELETE',
    });
  },

  async getCustomerSales(id: string): Promise<Sale[]> {
    return await apiFetch<Sale[]>(`/v1/customers/${id}/sales`);
  },

  // ── FINANCE ───────────────────────────────────────────────────────────────

  async getExpenses(): Promise<Expense[]> {
    return await apiFetch<Expense[]>('/v1/expenses');
  },

  async addExpense(expense: Omit<Expense, 'id' | 'date'>): Promise<Expense> {
    return await apiFetch<Expense>('/v1/expenses', {
      method: 'POST',
      body: JSON.stringify(expense),
    });
  },

  async deleteExpense(id: string): Promise<void> {
    await apiFetch<void>(`/v1/expenses/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  async getDailyClosings(): Promise<DailyClosing[]> {
    return await apiFetch<DailyClosing[]>('/v1/daily-closings');
  },

  // ── ANALYTICS & AI ────────────────────────────────────────────────────────

  async getKPIMetrics(): Promise<KPIMetrics> {
    const data = await apiFetch<Record<string, any>>('/v1/analytics/kpis');
    return {
      grossRevenue: Number(data['إجمالي_الإيرادات'] ?? 0),
      grossProfit: Number(data['إجمالي_الربح'] ?? 0),
      netProfit: Number(data['صافي_الربح'] ?? 0),
      profitMargin: parseFloat(String(data['نسبة_هامش_الربح_الإجمالي'] ?? '0')),
      cogs: Number(data['تكلفة_البضاعة_المباعة'] ?? 0),
      inventoryTurnover: parseFloat(String(data['معدل_دوران_المخزون'] ?? '0')),
      inventoryValue: Number(data['قيمة_المخزون'] ?? 0),
      averageBasket: Number(data['متوسط_السلة'] ?? 0),
      clv: 0,
      repeatCustomerRate: parseFloat(String(data['معدل_تكرار_العملاء'] ?? '0')),
      deadStockCount: Number(data['عدد_المنتجات_الراكدة'] ?? 0),
      fastMovingItems: [],
      slowMovingItems: [],
      cashFlow: 0,
      burnRate: Number(data['إجمالي_المصاريف'] ?? 0),
    };
  },

  async getDashboardMetrics(): Promise<DashboardMetrics> {
    const data = await apiFetch<Record<string, any>>('/v1/analytics/dashboard');
    const num = (v: unknown, fallback = 0) => Number(v ?? fallback);
    const block = (raw: Record<string, unknown> | undefined): DashboardMetrics['todaySales'] => ({
      revenue: num(raw?.revenue),
      count: num(raw?.count),
      previousRevenue: num(raw?.previousRevenue),
      trendPct: num(raw?.trendPct),
    });
    const amount = (raw: Record<string, unknown> | undefined): DashboardMetrics['netProfit'] => ({
      amount: num(raw?.amount),
      previousAmount: num(raw?.previousAmount),
      trendPct: num(raw?.trendPct),
    });
    const chart = Array.isArray(data.monthlyChart) ? data.monthlyChart : [];
    const alerts = Array.isArray(data.alerts) ? data.alerts : [];
    const best = Array.isArray(data.bestSellingProducts) ? data.bestSellingProducts : [];
    const customers = Array.isArray(data.topCustomers) ? data.topCustomers : [];
    const suppliers = Array.isArray(data.topSuppliers) ? data.topSuppliers : [];

    return {
      todaySales: block(data.todaySales),
      monthlySales: block(data.monthlySales),
      netProfit: amount(data.netProfit),
      expenses: amount(data.expenses),
      purchases: amount(data.purchases),
      inventoryValue: num(data.inventoryValue),
      grossMargin: num(data.grossMargin),
      cogs: num(data.cogs),
      bestSellingProducts: best.map((row: Record<string, unknown>) => ({
        name: String(row.name ?? '—'),
        quantity: num(row.quantity),
        revenue: num(row.revenue),
      })),
      topCustomers: customers.map((row: Record<string, unknown>) => ({
        name: String(row.name ?? '—'),
        orderCount: num(row.orderCount),
        totalSpend: num(row.totalSpend),
      })),
      topSuppliers: suppliers.map((row: Record<string, unknown>) => ({
        name: String(row.name ?? '—'),
        invoiceCount: num(row.invoiceCount),
        totalPurchases: num(row.totalPurchases),
      })),
      alerts: alerts.map((row: Record<string, unknown>) => ({
        rule: String(row.rule ?? ''),
        severity: String(row.severity ?? ''),
        message: String(row.message ?? ''),
      })),
      monthlyChart: chart.map((row: Record<string, unknown>) => ({
        month: String(row.month ?? ''),
        sales: num(row.sales),
        expenses: num(row.expenses),
        purchases: num(row.purchases),
        productRevenue: num(row.productRevenue),
        serviceRevenue: num(row.serviceRevenue),
      })),
    };
  },

  async getAIInsights(): Promise<AIAdvisorInsight> {
    const data = await apiFetch<string>('/v1/ai/insights');
    return {
      businessSummary: data,
      criticalAlerts: [],
      topOpportunities: [],
      recommendations: [],
      forecastText: '',
    };
  },

  async askAIAdvisor(query: string, clientContext?: string): Promise<string> {
    return await apiFetch<string>('/v1/ai/ask', {
      method: 'POST',
      body: JSON.stringify({
        tenantId: 't-1',
        query,
        ...(clientContext ? { clientContext } : {}),
      }),
    });
  },

  // ── AUDIT LOGS ────────────────────────────────────────────────────────────

  async getAuditLogs(): Promise<any[]> {
    return await apiFetch<any[]>('/v1/audit-logs');
  },

  // ── AI INVOICE SCANNER ────────────────────────────────────────────────────

  async analyzeInvoiceImage(imageBase64: string, mimeType: string, _hintCategory?: string): Promise<any> {
    const raw = await apiFetch<string>('/v1/ai/analyze-invoice', {
      method: 'POST',
      body: JSON.stringify({ imageBase64, mimeType }),
    });
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  },

  // ── PURCHASE INVOICES ─────────────────────────────────────────────────────

  async createPurchaseInvoice(invoice: any, employeeId: string): Promise<PurchaseInvoiceCreateResponse> {
    const { data, warnings } = await apiFetchWithMeta<PurchaseInvoice>(
      `/v1/purchase-invoices?employeeId=${encodeURIComponent(employeeId)}`,
      {
        method: 'POST',
        body: JSON.stringify(invoice),
      }
    );
    return {
      invoice: data,
      warnings: warnings as PurchaseInvoiceCreateResponse['warnings'],
    };
  },

  async getPurchaseInvoices(): Promise<PurchaseInvoice[]> {
    return await apiFetch<PurchaseInvoice[]>('/v1/purchase-invoices');
  },

  async payPurchaseInvoice(id: string, amount: number): Promise<PurchaseInvoice> {
    return await apiFetch<PurchaseInvoice>(`/v1/purchase-invoices/${id}/pay?amount=${amount}`, {
      method: 'PUT',
    });
  },

  // ── ACCOUNTS PAYABLE ──────────────────────────────────────────────────────

  async getAccountsPayableDashboard(): Promise<AccountsPayableDashboard> {
    return await apiFetch<AccountsPayableDashboard>('/v1/accounts-payable/dashboard');
  },

  async getInvoiceInstallments(invoiceId: string): Promise<PurchaseInvoiceInstallment[]> {
    return await apiFetch<PurchaseInvoiceInstallment[]>(`/v1/accounts-payable/invoices/${invoiceId}/installments`);
  },

  async setInvoiceInstallments(
    invoiceId: string,
    paymentType: 'LUMP_SUM' | 'INSTALLMENTS',
    installments: Array<{ installmentNumber: number; dueDate: string; amount: number; notes?: string }>
  ): Promise<PurchaseInvoice> {
    return await apiFetch<PurchaseInvoice>(`/v1/accounts-payable/invoices/${invoiceId}/installments`, {
      method: 'PUT',
      body: JSON.stringify({ paymentType, installments }),
    });
  },

  async payInstallment(installmentId: string, amount: number, notes?: string): Promise<PurchaseInvoiceInstallment> {
    return await apiFetch<PurchaseInvoiceInstallment>(`/v1/accounts-payable/installments/${installmentId}/pay`, {
      method: 'PUT',
      body: JSON.stringify({ amount, notes }),
    });
  },

  async getAccountsPayableSettings(): Promise<{ tenantId: string; reminderDaysBeforeDue: number }> {
    return await apiFetch('/v1/accounts-payable/settings');
  },

  async updateAccountsPayableSettings(reminderDaysBeforeDue: number): Promise<{ tenantId: string; reminderDaysBeforeDue: number }> {
    return await apiFetch('/v1/accounts-payable/settings', {
      method: 'PUT',
      body: JSON.stringify({ reminderDaysBeforeDue }),
    });
  },

  // ── SUPPLIERS ─────────────────────────────────────────────────────────────

  async getSuppliers(): Promise<any[]> {
    return await apiFetch<any[]>('/v1/suppliers');
  },

  // ── BOARDING RESERVATIONS ─────────────────────────────────────────────────

  async getBoardingReservations(): Promise<BoardingReservation[]> {
    return await apiFetch<BoardingReservation[]>('/v1/boarding-reservations');
  },

  async addBoardingReservation(
    reservation: Omit<BoardingReservation, 'id' | 'status'>
  ): Promise<BoardingReservation> {
    return await apiFetch<BoardingReservation>('/v1/boarding-reservations', {
      method: 'POST',
      body: JSON.stringify(reservation),
    });
  },

  async updateBoardingStatus(id: string, status: string): Promise<BoardingReservation> {
    return await apiFetch<BoardingReservation>(
      `/v1/boarding-reservations/${id}/status?status=${encodeURIComponent(status)}`,
      { method: 'PUT' }
    );
  },

  async deleteBoardingReservation(id: string): Promise<void> {
    await apiFetch<void>(`/v1/boarding-reservations/${id}`, { method: 'DELETE' });
  },

  async getEmployees(): Promise<any[]> {
    return await apiFetch<any[]>('/v1/employees');
  },

  async addEmployee(employee: any): Promise<any> {
    return await apiFetch<any>('/v1/employees', {
      method: 'POST',
      body: JSON.stringify(employee),
    });
  },

  async updateEmployee(id: string, data: { fullName?: string; email?: string; role?: string; active?: boolean }): Promise<any> {
    return await apiFetch<any>(`/v1/employees/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteEmployee(id: string): Promise<void> {
    await apiFetch<void>(`/v1/employees/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  async changePassword(id: string, newPassword: string): Promise<void> {
    await apiFetch<void>(`/v1/employees/${encodeURIComponent(id)}/password`, {
      method: 'PUT',
      body: JSON.stringify({ newPassword }),
    });
  },

  async getMyPermissions(): Promise<string[]> {
    return await apiFetch<string[]>('/v1/me/permissions');
  },

  // ── ROLES & PERMISSIONS ────────────────────────────────────────────────────

  async getRoles(): Promise<any[]> {
    return await apiFetch<any[]>('/v1/roles');
  },

  async getPermissionsCatalog(): Promise<any[]> {
    return await apiFetch<any[]>('/v1/roles/permissions');
  },

  async getRole(id: string): Promise<any> {
    return await apiFetch<any>(`/v1/roles/${encodeURIComponent(id)}`);
  },

  async createRole(role: { code: string; name: string; description?: string }): Promise<any> {
    return await apiFetch<any>('/v1/roles', {
      method: 'POST',
      body: JSON.stringify(role),
    });
  },

  async updateRolePermissions(roleId: string, permissionCodes: string[]): Promise<any> {
    return await apiFetch<any>(`/v1/roles/${encodeURIComponent(roleId)}/permissions`, {
      method: 'PUT',
      body: JSON.stringify({ permissionCodes }),
    });
  },

  async deleteRole(id: string): Promise<void> {
    await apiFetch<void>(`/v1/roles/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  async factoryReset(): Promise<any> {
    return await apiFetch<any>('/v1/admin/factory-reset', {
      method: 'POST',
      body: JSON.stringify({ confirm: 'RESET TO FIRST USE' }),
    });
  },

  async generateBarcode(variantId: string, formatName: string, force: boolean = false): Promise<any> {
    return apiFetch<any>(`/v1/inventory/variants/${variantId}/barcode/generate?format=${formatName}&force=${force}`, {
      method: 'POST'
    });
  },

  async updateCustomBarcode(variantId: string, customBarcode: string, formatName: string = 'CODE_128'): Promise<any> {
    return apiFetch<any>(`/v1/inventory/variants/${variantId}/barcode/custom`, {
      method: 'PUT',
      body: JSON.stringify({ barcode: customBarcode, format: formatName })
    });
  },

  async clearBarcode(variantId: string): Promise<any> {
    return apiFetch<any>(`/v1/inventory/variants/${variantId}/barcode`, {
      method: 'DELETE'
    });
  },

  async getBarcode(variantId: string): Promise<any> {
    return apiFetch<any>(`/v1/inventory/variants/${variantId}/barcode`);
  },

  async getBarcodeSettings(): Promise<TenantBarcodeSettings> {
    return apiFetch<TenantBarcodeSettings>('/v1/inventory/barcode-settings');
  },

  async updateBarcodeSettings(settings: TenantBarcodeSettings): Promise<TenantBarcodeSettings> {
    return apiFetch<TenantBarcodeSettings>('/v1/inventory/barcode-settings', {
      method: 'PUT',
      body: JSON.stringify(settings)
    });
  },

  async bulkPrintPdf(items: { variantId: string; quantity?: number; useStockQuantity?: boolean }[], style?: string): Promise<Blob> {
    const styleParam = style ? `?style=${style}` : '';
    const url = `${getBackendUrl()}/v1/inventory/variants/barcodes/pdf${styleParam}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(items)
    });
    if (!res.ok) {
      let errMsg = `HTTP ${res.status}`;
      try {
        const errJson = await res.json();
        if (errJson?.message) errMsg = errJson.message;
      } catch (_) { /* ignore */ }
      throw new Error(errMsg);
    }
    return res.blob();
  },

  async bulkPrintZpl(items: { variantId: string; quantity?: number; useStockQuantity?: boolean }[], style?: string): Promise<string> {
    const styleParam = style ? `?style=${style}` : '';
    const url = `${getBackendUrl()}/v1/inventory/variants/barcodes/zpl${styleParam}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(items)
    });
    if (!res.ok) {
      let errMsg = `HTTP ${res.status}`;
      try {
        const errJson = await res.json();
        if (errJson?.message) errMsg = errJson.message;
      } catch (_) { /* ignore */ }
      throw new Error(errMsg);
    }
    const text = await res.text();
    if (!text || text.trim().length === 0) {
      throw new Error('لم يتم إنشاء ملف ZPL — تأكد أن المنتجات المحددة لديها باركود صالح');
    }
    return text;
  },

  async getQrPreview(variantId: string): Promise<any> {
    return apiFetch<any>(`/v1/inventory/qr-labels/variants/${variantId}/preview`);
  },

  async printQrLabelPdf(variantId: string, quantity: number, style?: string): Promise<Blob> {
    const url = `${getBackendUrl()}/v1/inventory/qr-labels/pdf`;
    const res = await fetch(url, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ variantId, quantity, style })
    });
    if (!res.ok) {
      let errMsg = `HTTP ${res.status}`;
      try {
        const errJson = await res.json();
        if (errJson?.message) errMsg = errJson.message;
      } catch (_) { /* ignore */ }
      throw new Error(errMsg);
    }
    return res.blob();
  },

  async printQrLabelZpl(variantId: string, quantity: number, style?: string): Promise<string> {
    const url = `${getBackendUrl()}/v1/inventory/qr-labels/zpl`;
    const res = await fetch(url, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ variantId, quantity, style })
    });
    if (!res.ok) {
      let errMsg = `HTTP ${res.status}`;
      try {
        const errJson = await res.json();
        if (errJson?.message) errMsg = errJson.message;
      } catch (_) { /* ignore */ }
      throw new Error(errMsg);
    }
    return res.text();
  },

  getBackendUrl(): string {
    return getBackendUrl();
  },

  /** Returns all printer names visible to the server's OS (for USB/Network Zebra printers). */
  async listPrinters(): Promise<string[]> {
    const data = await apiFetch<string[]>('/v1/inventory/system/printers');
    return data ?? [];
  },

  /**
   * Sends ZPL directly to a named printer on the server OS — no file download needed.
   * Works with USB-connected Zebra printers when the backend and printer are on the same machine.
   */
  async printDirect(printerName: string, items: { variantId: string; quantity?: number; useStockQuantity?: boolean }[], style?: string): Promise<void> {
    await apiFetch<void>('/v1/inventory/variants/barcodes/print-direct', {
      method: 'POST',
      body: JSON.stringify({ printerName, items, style }),
    });
  },

  // ── SMART EXCEL IMPORT ────────────────────────────────────────────────────

  async uploadImportSession(file: File): Promise<ImportUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    return await apiUpload<ImportUploadResponse>('/v1/inventory/import/sessions', formData);
  },

  async confirmImportMapping(
    sessionId: string,
    mapping: Record<string, string>,
    options: { autoCreateSupplier: boolean; priceBelowCostIsWarningOnly: boolean }
  ): Promise<ImportMappingResponse> {
    return await apiFetch<ImportMappingResponse>(`/v1/inventory/import/sessions/${sessionId}/mapping`, {
      method: 'PUT',
      body: JSON.stringify({ mapping, ...options }),
    });
  },

  async getImportPreview(
    sessionId: string,
    params: { status?: string; search?: string; page?: number; size?: number } = {}
  ): Promise<ImportPreviewPage> {
    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    if (params.search) query.set('search', params.search);
    query.set('page', String(params.page ?? 0));
    query.set('size', String(params.size ?? 500));
    return await apiFetch<ImportPreviewPage>(`/v1/inventory/import/sessions/${sessionId}/preview?${query.toString()}`);
  },

  async resolveImportDuplicates(sessionId: string, itemIds: string[], resolution: string): Promise<void> {
    await apiFetch<void>(`/v1/inventory/import/sessions/${sessionId}/duplicates`, {
      method: 'PATCH',
      body: JSON.stringify({ itemIds, resolution }),
    });
  },

  async commitImport(sessionId: string): Promise<ImportSummary> {
    return await apiFetch<ImportSummary>(`/v1/inventory/import/sessions/${sessionId}/commit`, {
      method: 'POST',
    });
  },

  async downloadImportErrorReport(sessionId: string): Promise<Blob> {
    const url = `${getBackendUrl()}/v1/inventory/import/sessions/${sessionId}/error-report`;
    const res = await fetch(url, { headers: getHeaders() });
    if (!res.ok) {
      let errMsg = `HTTP ${res.status}`;
      try {
        const errJson = await res.json();
        if (errJson?.message) errMsg = errJson.message;
      } catch (_) { /* ignore */ }
      throw new Error(errMsg);
    }
    return res.blob();
  },
};

