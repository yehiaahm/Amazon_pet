/**
 * LiveInsightEngine — builds professional advisor insights from LIVE ERP data
 * (sales / expenses / inventory / CRM / appointments). No invented metrics.
 */

import type {
  AIAdvisorInsight,
  Appointment,
  Customer,
  Expense,
  Product,
  ProductVariant,
  Sale,
  Service,
} from '../../types/erp';
import { isCompletedSale, saleCogs, saleRevenue } from '../utils/saleFinance';
import { formatMoney } from '../utils/money';

export interface LiveErpBundle {
  sales: Sale[];
  expenses: Expense[];
  variants: ProductVariant[];
  products: Product[];
  customers: Customer[];
  appointments?: Appointment[];
  services?: Service[];
}

const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

function money(n: number): string {
  return formatMoney(n);
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function parseSaleDate(s: Sale): Date | null {
  if (!s.date) return null;
  const d = new Date(s.date);
  return Number.isNaN(d.getTime()) ? null : d;
}

export class LiveInsightEngine {
  static buildInsights(data: LiveErpBundle): AIAdvisorInsight {
    const completed = (data.sales || []).filter(isCompletedSale);
    const refunded = (data.sales || []).filter(s => s.status === 'REFUNDED');
    const expenses = data.expenses || [];
    const variants = data.variants || [];
    const products = data.products || [];
    const productById = Object.fromEntries(products.map(p => [p.id, p]));

    const revenue = completed.reduce((sum, s) => sum + saleRevenue(s), 0);
    const cogs = completed.reduce((sum, s) => sum + saleCogs(s), 0);
    const opex = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const grossProfit = revenue - cogs;
    const netProfit = grossProfit - opex;
    const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
    const netMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;
    const avgBasket = completed.length > 0 ? revenue / completed.length : 0;

    const now = new Date();
    const d7 = new Date(now); d7.setDate(now.getDate() - 7);
    const d30 = new Date(now); d30.setDate(now.getDate() - 30);
    const d60 = new Date(now); d60.setDate(now.getDate() - 60);

    const rev7 = completed.filter(s => {
      const d = parseSaleDate(s); return d && d >= d7;
    }).reduce((sum, s) => sum + saleRevenue(s), 0);
    const rev30 = completed.filter(s => {
      const d = parseSaleDate(s); return d && d >= d30;
    }).reduce((sum, s) => sum + saleRevenue(s), 0);
    const revPrev30 = completed.filter(s => {
      const d = parseSaleDate(s); return d && d >= d60 && d < d30;
    }).reduce((sum, s) => sum + saleRevenue(s), 0);
    const momGrowth = revPrev30 > 0 ? ((rev30 - revPrev30) / revPrev30) * 100 : (rev30 > 0 ? null : 0);

    // Top products
    const itemMap: Record<string, { name: string; qty: number; revenue: number; type: string }> = {};
    completed.forEach(sale => {
      (sale.items || []).forEach(item => {
        const key = `${item.type}:${item.itemId}`;
        if (!itemMap[key]) itemMap[key] = { name: item.name, qty: 0, revenue: 0, type: item.type };
        itemMap[key].qty += item.quantity;
        itemMap[key].revenue += item.price * item.quantity;
      });
    });
    const topItems = Object.values(itemMap).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

    // Payment mix
    const pay = { CASH: 0, CARD: 0, MOBILE: 0 };
    completed.forEach(s => {
      const r = saleRevenue(s);
      if (s.paymentMethod === 'CASH') pay.CASH += r;
      else if (s.paymentMethod === 'CARD') pay.CARD += r;
      else pay.MOBILE += r;
    });

    // Low stock
    const lowStock = variants.filter(v => {
      const p = productById[v.productId];
      const min = p?.minStockLimit ?? 10;
      return v.stockQuantity < min;
    }).map(v => {
      const p = productById[v.productId];
      return {
        name: `${p?.name || 'منتج'} (${v.name})`,
        current: v.stockQuantity,
        minimum: p?.minStockLimit ?? 10,
        deficit: Math.max(0, (p?.minStockLimit ?? 10) - v.stockQuantity),
      };
    });

    // Repeat customers (real)
    const withCustomer = completed.filter(s => s.customerId);
    const periodCustomers = new Set(
      withCustomer.filter(s => {
        const d = parseSaleDate(s); return d && d >= d30;
      }).map(s => s.customerId!)
    );
    const priorCustomers = new Set(
      withCustomer.filter(s => {
        const d = parseSaleDate(s); return d && d < d30;
      }).map(s => s.customerId!)
    );
    let repeaters = 0;
    periodCustomers.forEach(id => { if (priorCustomers.has(id)) repeaters++; });
    const repeatRate = periodCustomers.size > 0 ? (repeaters / periodCustomers.size) * 100 : 0;

    const spendByCustomer: Record<string, number> = {};
    withCustomer.forEach(s => {
      spendByCustomer[s.customerId!] = (spendByCustomer[s.customerId!] || 0) + saleRevenue(s);
    });
    const uniquePaying = Object.keys(spendByCustomer).length;
    const clv = uniquePaying > 0
      ? Object.values(spendByCustomer).reduce((a, b) => a + b, 0) / uniquePaying
      : 0;

    // Appointments
    const apts = data.appointments || [];
    const completedApts = apts.filter(a => a.status === 'COMPLETED').length;
    const scheduledApts = apts.filter(a => a.status === 'SCHEDULED').length;
    const cancelledApts = apts.filter(a => a.status === 'CANCELLED').length;
    const aptCompletion = apts.length > 0
      ? (completedApts / Math.max(1, completedApts + cancelledApts)) * 100
      : 0;

    // Health score from real signals
    let health = 100;
    if (netProfit < 0) health -= 25;
    if (netMargin < 8) health -= 12;
    if (grossMargin < 25) health -= 10;
    health -= Math.min(20, lowStock.length * 5);
    if (repeatRate < 25 && periodCustomers.size >= 3) health -= 8;
    if (momGrowth !== null && momGrowth < -10) health -= 10;
    health = Math.max(0, Math.min(100, health));

    const healthLabel =
      health >= 80 ? 'ممتاز' :
      health >= 60 ? 'جيد مع فرص تحسين' :
      health >= 40 ? 'يحتاج تدخل تشغيلي' : 'يحتاج تدخل عاجل';

    const businessSummary =
      `تشخيص Amazon Pet (بيانات حية):\n` +
      `• مؤشر الصحة التشغيلية: ${health}/100 — ${healthLabel}\n` +
      `• الإيرادات (فواتير مكتملة): ${money(revenue)} عبر ${completed.length} فاتورة | متوسط السلة ${money(avgBasket)}\n` +
      `• إجمالي الربح: ${money(grossProfit)} (هامش ${grossMargin.toFixed(1)}٪) | صافي الربح: ${money(netProfit)} (هامش ${netMargin.toFixed(1)}٪)\n` +
      `• المصاريف التشغيلية: ${money(opex)} | COGS: ${money(cogs)}\n` +
      `• آخر 7 أيام: ${money(rev7)} | آخر 30 يوم: ${money(rev30)}` +
      (momGrowth === null ? '' : ` | نمو شهري مقابل السابق: ${momGrowth >= 0 ? '+' : ''}${momGrowth.toFixed(1)}٪`) + `\n` +
      `• المرتجعات: ${refunded.length} فاتورة | تكرار العملاء (30 يوم): ${repeatRate.toFixed(1)}٪ | متوسط إنفاق العميل: ${money(clv)}\n` +
      (topItems[0] ? `• أعلى بند إيراداً: ${topItems[0].name} (${money(topItems[0].revenue)})\n` : '') +
      (lowStock.length > 0
        ? `• تنبيه مخزون: ${lowStock.length} صنف تحت الحد الأدنى.`
        : `• المخزون: لا توجد أصناف تحت الحد الأدنى حالياً.`);

    const criticalAlerts: AIAdvisorInsight['criticalAlerts'] = [];
    if (netProfit < 0) {
      criticalAlerts.push({
        title: 'صافي الربح سالب',
        description: `الخسارة الحالية ${money(Math.abs(netProfit))}. راجع المصاريف (${money(opex)}) وهوامش التجزئة فوراً.`,
        severity: 'CRITICAL',
      });
    }
    lowStock.slice(0, 6).forEach(item => {
      criticalAlerts.push({
        title: `مخزون منخفض: ${item.name}`,
        description: `المتوفر ${item.current} / الحد الأدنى ${item.minimum} — عجز ${item.deficit} وحدة.`,
        severity: item.current <= 0 ? 'CRITICAL' : 'WARNING',
      });
    });
    if (refunded.length > 0 && completed.length > 0 && refunded.length / (completed.length + refunded.length) > 0.15) {
      criticalAlerts.push({
        title: 'نسبة مرتجعات مرتفعة',
        description: `${refunded.length} مرتجع مقابل ${completed.length} فاتورة مكتملة — راجع أسباب الإرجاع والجودة.`,
        severity: 'WARNING',
      });
    }
    if (criticalAlerts.length === 0) {
      criticalAlerts.push({
        title: 'لا توجد مخاطر حرجة',
        description: 'المؤشرات الحالية ضمن نطاق تشغيلي مقبول. استمر في مراقبة المخزون السريع الحركة.',
        severity: 'WARNING',
      });
    }

    const topOpportunities: AIAdvisorInsight['topOpportunities'] = [];
    if (topItems[0]) {
      topOpportunities.push({
        title: `توسيع مبيعات «${topItems[0].name}»`,
        description: `يمثل أعلى إيراد (${money(topItems[0].revenue)}). اقترح حزمة بيع تكميلي بجانب الخدمات لرفع متوسط السلة من ${money(avgBasket)}.`,
        priority: 'HIGH',
      });
    }
    if (avgBasket > 0) {
      topOpportunities.push({
        title: 'رفع متوسط قيمة الفاتورة',
        description: `متوسط السلة الحالي ${money(avgBasket)}. هدف تشغيلي واقعي: +15٪ ≈ ${money(avgBasket * 1.15)} عبر upsell عند الكاشير.`,
        priority: 'HIGH',
      });
    }
    if (scheduledApts > 0 || completedApts > 0) {
      topOpportunities.push({
        title: 'تعبئة جداول الخدمات',
        description: `حجوزات مجدولة: ${scheduledApts} | مكتملة: ${completedApts} | ملغاة: ${cancelledApts}. استهدف الأيام الهادئة بعروض خدمات.`,
        priority: 'MEDIUM',
      });
    } else {
      topOpportunities.push({
        title: 'تفعيل قناة الخدمات',
        description: 'لا توجد حجوزات كافية مسجّلة. الخدمات عادةً أعلى هامشاً من التجزئة — فعّل الحجوزات وحملات التذكير.',
        priority: 'MEDIUM',
      });
    }
    if (repeatRate < 40 && (data.customers?.length || 0) > 5) {
      topOpportunities.push({
        title: 'برنامج استعادة العملاء',
        description: `معدل التكرار ${repeatRate.toFixed(1)}٪ فقط. أرسل عروض عودة للعملاء الذين لم يشتروا خلال 30 يوماً.`,
        priority: 'MEDIUM',
      });
    }

    const recommendations: AIAdvisorInsight['recommendations'] = [];
    if (lowStock.length > 0) {
      const names = lowStock.slice(0, 3).map(i => i.name).join('، ');
      recommendations.push({
        title: 'أمر شراء عاجل للمخزون المنخفض',
        action: `اطلب الآن: ${names}${lowStock.length > 3 ? ` (+${lowStock.length - 3})` : ''}`,
        impact: 'منع فقد مبيعات التجزئة والحفاظ على توفر الأصناف سريعة الحركة',
      });
    }
    if (cogs > 0 && grossMargin < 35) {
      recommendations.push({
        title: 'مراجعة أسعار البيع / تكلفة الشراء',
        action: 'راجع أصناف الهامش الأقل وتفاوض مع المورد أو اضبط سعر البيع',
        impact: `رفع الهامش الإجمالي من ${grossMargin.toFixed(1)}٪ نحو 35٪+ يحسّن إجمالي الربح مباشرة`,
      });
    }
    if (pay.CASH / Math.max(1, revenue) > 0.7) {
      recommendations.push({
        title: 'تنويع قنوات الدفع',
        action: 'شجّع البطاقة/المحفظة بعروض صغيرة لتقليل مخاطر النقد والعدّ اليدوي',
        impact: `النقد يمثل ${((pay.CASH / Math.max(1, revenue)) * 100).toFixed(0)}٪ من الإيرادات حالياً`,
      });
    }
    recommendations.push({
      title: 'مراجعة يومية لمؤشر الصحة',
      action: 'تابع صافي الربح، متوسط السلة، وأصناف تحت الحد الأدنى كل إغلاق وردية',
      impact: `المؤشر الحالي ${health}/100 — التحسين المستمر يرفع الاستقرار التشغيلي`,
    });

    const dailyRunRate = rev7 / 7;
    const nextMonthProj = dailyRunRate * 30;
    const forecastText =
      `بناءً على متوسط آخر 7 أيام (${money(dailyRunRate)}/يوم)، الإيراد المتوقع للـ 30 يوماً القادمة ≈ ${money(nextMonthProj)}` +
      (netMargin !== 0 ? ` | صافي تقديري ≈ ${money(nextMonthProj * (netMargin / 100))}` : '') +
      `.` +
      (aptCompletion > 0 ? ` معدل إتمام المواعيد: ${aptCompletion.toFixed(0)}٪.` : '');

    return {
      businessSummary,
      criticalAlerts,
      topOpportunities,
      recommendations,
      forecastText,
    };
  }

  /** Context string for Gemini / chat — facts only */
  static buildContextString(data: LiveErpBundle): string {
    const insights = this.buildInsights(data);
    const completed = (data.sales || []).filter(isCompletedSale);
    const itemMap: Record<string, { name: string; qty: number; revenue: number }> = {};
    completed.forEach(sale => {
      (sale.items || []).forEach(item => {
        const key = item.itemId;
        if (!itemMap[key]) itemMap[key] = { name: item.name, qty: 0, revenue: 0 };
        itemMap[key].qty += item.quantity;
        itemMap[key].revenue += item.price * item.quantity;
      });
    });
    const top = Object.values(itemMap).sort((a, b) => b.revenue - a.revenue).slice(0, 8);

    const lines = [
      '--- سياق أعمال Amazon Pet (بيانات حية من قاعدة النظام) ---',
      insights.businessSummary,
      '',
      'أعلى البنود إيراداً:',
      ...top.map((t, i) => `${i + 1}. ${t.name} — كمية ${t.qty} — إيراد ${money(t.revenue)}`),
      '',
      'تنبيهات:',
      ...insights.criticalAlerts.map(a => `- [${a.severity}] ${a.title}: ${a.description}`),
      '',
      'فرص:',
      ...insights.topOpportunities.map(o => `- (${o.priority}) ${o.title}: ${o.description}`),
      '--- نهاية السياق ---',
    ];
    return lines.join('\n');
  }

  /** Real monthly series + simple projection for chart */
  static buildForecastSeries(sales: Sale[]): { month: string; Sales: number; projected?: boolean }[] {
    const completed = (sales || []).filter(isCompletedSale);
    const map: Record<string, number> = {};
    completed.forEach(s => {
      const d = parseSaleDate(s);
      if (!d) return;
      const key = monthKey(d);
      map[key] = (map[key] || 0) + saleRevenue(s);
    });

    const keys = Object.keys(map).sort();
    const last3 = keys.slice(-3);
    const points = last3.map(k => {
      const [y, m] = k.split('-').map(Number);
      return {
        month: `${ARABIC_MONTHS[(m || 1) - 1]} ${String(y).slice(2)}`,
        Sales: Math.round(map[k] * 100) / 100,
        projected: false,
      };
    });

    // Project next month from average of available months (or last 30d run-rate)
    const avg = last3.length > 0
      ? last3.reduce((s, k) => s + map[k], 0) / last3.length
      : 0;
    if (avg > 0) {
      const next = new Date();
      next.setMonth(next.getMonth() + 1);
      points.push({
        month: `${ARABIC_MONTHS[next.getMonth()]} ${String(next.getFullYear()).slice(2)} (تقديري)`,
        Sales: Math.round(avg * 100) / 100,
        projected: true,
      });
    }
    return points;
  }
}
