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
}

export interface ProductVariant {
  id: string;
  productId: string;
  name: string; // e.g. "Small (1kg)", "Large (5kg)", "Standard"
  price: number;
  cost: number;
  stockQuantity: number;
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
  category: 'RENT' | 'SALARY' | 'UTILITIES' | 'SUPPLIES' | 'OTHER';
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
  price: number;
  cost: number; // for profit calculation
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
  customerId?: string;
  date: string;
  status?: 'COMPLETED' | 'REFUNDED';
  items: SaleItem[];
}

export interface KPIMetrics {
  grossProfit: number;
  netProfit: number;
  profitMargin: number; // percentage
  cogs: number;
  inventoryTurnover: number;
  averageBasket: number;
  clv: number; // Customer Lifetime Value
  repeatCustomerRate: number; // percentage
  deadStockCount: number;
  fastMovingItems: { variantId: string; name: string; salesCount: number }[];
  slowMovingItems: { variantId: string; name: string; salesCount: number }[];
  cashFlow: number;
  burnRate: number;
}

export interface AIAdvisorInsight {
  businessSummary: string;
  topOpportunities: { title: string; description: string; priority: 'HIGH' | 'MEDIUM' | 'LOW' }[];
  criticalAlerts: { title: string; description: string; severity: 'CRITICAL' | 'WARNING' }[];
  recommendations: { title: string; action: string; impact: string }[];
  forecastText: string;
}
