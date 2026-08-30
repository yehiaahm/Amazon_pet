/**
 * SystemContextEngine — snapshot types and AI context string builder.
 * Live data is assembled by LiveInsightEngine / backend APIs (not mock DB).
 */

import { KPIMetrics } from '../../types/erp';
import { formatMoney } from '../utils/money';

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
  data?: Record<string, unknown>;
}

export class SystemContextEngine {
  static buildContextString(snapshot: FullSystemSnapshot): string {
    const s = snapshot;

    let ctx = `\n══════════════════════════════════════════\n`;
    ctx += `📊 لقطة شاملة لبيانات نظام Amazon Pet ERP\n`;
    ctx += `🕐 التوقيت: ${new Date(s.timestamp).toLocaleString('ar-EG')}\n`;
    ctx += `══════════════════════════════════════════\n\n`;

    ctx += `## 💰 المؤشرات المالية الرئيسية\n`;
    ctx += `- إجمالي الإيرادات: ${formatMoney(s.finance.grossRevenue)}\n`;
    ctx += `- إجمالي الربح: ${formatMoney(s.finance.grossProfit)} (هامش ${s.finance.grossMargin.toFixed(1)}٪)\n`;
    ctx += `- صافي الربح: ${formatMoney(s.finance.netProfit)} (هامش ${s.finance.netMargin.toFixed(1)}٪)\n`;
    ctx += `- تكلفة البضاعة المباعة (COGS): ${formatMoney(s.kpis.cogs)}\n`;
    ctx += `- إجمالي المصاريف: ${formatMoney(s.finance.totalExpenses)}\n`;
    ctx += `- معدل الحرق الشهري: ${formatMoney(s.finance.burnRate)}\n`;
    ctx += `- التدفق النقدي: ${formatMoney(s.finance.cashFlow)}\n\n`;

    ctx += `## 📉 تفاصيل المصاريف\n`;
    s.finance.expensesByCategory.forEach(e => {
      ctx += `- ${e.category}: ${formatMoney(e.amount)} (${e.percentage.toFixed(1)}٪)\n`;
    });
    ctx += `\n`;

    ctx += `## 🛍️ إحصائيات المبيعات\n`;
    ctx += `- إجمالي الفواتير: ${s.sales.totalSales} فاتورة\n`;
    ctx += `- متوسط قيمة السلة: ${formatMoney(s.sales.averageBasket)}\n`;
    ctx += `- إيرادات آخر 7 أيام: ${formatMoney(s.sales.last7DaysRevenue)}\n`;
    ctx += `- إيرادات آخر 30 يوم: ${formatMoney(s.sales.last30DaysRevenue)}\n`;
    ctx += `- المتوسط اليومي: ${formatMoney(s.sales.dailyAvgRevenue)}\n`;
    ctx += `- مرتجعات: ${s.sales.totalRefunds} فاتورة\n`;
    ctx += `- توزيع الدفع: نقدي ${formatMoney(s.sales.paymentMethodBreakdown.cash)} | بطاقة ${formatMoney(s.sales.paymentMethodBreakdown.card)} | موبايل ${formatMoney(s.sales.paymentMethodBreakdown.mobile)}\n\n`;

    ctx += `## 🏆 أكثر المنتجات مبيعاً\n`;
    s.sales.topSellingItems.forEach((item, i) => {
      ctx += `${i + 1}. ${item.name} - الكمية: ${item.qty} | الإيراد: ${formatMoney(item.revenue)}\n`;
    });
    ctx += `\n`;

    ctx += `## 📦 حالة المخزون\n`;
    ctx += `- إجمالي المنتجات: ${s.inventory.totalProducts} | المتغيرات: ${s.inventory.totalVariants}\n`;
    ctx += `- قيمة المخزون الإجمالية: ${formatMoney(s.inventory.totalStockValue)}\n\n`;

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

    ctx += `## ✂️ الخدمات والمواعيد\n`;
    ctx += `- إجمالي المواعيد: ${s.services.totalAppointments}\n`;
    ctx += `- مكتملة: ${s.services.completedAppointments} | ملغاة: ${s.services.cancelledAppointments} | قادمة: ${s.services.upcomingAppointments}\n`;
    ctx += `- معدل الإتمام: ${s.services.completionRate.toFixed(1)}٪\n`;
    ctx += `- أكثر خدمة محجوزة: ${s.services.mostBookedService}\n`;
    ctx += `- إيرادات الخدمات: ${formatMoney(s.services.totalServiceRevenue)}\n\n`;

    ctx += `## 👥 بيانات العملاء\n`;
    ctx += `- إجمالي العملاء: ${s.crm.totalCustomers}\n`;
    ctx += `- إجمالي الحيوانات الأليفة المسجلة: ${s.crm.totalPets}\n`;
    ctx += `- معدل العملاء المتكررين: ${s.crm.repeatCustomerRate}٪\n`;
    ctx += `- القيمة العمرية للعميل (CLV): ${formatMoney(s.crm.customerLifetimeValue)}\n\n`;

    if (s.alerts.length > 0) {
      ctx += `## 🚨 التنبيهات النشطة\n`;
      s.alerts.forEach(a => {
        const icon = a.type === 'CRITICAL' ? '🔴' : a.type === 'WARNING' ? '🟡' : '🔵';
        ctx += `${icon} [${a.category}] ${a.message}\n`;
      });
      ctx += `\n`;
    }

    ctx += `══════════════════════════════════════════\n`;
    return ctx;
  }
}
