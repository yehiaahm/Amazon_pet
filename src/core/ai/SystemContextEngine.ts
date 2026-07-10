/**
 * SystemContextEngine - محرك السياق الذكي
 * يجمع كل بيانات النظام في الوقت الفعلي ويبني سياقاً شاملاً
 * يُستخدم لتغذية الـ AI بكل المعلومات قبل الإجابة
 */

import { mockDb } from '../api/mockDb';
import { SaleItem, KPIMetrics } from '../../types/erp';


export interface FullSystemSnapshot {
  timestamp: string;
  kpis: KPIMetrics;
  inventory: InventorySnapshot;
  sales: SalesSnapshot;
  finance: FinanceSnapshot;
  crm: CRMSnapshot;
  services: ServicesSnapshot;
  alerts: AlertSnapshot[];
}

export interface InventorySnapshot {
  totalProducts: number;
  totalVariants: number;
  totalStockValue: number;
  lowStockItems: { name: string; variant: string; current: number; minimum: number; deficit: number }[];
  expiringBatches: { product: string; batch: string; expiryDate: string; daysLeft: number; quantity: number }[];
  topStockItems: { name: string; quantity: number; value: number }[];
  deadStockItems: { name: string; quantity: number; value: number }[];
}

export interface SalesSnapshot {
  totalSales: number;
  totalRevenue: number;
  totalRefunds: number;
  averageBasket: number;
  last7DaysRevenue: number;
  last30DaysRevenue: number;
  topSellingItems: { name: string; qty: number; revenue: number }[];
  slowestItems: { name: string; qty: number }[];
  paymentMethodBreakdown: { cash: number; card: number; mobile: number };
  dailyAvgRevenue: number;
}

export interface FinanceSnapshot {
  grossRevenue: number;
  grossProfit: number;
  netProfit: number;
  grossMargin: number;
  netMargin: number;
  totalExpenses: number;
  expensesByCategory: { category: string; amount: number; percentage: number }[];
  burnRate: number;
  cashFlow: number;
}

export interface CRMSnapshot {
  totalCustomers: number;
  totalPets: number;
  repeatCustomerRate: number;
  customerLifetimeValue: number;
  petsBySpecies: { species: string; count: number }[];
  topCustomers: { name: string; totalSpend: number }[];
}

export interface ServicesSnapshot {
  totalServices: number;
  totalAppointments: number;
  completedAppointments: number;
  cancelledAppointments: number;
  upcomingAppointments: number;
  completionRate: number;
  mostBookedService: string;
  totalServiceRevenue: number;
  serviceMargins: { name: string; price: number; estimatedMargin: number }[];
}

export interface AlertSnapshot {
  type: 'CRITICAL' | 'WARNING' | 'INFO';
  category: 'INVENTORY' | 'FINANCE' | 'EXPIRY' | 'OPERATIONS';
  message: string;
  data?: Record<string, any>;
}

// ============================================================
// محرك بناء السياق الكامل
// ============================================================
export class SystemContextEngine {

  static buildFullSnapshot(): FullSystemSnapshot {
    const db = mockDb;
    const now = new Date();
    const kpis = db.getKPIMetrics();

    return {
      timestamp: now.toISOString(),
      kpis,
      inventory: this.buildInventorySnapshot(db),
      sales: this.buildSalesSnapshot(db, now),
      finance: this.buildFinanceSnapshot(db, kpis),
      crm: this.buildCRMSnapshot(db),
      services: this.buildServicesSnapshot(db),
      alerts: this.buildAlerts(db, kpis),
    };
  }

  // ─── Inventory ──────────────────────────────────────────────
  private static buildInventorySnapshot(db: typeof mockDb): InventorySnapshot {
    const now = new Date();

    // Low stock
    const lowStockItems = db.variants
      .map(v => {
        const product = db.products.find(p => p.id === v.productId);
        if (!product) return null;
        if (v.stockQuantity < product.minStockLimit) {
          return {
            name: product.name,
            variant: v.name,
            current: v.stockQuantity,
            minimum: product.minStockLimit,
            deficit: product.minStockLimit - v.stockQuantity
          };
        }
        return null;
      })
      .filter(Boolean) as InventorySnapshot['lowStockItems'];

    // Expiring batches
    const expiringBatches = db.batches
      .map(b => {
        const variant = db.variants.find(v => v.id === b.productVariantId);
        const product = variant ? db.products.find(p => p.id === variant.productId) : null;
        const expiry = new Date(b.expiryDate);
        const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (daysLeft < 90) {
          return {
            product: product?.name || 'غير معروف',
            batch: b.batchNumber,
            expiryDate: b.expiryDate,
            daysLeft,
            quantity: b.quantity
          };
        }
        return null;
      })
      .filter(Boolean) as InventorySnapshot['expiringBatches'];

    // Top stock by value
    const topStockItems = db.variants
      .map(v => {
        const product = db.products.find(p => p.id === v.productId);
        return {
          name: `${product?.name || ''} - ${v.name}`,
          quantity: v.stockQuantity,
          value: v.stockQuantity * v.cost
        };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    // Dead stock (high quantity, low sales)
    const deadStockItems = db.variants
      .filter(v => v.stockQuantity > 20)
      .map(v => {
        const product = db.products.find(p => p.id === v.productId);
        return {
          name: `${product?.name || ''} - ${v.name}`,
          quantity: v.stockQuantity,
          value: v.stockQuantity * v.cost
        };
      });

    const totalStockValue = db.variants.reduce((acc, v) => acc + (v.stockQuantity * v.cost), 0);

    return {
      totalProducts: db.products.length,
      totalVariants: db.variants.length,
      totalStockValue,
      lowStockItems,
      expiringBatches,
      topStockItems,
      deadStockItems
    };
  }

  // ─── Sales ──────────────────────────────────────────────────
  private static buildSalesSnapshot(db: typeof mockDb, now: Date): SalesSnapshot {
    const completedSales = db.sales.filter(s => s.status !== 'REFUNDED');
    const refundedSales = db.sales.filter(s => s.status === 'REFUNDED');

    const last7 = new Date(now); last7.setDate(last7.getDate() - 7);
    const last30 = new Date(now); last30.setDate(last30.getDate() - 30);

    const last7DaysRevenue = completedSales
      .filter(s => new Date(s.date) >= last7)
      .reduce((acc, s) => acc + s.totalAmount, 0);

    const last30DaysRevenue = completedSales
      .filter(s => new Date(s.date) >= last30)
      .reduce((acc, s) => acc + s.totalAmount, 0);

    const totalRevenue = completedSales.reduce((acc, s) => acc + s.totalAmount, 0);

    // Item-level analytics
    const itemMap: Record<string, { name: string; qty: number; revenue: number }> = {};
    completedSales.forEach(sale => {
      sale.items.forEach((item: SaleItem) => {
        if (!itemMap[item.itemId]) {
          itemMap[item.itemId] = { name: item.name, qty: 0, revenue: 0 };
        }
        itemMap[item.itemId].qty += item.quantity;
        itemMap[item.itemId].revenue += item.price * item.quantity;
      });
    });

    const sortedItems = Object.values(itemMap).sort((a, b) => b.revenue - a.revenue);
    const topSellingItems = sortedItems.slice(0, 5);
    const slowestItems = sortedItems.slice(-3).reverse().map(i => ({ name: i.name, qty: i.qty }));

    // Payment breakdown
    const paymentMethodBreakdown = { cash: 0, card: 0, mobile: 0 };
    completedSales.forEach(s => {
      if (s.paymentMethod === 'CASH') paymentMethodBreakdown.cash += s.totalAmount;
      else if (s.paymentMethod === 'CARD') paymentMethodBreakdown.card += s.totalAmount;
      else if (s.paymentMethod === 'MOBILE') paymentMethodBreakdown.mobile += s.totalAmount;
    });

    const dayCount = Math.max(1, Math.ceil((now.getTime() - new Date('2026-04-01').getTime()) / (1000 * 60 * 60 * 24)));

    return {
      totalSales: completedSales.length,
      totalRevenue,
      totalRefunds: refundedSales.length,
      averageBasket: completedSales.length > 0 ? totalRevenue / completedSales.length : 0,
      last7DaysRevenue,
      last30DaysRevenue,
      topSellingItems,
      slowestItems,
      paymentMethodBreakdown,
      dailyAvgRevenue: totalRevenue / dayCount
    };
  }

  // ─── Finance ─────────────────────────────────────────────────
  private static buildFinanceSnapshot(db: typeof mockDb, kpis: KPIMetrics): FinanceSnapshot {
    const totalRevenue = db.sales
      .filter(s => s.status !== 'REFUNDED')
      .reduce((acc, s) => acc + s.totalAmount, 0);

    const totalExpenses = db.expenses.reduce((acc, e) => acc + e.amount, 0);

    const expenseCategoryMap: Record<string, number> = {};
    db.expenses.forEach(e => {
      expenseCategoryMap[e.category] = (expenseCategoryMap[e.category] || 0) + e.amount;
    });

    const expensesByCategory = Object.entries(expenseCategoryMap).map(([category, amount]) => ({
      category,
      amount,
      percentage: totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0
    })).sort((a, b) => b.amount - a.amount);

    return {
      grossRevenue: totalRevenue,
      grossProfit: kpis.grossProfit,
      netProfit: kpis.netProfit,
      grossMargin: kpis.profitMargin + 5,
      netMargin: kpis.profitMargin,
      totalExpenses,
      expensesByCategory,
      burnRate: kpis.burnRate,
      cashFlow: kpis.cashFlow
    };
  }

  // ─── CRM ─────────────────────────────────────────────────────
  private static buildCRMSnapshot(db: typeof mockDb): CRMSnapshot {
    const petsBySpecies: Record<string, number> = {};
    db.pets.forEach(p => {
      petsBySpecies[p.species] = (petsBySpecies[p.species] || 0) + 1;
    });

    // Top customers by spend
    const customerSpend: Record<string, number> = {};
    db.sales.filter(s => s.customerId && s.status !== 'REFUNDED').forEach(s => {
      if (s.customerId) {
        customerSpend[s.customerId] = (customerSpend[s.customerId] || 0) + s.totalAmount;
      }
    });

    const topCustomers = Object.entries(customerSpend)
      .map(([customerId, totalSpend]) => {
        const customer = db.customers.find(c => c.id === customerId);
        return { name: customer?.name || 'عميل غير معروف', totalSpend };
      })
      .sort((a, b) => b.totalSpend - a.totalSpend)
      .slice(0, 3);

    return {
      totalCustomers: db.customers.length,
      totalPets: db.pets.length,
      repeatCustomerRate: 64.5,
      customerLifetimeValue: 350,
      petsBySpecies: Object.entries(petsBySpecies).map(([species, count]) => ({ species, count })),
      topCustomers
    };
  }

  // ─── Services ────────────────────────────────────────────────
  private static buildServicesSnapshot(db: typeof mockDb): ServicesSnapshot {
    const completed = db.appointments.filter(a => a.status === 'COMPLETED').length;
    const cancelled = db.appointments.filter(a => a.status === 'CANCELLED').length;
    const upcoming = db.appointments.filter(a => a.status === 'SCHEDULED').length;

    // Most booked service
    const serviceBookingCount: Record<string, number> = {};
    db.appointments.forEach(a => {
      serviceBookingCount[a.serviceId] = (serviceBookingCount[a.serviceId] || 0) + 1;
    });
    const topServiceId = Object.entries(serviceBookingCount).sort((a, b) => b[1] - a[1])[0]?.[0];
    const topService = db.services.find(s => s.id === topServiceId);

    // Service revenue (from sales items of type SERVICE)
    let totalServiceRevenue = 0;
    db.sales.filter(s => s.status !== 'REFUNDED').forEach(s => {
      s.items.filter(i => i.type === 'SERVICE').forEach(i => {
        totalServiceRevenue += i.price * i.quantity;
      });
    });

    const serviceMargins = db.services.map(s => ({
      name: s.name,
      price: s.price,
      estimatedMargin: Math.round((1 - (s.price * 0.3) / s.price) * 100)
    }));

    return {
      totalServices: db.services.length,
      totalAppointments: db.appointments.length,
      completedAppointments: completed,
      cancelledAppointments: cancelled,
      upcomingAppointments: upcoming,
      completionRate: db.appointments.length > 0 ? (completed / db.appointments.length) * 100 : 0,
      mostBookedService: topService?.name || 'غير محدد',
      totalServiceRevenue,
      serviceMargins
    };
  }

  // ─── Alerts ──────────────────────────────────────────────────
  private static buildAlerts(db: typeof mockDb, kpis: KPIMetrics): AlertSnapshot[] {
    const alerts: AlertSnapshot[] = [];
    const now = new Date();

    // Low stock alerts
    db.variants.forEach(v => {
      const product = db.products.find(p => p.id === v.productId);
      if (!product) return;
      if (v.stockQuantity < product.minStockLimit) {
        alerts.push({
          type: v.stockQuantity === 0 ? 'CRITICAL' : 'WARNING',
          category: 'INVENTORY',
          message: `مخزون منخفض: ${product.name} (${v.name}) - المتبقي: ${v.stockQuantity} (الحد الأدنى: ${product.minStockLimit})`
        });
      }
    });

    // Expiry alerts
    db.batches.forEach(b => {
      const variant = db.variants.find(v => v.id === b.productVariantId);
      const product = variant ? db.products.find(p => p.id === variant.productId) : null;
      const daysLeft = Math.ceil((new Date(b.expiryDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysLeft < 30) {
        alerts.push({
          type: 'CRITICAL',
          category: 'EXPIRY',
          message: `تحذير حرج: ${product?.name} - الدفعة ${b.batchNumber} تنتهي خلال ${daysLeft} يوم`
        });
      } else if (daysLeft < 90) {
        alerts.push({
          type: 'WARNING',
          category: 'EXPIRY',
          message: `تحذير انتهاء صلاحية: ${product?.name} - الدفعة ${b.batchNumber} تنتهي خلال ${daysLeft} يوم`
        });
      }
    });

    // Financial alerts
    if (kpis.netProfit < 0) {
      alerts.push({ type: 'CRITICAL', category: 'FINANCE', message: 'تنبيه مالي حرج: المحل يعمل بخسارة صافية حالياً' });
    }
    if (kpis.profitMargin < 5) {
      alerts.push({ type: 'WARNING', category: 'FINANCE', message: `هامش الربح الصافي منخفض جداً: ${kpis.profitMargin.toFixed(1)}٪` });
    }

    // Cash drawer closing discrepancy alerts
    db.dailyClosings.forEach(c => {
      if (c.difference !== 0) {
        alerts.push({
          type: 'CRITICAL',
          category: 'FINANCE',
          message: `عجز/زيادة في إغلاق الدرج يوم ${c.date}: المتوقع $${c.systemExpected.toFixed(2)} والفعلي $${c.physicalActual.toFixed(2)} (الفارق: ${c.difference > 0 ? '+' : ''}$${c.difference.toFixed(2)})`
        });
      }
    });

    return alerts;
  }

  // ============================================================
  // بناء نص السياق الكامل للـ AI
  // ============================================================
  static buildContextString(snapshot: FullSystemSnapshot): string {
    const s = snapshot;
    const fmt = (n: number) => n.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    let ctx = `\n══════════════════════════════════════════\n`;
    ctx += `📊 لقطة شاملة لبيانات نظام AnimaSys ERP\n`;
    ctx += `🕐 التوقيت: ${new Date(s.timestamp).toLocaleString('ar-EG')}\n`;
    ctx += `══════════════════════════════════════════\n\n`;

    // KPIs
    ctx += `## 💰 المؤشرات المالية الرئيسية\n`;
    ctx += `- إجمالي الإيرادات: $${fmt(s.finance.grossRevenue)}\n`;
    ctx += `- إجمالي الربح: $${fmt(s.finance.grossProfit)} (هامش ${s.finance.grossMargin.toFixed(1)}٪)\n`;
    ctx += `- صافي الربح: $${fmt(s.finance.netProfit)} (هامش ${s.finance.netMargin.toFixed(1)}٪)\n`;
    ctx += `- تكلفة البضاعة المباعة (COGS): $${fmt(s.kpis.cogs)}\n`;
    ctx += `- إجمالي المصاريف: $${fmt(s.finance.totalExpenses)}\n`;
    ctx += `- معدل الحرق الشهري: $${fmt(s.finance.burnRate)}\n`;
    ctx += `- التدفق النقدي: $${fmt(s.finance.cashFlow)}\n\n`;

    // Expense breakdown
    ctx += `## 📉 تفاصيل المصاريف\n`;
    s.finance.expensesByCategory.forEach(e => {
      ctx += `- ${e.category}: $${fmt(e.amount)} (${e.percentage.toFixed(1)}٪)\n`;
    });
    ctx += `\n`;

    // Sales
    ctx += `## 🛍️ إحصائيات المبيعات\n`;
    ctx += `- إجمالي الفواتير: ${s.sales.totalSales} فاتورة\n`;
    ctx += `- متوسط قيمة السلة: $${fmt(s.sales.averageBasket)}\n`;
    ctx += `- إيرادات آخر 7 أيام: $${fmt(s.sales.last7DaysRevenue)}\n`;
    ctx += `- إيرادات آخر 30 يوم: $${fmt(s.sales.last30DaysRevenue)}\n`;
    ctx += `- المتوسط اليومي: $${fmt(s.sales.dailyAvgRevenue)}\n`;
    ctx += `- مرتجعات: ${s.sales.totalRefunds} فاتورة\n`;
    ctx += `- توزيع الدفع: نقدي $${fmt(s.sales.paymentMethodBreakdown.cash)} | بطاقة $${fmt(s.sales.paymentMethodBreakdown.card)} | موبايل $${fmt(s.sales.paymentMethodBreakdown.mobile)}\n\n`;

    // Top selling
    ctx += `## 🏆 أكثر المنتجات مبيعاً\n`;
    s.sales.topSellingItems.forEach((item, i) => {
      ctx += `${i + 1}. ${item.name} - الكمية: ${item.qty} | الإيراد: $${fmt(item.revenue)}\n`;
    });
    ctx += `\n`;

    // Inventory
    ctx += `## 📦 حالة المخزون\n`;
    ctx += `- إجمالي المنتجات: ${s.inventory.totalProducts} | المتغيرات: ${s.inventory.totalVariants}\n`;
    ctx += `- قيمة المخزون الإجمالية: $${fmt(s.inventory.totalStockValue)}\n`;
    ctx += `- معدل دوران المخزون: ${s.kpis.inventoryTurnover.toFixed(2)}x\n\n`;

    if (s.inventory.lowStockItems.length > 0) {
      ctx += `### ⚠️ تنبيهات مخزون منخفض\n`;
      s.inventory.lowStockItems.forEach(item => {
        ctx += `- ${item.name} (${item.variant}): المتبقي ${item.current} / الحد الأدنى ${item.minimum} ← عجز ${item.deficit} وحدة\n`;
      });
      ctx += `\n`;
    }

    if (s.inventory.expiringBatches.length > 0) {
      ctx += `### 🚨 دفعات قاربت على الانتهاء\n`;
      s.inventory.expiringBatches.forEach(b => {
        ctx += `- ${b.product} (دفعة ${b.batch}): تنتهي ${b.expiryDate} ← باقي ${b.daysLeft} يوم | الكمية: ${b.quantity}\n`;
      });
      ctx += `\n`;
    }

    // Services
    ctx += `## ✂️ الخدمات والمواعيد\n`;
    ctx += `- إجمالي المواعيد: ${s.services.totalAppointments}\n`;
    ctx += `- مكتملة: ${s.services.completedAppointments} | ملغاة: ${s.services.cancelledAppointments} | قادمة: ${s.services.upcomingAppointments}\n`;
    ctx += `- معدل الإتمام: ${s.services.completionRate.toFixed(1)}٪\n`;
    ctx += `- أكثر خدمة محجوزة: ${s.services.mostBookedService}\n`;
    ctx += `- إيرادات الخدمات: $${fmt(s.services.totalServiceRevenue)}\n`;
    ctx += `\nهوامش الخدمات:\n`;
    s.services.serviceMargins.forEach(sv => {
      ctx += `- ${sv.name}: السعر $${sv.price.toFixed(2)} | الهامش المقدر ${sv.estimatedMargin}٪\n`;
    });
    ctx += `\n`;

    // CRM
    ctx += `## 👥 بيانات العملاء\n`;
    ctx += `- إجمالي العملاء: ${s.crm.totalCustomers}\n`;
    ctx += `- إجمالي الحيوانات الأليفة المسجلة: ${s.crm.totalPets}\n`;
    ctx += `- معدل العملاء المتكررين: ${s.crm.repeatCustomerRate}٪\n`;
    ctx += `- القيمة العمرية للعميل (CLV): $${s.crm.customerLifetimeValue}\n`;
    ctx += `- أنواع الحيوانات: ${s.crm.petsBySpecies.map(p => `${p.species}: ${p.count}`).join(' | ')}\n`;
    ctx += `\nأفضل العملاء إنفاقاً:\n`;
    s.crm.topCustomers.forEach((c, i) => {
      ctx += `${i + 1}. ${c.name}: $${fmt(c.totalSpend)}\n`;
    });
    ctx += `\n`;

    // Active alerts
    if (s.alerts.length > 0) {
      ctx += `## 🚨 التنبيهات النشطة\n`;
      s.alerts.forEach(a => {
        const icon = a.type === 'CRITICAL' ? '🔴' : a.type === 'WARNING' ? '🟡' : '🔵';
        ctx += `${icon} [${a.category}] ${a.message}\n`;
      });
      ctx += `\n`;
    }

    ctx += `══════════════════════════════════════════\n`;
    ctx += `نهاية لقطة النظام - يرجى تحليل هذه البيانات والإجابة باللغة العربية الفصحى بشكل مهني وعملي.\n`;
    ctx += `══════════════════════════════════════════\n`;

    return ctx;
  }
}
