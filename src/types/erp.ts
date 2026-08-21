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

/** Upcoming/DueSoon/DueToday/Overdue are always computed from the due date; Completed is stored. */
export type FollowUpStatus = 'UPCOMING' | 'DUE_SOON' | 'DUE_TODAY' | 'OVERDUE' | 'COMPLETED';

export interface VaccinationRecord {
  id: string;
  petId: string;
  petName: string;
  ownerId?: string;
  ownerName?: string;
  ownerPhone?: string;
  vaccineName: string;
  /** Recurrence in months; null/undefined means one-time. */
  intervalMonths?: number | null;
  lastAdministeredDate?: string | null;
  nextDueDate?: string | null;
  notes?: string;
  status: FollowUpStatus;
  /** Null when status is COMPLETED (no active next-due-date). */
  daysUntilDue?: number | null;
  createdByName?: string;
  createdAt?: string;
}

export interface VaccinationHistoryEntry {
  id: string;
  vaccinationRecordId: string;
  petId: string;
  vaccineName: string;
  administeredDate: string;
  administeredByName?: string;
  notes?: string;
  createdAt?: string;
}

export interface AnimalReminder {
  id: string;
  petId: string;
  petName: string;
  ownerId?: string;
  ownerName?: string;
  ownerPhone?: string;
  title: string;
  description?: string;
  dueDate: string;
  status: FollowUpStatus;
  daysUntilDue?: number | null;
  createdByName?: string;
  completedByName?: string;
  createdAt?: string;
  completedAt?: string;
}

export interface AnimalFollowUpDashboard {
  dueSoonThresholdDays: number;
  vaccinationsDueSoon: VaccinationRecord[];
  vaccinationsOverdue: VaccinationRecord[];
  remindersOverdue: AnimalReminder[];
  remindersDueToday: AnimalReminder[];
  remindersDueThisWeek: AnimalReminder[];
  vaccinationsDueSoonCount: number;
  vaccinationsOverdueCount: number;
  remindersOverdueCount: number;
  remindersDueTodayCount: number;
  remindersDueThisWeekCount: number;
}

export interface PetOwnerSummary {
  id: string;
  name: string;
  phone?: string;
}

export interface PetFollowUpView {
  petId: string;
  petName: string;
  owner?: PetOwnerSummary;
  vaccinations: VaccinationRecord[];
  reminders: AnimalReminder[];
}

export interface PetFollowUpSummary {
  petId: string;
  overdueCount: number;
  dueSoonCount: number;
  nextDueDate?: string | null;
  nextItemTitle?: string;
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
  cashSalesTotal?: number;
  cardSalesTotal?: number;
  instapaySalesTotal?: number;
  vodafoneSalesTotal?: number;
  totalSales?: number;
  deliveryOrdersCount?: number;
  deliveryFeesTotal?: number;
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
  paymentMethod: 'CASH' | 'CARD' | 'MOBILE' | 'INSTAPAY' | 'VODAFONE_CASH' | 'SPLIT';
  employeeId: string;
  employeeFullName?: string;
  customerId?: string;
  date: string;
  status?: 'COMPLETED' | 'PARTIALLY_REFUNDED' | 'REFUNDED';
  items: SaleItem[];
  /** Tender breakdown: one entry for a normal sale, two when paymentMethod is 'SPLIT'. */
  payments?: { method: string; amount: number }[];
  delivery?: boolean;
  deliveryFee?: number;
  /** Loyalty balance credited from this sale. */
  loyaltyEarned?: number;
  /** Loyalty balance spent as payment on this sale. */
  loyaltyRedeemed?: number;
}

export interface LoyaltyAccount {
  customerId: string;
  tenantId: string;
  balance: number;
  updatedAt?: string;
}

export type LoyaltyLedgerType = 'EARNED' | 'USED' | 'RETURN_REVERSAL' | 'MANUAL_ADJUSTMENT' | 'EXPIRED';

export interface LoyaltyLedgerEntry {
  id: string;
  customerId: string;
  saleId?: string;
  saleNumber?: string;
  employeeId?: string;
  employeeName?: string;
  type: LoyaltyLedgerType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  note?: string;
  relatedEntryId?: string;
  expiresAt?: string;
  createdAt: string;
}

export interface LoyaltySettings {
  tenantId: string;
  enabled: boolean;
  programOpen: boolean;
  earnRatePercent: number;
  maxUsagePercent?: number;
  maxUsageAmount?: number;
  eligibleCategoryIds: string[];
  excludedCategoryIds: string[];
  eligibleProductIds: string[];
  excludedProductIds: string[];
  expirationEnabled: boolean;
  expirationMonths?: number;
}

export interface LoyaltyLedgerPage {
  content: LoyaltyLedgerEntry[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

export interface LoyaltyCustomerBalance {
  customerId: string;
  name: string;
  phone?: string;
  balance: number;
}

export interface LoyaltyDashboardResponse {
  /** Sum of every customer's current balance — what would be owed if all points were redeemed today. */
  totalOutstandingLiability: number;
  /** All-time value credited to customers via checkout earning. */
  totalEarned: number;
  /** All-time value actually redeemed at checkout — the real cost already paid out. */
  totalRedeemed: number;
  /** All-time earned value that expired unused. */
  totalExpired: number;
  totalReturnReversals: number;
  totalManualAdjustments: number;
  activeCustomersCount: number;
  customers: LoyaltyCustomerBalance[];
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
  status: 'DRAFT' | 'COMPLETED' | 'PARTIALLY_RETURNED' | 'RETURNED';
  /** Null/undefined means open-ended — payable any time, no forced deadline. */
  dueDate?: string | null;
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
  /** Null/undefined means open-ended — payable any time, no forced deadline. */
  dueDate?: string | null;
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
  quantityReturned?: number;
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

export interface PurchaseReturnResult {
  invoice: PurchaseInvoice;
  returnedAmount: number;
  /** Money the supplier now owes back — the invoice balance couldn't absorb the whole return. */
  excessCredit: number;
  fullReturn: boolean;
  linesProcessed?: Array<{ purchaseInvoiceItemId: string; quantity: number }>;
}

export interface SaleRefundResult {
  sale: Sale;
  refundAmount: number;
  cogsReversed: number;
  fullRefund: boolean;
  linesProcessed?: Array<{ saleItemId: string; quantity: number }>;
  /** How much of this refund goes back to each original tender (cash/card/...). */
  refundBreakdown?: { method: string; amount: number }[];
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



