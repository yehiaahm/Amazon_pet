export interface Tenant {
  id: string;
  name: string;
  subdomain: string;
  active: boolean;
}

export interface Branch {
  id: string;
  tenantId: string;
  name: string;
  address: string;
  phone: string;
}

export interface Warehouse {
  id: string;
  branchId: string;
  name: string;
  code: string;
}

export interface Employee {
  id: string;
  username: string;
  fullName: string;
  email: string;
  role: string; // 'OWNER' | 'MANAGER' | 'CASHIER' | 'GROOMER'
  branchId: string;
  active: boolean;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  categoryId: string;
  brandId: string;
  unitId: string;
  minStockLimit: number;
  reorderLevel?: number;
  categoryName?: string;
  brandName?: string;
  supplierId?: string;
  supplierName?: string;
}

export interface ProductVariant {
  id: string;
  productId: string;
  name: string; // e.g. "Small (1kg)", "Large (5kg)", "Standard"
  price: number;
  cost: number;
  wholesalePrice?: number;
  stockQuantity: number;
  barcode?: string;
  barcodeFormat?: 'CODE_128' | 'EAN_13' | 'UPC_A' | 'QR_CODE';
  barcodeGenerated?: boolean;
  barcodeGeneratedAt?: string;
  barcodeSource?: 'MANUFACTURER' | 'SYSTEM_GENERATED';
  barcodeStatus?: 'ACTIVE' | 'REPLACED' | 'VOID';
}

export interface TenantBarcodeSettings {
  tenantId: string;
  autoGenerateBarcode: boolean;
  defaultBarcodeFormat: 'CODE_128' | 'EAN_13' | 'UPC_A' | 'QR_CODE';
  defaultLabelSize: string;
  includePrice: boolean;
  includeName: boolean;
  includeSku: boolean;
  defaultTemplateStyle: 'PET_SHOP_SMALL' | 'PET_SHOP_MEDIUM' | 'SHELF_LABEL' | 'PRICE_TAG' | 'WAREHOUSE_LABEL';
}

export interface Batch {
  id: string;
  productVariantId: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
}

export interface StockMovement {
  id: string;
  warehouseId: string;
  productVariantId: string;
  quantity: number; // positive or negative
  type: 'SALE' | 'PURCHASE' | 'ADJUSTMENT' | 'TRANSFER';
  timestamp: string;
  employeeId: string;
}

export interface StockAdjustment {
  id: string;
  warehouseId: string;
  productVariantId: string;
  systemQty: number;
  physicalQty: number;
  reason: string;
  date: string;
  employeeId: string;
}

export interface Transfer {
  id: string;
  sourceWarehouseId: string;
  targetWarehouseId: string;
  date: string;
  status: 'PENDING' | 'TRANSIT' | 'COMPLETED';
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  isBanned?: boolean;
  /** Promotional discount percent 0–100 */
  discount?: number;
  /** Internal staff notes — shown to cashier at POS when customer is selected */
  notes?: string;
}

export interface Pet {
  id: string;
  customerId: string;
  name: string;
  species: string; // 'DOG' | 'CAT' | 'BIRD' | 'OTHER'
  breed: string;
  age: number;
}

export interface Service {
  id: string;
  name: string;
  price: number;
  durationMinutes: number;
}

export interface Appointment {
  id: string;
  petId: string;
  serviceId: string;
  employeeId: string; // groomer id
  dateTime: string;
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
  notes?: string;
}

export interface Expense {
  id: string;
  branchId: string;
  category: string;
  amount: number;
  date: string;
  description: string;
  paidFrom: 'CASH' | 'BANK';
}

export interface DailyClosing {
  id: string;
  branchId: string;
  cashboxId: string;
  openingBalance: number;
  closingBalance: number;
  systemExpected: number;
  physicalActual: number;
  difference: number;
  closedById: string;
  date: string;
}

export interface POSSession {
  id: string;
  branchId: string;
  openedById: string;
  openedAt: string;
  closedAt?: string;
  openingBalance: number;
  closingBalance?: number;
  status: 'OPEN' | 'CLOSED';
}

export interface SaleItem {
  id: string;
  type: 'PRODUCT' | 'SERVICE';
  itemId: string; // ProductVariant id or Service id
  name: string;
  quantity: number;
  /** Unit price charged on this bill (may differ temporarily from listPrice). */
  price: number;
  /** Catalog / list price — never mutated by POS override. */
  listPrice?: number;
  /** Set when manager approved a below-minimum unit price for this line. */
  priceBelowMinApproved?: boolean;
  cost: number; // for profit calculation
  cogs?: number;
  unitCogs?: number;
  quantityReturned?: number;
  grossProfit?: number;
  /** Optional stock cap for POS quantity controls */
  stockQuantity?: number;
}

export interface Sale {
  id: string;
  saleNumber: string;
  posSessionId: string;
  totalAmount: number;
  tax: number;
  discount: number;
  paymentMethod: 'CASH' | 'CARD' | 'MOBILE';
  employeeId: string;
  employeeFullName?: string;
  customerId?: string;
  date: string;
  status?: 'COMPLETED' | 'PARTIALLY_REFUNDED' | 'REFUNDED';
  items: SaleItem[];
}

export interface SalesQueryParams {
  page?: number;
  size?: number;
  sort?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  customer?: string;
  employee?: string;
  status?: string;
  paymentMethod?: string;
}

export interface SalesPageResult {
  content: Sale[];
  totalElements: number;
  totalPages: number;
  page: number;
  size: number;
  sort: string;
}

export interface KPIMetrics {
  grossRevenue: number;
  grossProfit: number;
  netProfit: number;
  profitMargin: number; // percentage
  cogs: number;
  inventoryTurnover: number;
  inventoryValue: number;
  averageBasket: number;
  clv: number; // Customer Lifetime Value
  repeatCustomerRate: number; // percentage
  deadStockCount: number;
  fastMovingItems: { variantId: string; name: string; salesCount: number }[];
  slowMovingItems: { variantId: string; name: string; salesCount: number }[];
  cashFlow: number;
  burnRate: number;
}

export interface DashboardMetricBlock {
  revenue: number;
  count: number;
  previousRevenue: number;
  trendPct: number;
}

export interface DashboardAmountBlock {
  amount: number;
  previousAmount: number;
  trendPct: number;
}

export interface DashboardRankingItem {
  name: string;
  quantity?: number;
  revenue?: number;
  orderCount?: number;
  totalSpend?: number;
  invoiceCount?: number;
  totalPurchases?: number;
}

export interface DashboardAlert {
  rule: string;
  severity: string;
  message: string;
}

export interface DashboardChartPoint {
  month: string;
  sales: number;
  expenses: number;
  purchases: number;
  productRevenue: number;
  serviceRevenue: number;
}

export interface DashboardMetrics {
  todaySales: DashboardMetricBlock;
  monthlySales: DashboardMetricBlock;
  netProfit: DashboardAmountBlock;
  expenses: DashboardAmountBlock;
  purchases: DashboardAmountBlock;
  inventoryValue: number;
  grossMargin: number;
  cogs: number;
  bestSellingProducts: DashboardRankingItem[];
  topCustomers: DashboardRankingItem[];
  topSuppliers: DashboardRankingItem[];
  alerts: DashboardAlert[];
  monthlyChart: DashboardChartPoint[];
}

export interface AIAdvisorInsight {
  businessSummary: string;
  topOpportunities: { title: string; description: string; priority: 'HIGH' | 'MEDIUM' | 'LOW' }[];
  criticalAlerts: { title: string; description: string; severity: 'CRITICAL' | 'WARNING' }[];
  recommendations: { title: string; action: string; impact: string }[];
  forecastText: string;
}

export interface ImportSession {
  id: string;
  fileName: string;
  fileSize: number;
  fileHash: string;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'UNDONE';
  uploadedBy: string; // employeeId or employeeName in mock
  uploadedAt: string;
  duplicateStrategy: 'SKIP' | 'UPDATE' | 'REPLACE';
  targetType: 'PRODUCTS' | 'CUSTOMERS' | 'SUPPLIERS';
  totalRows: number;
  successRows: number;
  warningRows: number;
  errorRows: number;
  lastProcessedRow: number;
  completedAt?: string;
}

export interface ImportSessionItem {
  id: string;
  sessionId: string;
  rowNumber: number;
  status: 'SUCCESS' | 'WARNING' | 'ERROR';
  errorMessage?: string;
  affectedEntityId?: string;
}

export interface PurchaseInvoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  supplierId?: string;
  supplierName: string;
  supplierPhone?: string;
  supplierAddress?: string;
  supplierTaxNumber?: string;
  currency: string;
  vat: number;
  discount: number;
  shipping: number;
  netTotal: number;
  grandTotal: number;
  uploadedAt: string;
  uploadedBy: string;
  imageUrl?: string;
  status: 'DRAFT' | 'COMPLETED';
  dueDate?: string;
  paymentType?: 'LUMP_SUM' | 'INSTALLMENTS';
  paymentStatus?: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';
  paidAmount?: number;
  fingerprint: string;
  items: PurchaseInvoiceItem[];
  installments?: PurchaseInvoiceInstallment[];
}

export interface PurchaseInvoiceInstallment {
  id: string;
  purchaseInvoiceId?: string;
  invoiceNumber?: string;
  supplierId?: string;
  supplierName?: string;
  installmentNumber: number;
  dueDate: string;
  amount: number;
  paidAmount: number;
  remainingAmount?: number;
  status: 'PENDING' | 'PARTIALLY_PAID' | 'PAID';
  paidAt?: string;
  notes?: string;
  daysUntilDue?: number;
  overdue?: boolean;
  dueSoon?: boolean;
}

export interface SupplierPayableSummary {
  supplierId?: string;
  supplierName: string;
  totalDebt: number;
  totalPaid: number;
  remaining: number;
  overdueCount: number;
  dueSoonCount: number;
  openInvoiceCount: number;
  upcomingInstallments: PurchaseInvoiceInstallment[];
}

export interface AccountsPayableDashboard {
  totalOutstanding: number;
  totalPaid: number;
  totalRemaining: number;
  overdueCount: number;
  dueSoonCount: number;
  openInstallmentCount: number;
  reminderDaysBeforeDue: number;
  priorityQueue: PurchaseInvoiceInstallment[];
  alerts: PurchaseInvoiceInstallment[];
  supplierSummaries: SupplierPayableSummary[];
}

export interface PurchaseInvoiceItem {
  id: string;
  purchaseInvoiceId: string;
  productName: string;
  sku: string;
  cost: number;
  price: number;
  quantity: number;
  confidenceName?: number;
  confidenceQty?: number;
  confidenceCost?: number;
  confidencePrice?: number;
  expiryDate?: string;
}

export interface PurchaseLineReceiptWarning {
  lineIndex: number;
  purchaseInvoiceItemId?: string;
  sku?: string;
  productName?: string;
  code: string;
  messageAr: string;
}

export interface PurchaseInvoiceCreateResponse {
  invoice: PurchaseInvoice;
  warnings: PurchaseLineReceiptWarning[];
}

export interface SaleRefundResult {
  sale: Sale;
  refundAmount: number;
  cogsReversed: number;
  fullRefund: boolean;
  linesProcessed?: Array<{ saleItemId: string; quantity: number }>;
}

export interface SaleBatchAllocationRow {
  saleItemId: string;
  productName: string;
  batchNumber: string | null;
  inventoryBatchId: string | null;
  quantityAllocated: number;
  unitCostAtSale: number;
  totalAllocatedCost: number;
}

export interface BoardingReservation {
  id: string;
  petId: string;
  petName?: string;
  customerName?: string;
  customerPhone?: string;
  checkInDate: string;
  checkOutDate: string;
  roomNumber?: string;
  notes?: string;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
}



