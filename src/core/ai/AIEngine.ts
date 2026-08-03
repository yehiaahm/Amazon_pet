/**
 * AIEngine — chat advisor with a human conversational tone.
 * Prefers backend Gemini; falls back to local natural-language answers from live snapshot.
 */

import { api } from '../api/endpoints';
import { FullSystemSnapshot } from './SystemContextEngine';
import { formatMoney } from '../utils/money';

interface AIResponse {
  answer: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  dataUsed: string[];
}

export class AIEngine {

  static async generateResponse(
    query: string,
    snapshot: FullSystemSnapshot,
    contextString: string
  ): Promise<string> {
    const q = query.toLowerCase().trim();

    try {
      const token = localStorage.getItem('token');
      if (token) {
        const reply = await api.askAIAdvisor(query, contextString);
        if (reply && reply.trim() && !reply.startsWith('{"error"') && !reply.includes('خطأ في الاتصال')) {
          return reply;
        }
      }
    } catch (_) {
      /* local fallback */
    }

    return this.analyzeAndRespond(q, snapshot).answer;
  }

  private static analyzeAndRespond(query: string, s: FullSystemSnapshot): AIResponse {
    const fmt = (n: number) => formatMoney(n);

    if (this.matches(query, ['ربح', 'خسار', 'ربحي', 'أرباح', 'مالي', 'وضع المالي', 'profit', 'financial'])) {
      const profitable = s.finance.netProfit > 0;
      const topExp = s.finance.expensesByCategory[0];
      let answer = profitable
        ? `بصراحة؟ المحل واقف على رجله. صافي عندك حوالي ${fmt(s.finance.netProfit)} من إيراد ${fmt(s.finance.grossRevenue)}، والهامش الإجمالي تقريبًا ${s.finance.grossMargin.toFixed(0)}٪.`
        : `خليني أقولك على طول: الأرقام بتقول إنك في خسارة دلوقتي — الصافي حوالي ${fmt(s.finance.netProfit)} مع إيراد ${fmt(s.finance.grossRevenue)}.`;

      answer += ` متوسط الفاتورة عندك ${fmt(s.sales.averageBasket)}.`;
      if (topExp) {
        answer += ` أكبر بند مصروف ظاهر هو «${this.translateCategory(topExp.category)}» بحوالي ${fmt(topExp.amount)}.`;
      }
      answer += profitable
        ? ` لو عايز تزق الربح أكتر، أقرب حاجة عملية: ارفع متوسط السلة شوية من الكاشير، وراجع أصناف التكلفة العالية. تحب نمشي على المبيعات ولا المصاريف؟`
        : ` أول خطوة منطقية: شوف المصاريف الثابتة (${fmt(s.finance.totalExpenses)}) وأصناف الهامش الضعيف، وزوّد الإيراد بسرعة من الخدمات أو العروض. تحب نبدأ بالمخزون ولا بالمصاريف؟`;

      return { answer, confidence: 'HIGH', dataUsed: ['finance', 'sales'] };
    }

    if (this.matches(query, ['مخزون', 'بضاعة', 'inventory', 'stock', 'منتج', 'بضائع', 'إعادة طلب', 'طلب شراء', 'مورد', 'reorder', 'supplier', 'purchase', 'شراء'])) {
      const low = s.inventory.lowStockItems;
      let answer = `قيمة المخزون تقريبًا ${fmt(s.inventory.totalStockValue)} على ${s.inventory.totalVariants} صنف.`;

      if (low.length === 0) {
        answer += ` والأخبار الحلوة: مفيش أصناف تحت الحد الأدنى دلوقتي. خلّي عينك على السريع الحركة عشان متفاجئش.`;
      } else {
        const names = low.slice(0, 3).map(i => i.name).join('، ');
        answer += ` لكن في ${low.length} أصناف محتاجين طلب فوري — أهمهم: ${names}.`;
        const first = low[0];
        const qty = Math.max(first.deficit * 2, first.minimum);
        answer += ` لو هتعمل أمر شراء النهاردة، ابدأ بـ «${first.name}» واطلب حوالي ${qty} وحدة.`;
      }
      if (s.inventory.expiringBatches.length > 0) {
        answer += ` وكمان في دفعات قربت على الانتهاء — يستاهلوا عرض تصفية قبل ما تبوّظ.`;
      }
      answer += ` تحب أرتّب لك قائمة الطلب بالأولوية؟`;
      return { answer, confidence: 'HIGH', dataUsed: ['inventory'] };
    }

    if (this.matches(query, ['مبيعات', 'sales', 'فواتير', 'إيراد', 'بيع', 'أكثر مبيعاً', 'أعلى مبيعاً'])) {
      const top = s.sales.topSellingItems[0];
      let answer =
        `من ناحية المبيعات: عندك ${s.sales.totalSales} فاتورة بإيراد حوالي ${fmt(s.sales.totalRevenue)}، ومتوسط السلة ${fmt(s.sales.averageBasket)}. ` +
        `آخر 7 أيام جابوا ${fmt(s.sales.last7DaysRevenue)}، وآخر 30 يوم ${fmt(s.sales.last30DaysRevenue)}.`;

      if (top) {
        answer += ` أكتر حاجة شغّالة عندك حاليًا: «${top.name}» — جابت حوالي ${fmt(top.revenue)}.`;
      } else {
        answer += ` لسه مفيش تفصيل بنود كفاية أرتّب منه الأكثر مبيعًا.`;
      }
      if (s.sales.totalRefunds > 0) {
        answer += ` وخد بالك إن في ${s.sales.totalRefunds} مرتجع — لو النسبة كبرت لازم نراجع السبب.`;
      }
      answer += ` أقرب فرصة سهلة: upsell بسيط عند الكاشير يرفع متوسط السلة نحو ${fmt(s.sales.averageBasket * 1.15)}. توافق نشتغل على دي؟`;
      return { answer, confidence: 'HIGH', dataUsed: ['sales'] };
    }

    if (this.matches(query, ['خدمة', 'خدمات', 'موعد', 'مواعيد', 'جروومينغ', 'grooming', 'service', 'appointment', 'حجز', 'حجوزات'])) {
      let answer =
        `الخدمات عندك: ${s.services.totalAppointments} موعد إجمالي — مكتمل ${s.services.completedAppointments}، قادم ${s.services.upcomingAppointments}، ملغي ${s.services.cancelledAppointments}.`;

      if (s.services.totalAppointments > 0) {
        answer += ` معدل الإتمام حوالي ${s.services.completionRate.toFixed(0)}٪` +
          (s.services.mostBookedService && s.services.mostBookedService !== '—'
            ? `، والأكتر حجزًا «${s.services.mostBookedService}».`
            : `.`);
      } else {
        answer += ` بصراحة لسه الحجوزات ضعيفة — وده باب ربح كبير لو فعّلناه.`;
      }
      answer += ` إيراد الخدمات من المبيعات حوالي ${fmt(s.services.totalServiceRevenue)}. اقتراحي: عبّي الأيام الهادئة بعرض بسيط وابعث تذكير للعملاء القدام. تحب نركّز على الحجوزات؟`;
      return { answer, confidence: 'HIGH', dataUsed: ['services'] };
    }

    if (this.matches(query, ['عميل', 'عملاء', 'customer', 'crm', 'ولاء', 'قاعدة عملاء'])) {
      const top = s.crm.topCustomers[0];
      let answer =
        `قاعدة العملاء: ${s.crm.totalCustomers} عميل مسجّل. معدل اللي بيرجعوا يشتري حوالي ${s.crm.repeatCustomerRate.toFixed(0)}٪، ومتوسط ما يصرفه العميل ${fmt(s.crm.customerLifetimeValue)}.`;

      if (top) {
        answer += ` أكبر منفق ظاهر دلوقتي «${top.name}» بـ ${fmt(top.totalSpend)}.`;
      }
      answer +=
        s.crm.repeatCustomerRate < 40
          ? ` الرقم ده لسه ضعيف شوية — أحسن حركة: رسالة استرجاع لمن مجاش خلال شهر. تحب نشتغل على دي؟`
          : ` التكرار مش وحش، نقدر نحسّنه أكتر ببرنامج ولاء خفيف. تحب نناقش الفكرة؟`;
      return { answer, confidence: 'HIGH', dataUsed: ['crm'] };
    }

    if (this.matches(query, ['تنبيه', 'تحذير', 'مشكلة', 'خطر', 'alert', 'warning', 'urgent', 'عاجل'])) {
      const criticals = s.alerts.filter(a => a.type === 'CRITICAL');
      const warnings = s.alerts.filter(a => a.type === 'WARNING');
      let answer = '';
      if (criticals.length === 0 && warnings.length === 0) {
        answer = `من ناحية المخاطر: الوضع هادي حاليًا، مفيش تنبيه حرج واقف قدامي. برضه راقب المخزون السريع والصافي أسبوعيًا. في حاجة معيّنة مقلقاك؟`;
      } else {
        answer = `خليني أكون صريح معاك: `;
        if (criticals.length) {
          answer += `في ${criticals.length} حاجة محتاجة تدخّل سريع — أهمها: ${criticals[0].message}`;
        }
        if (warnings.length) {
          answer += (criticals.length ? ' ' : '') +
            `وكمان ${warnings.length} تحذير${warnings.length > 1 ? 'ات' : ''}، زي: ${warnings[0].message}`;
        }
        answer += ` لو حابب نرتّب أولوية المعالجة، قولي نبدأ بمين: المخزون ولا الربحية؟`;
      }
      return { answer, confidence: 'HIGH', dataUsed: ['alerts'] };
    }

    if (this.matches(query, ['توقع', 'نمو', 'مستقبل', 'forecast', 'grow', 'الشهر القادم', 'السنة'])) {
      const projected = (s.sales.last7DaysRevenue / 7) * 30;
      const growth =
        s.sales.last30DaysRevenue > 0
          ? ((projected - s.sales.last30DaysRevenue) / s.sales.last30DaysRevenue) * 100
          : 0;
      const answer =
        `لو كمّلنا بنفس إيقاع آخر أسبوع، الشهر الجاي ممكن يقرب من ${fmt(projected)} إيراد` +
        (s.sales.last30DaysRevenue > 0
          ? ` — ده فرق تقريبًا ${growth >= 0 ? '+' : ''}${growth.toFixed(0)}٪ عن آخر 30 يوم.`
          : `.`) +
        ` وبهامش صافي حوالي ${s.finance.netMargin.toFixed(0)}٪، الصافي التقديري يبقى نحو ${fmt(projected * (s.finance.netMargin / 100))}.` +
        ` طبعاً ده تقدير من الإيقاع الحالي مش ضمان. عايز سيناريو متحفظ ولا متفائل؟`;
      return { answer, confidence: 'MEDIUM', dataUsed: ['sales', 'finance'] };
    }

    if (this.matches(query, ['اطور', 'تطوير', 'نمو', 'توسع', 'أطور', 'تطور', 'تنمية', 'طريقة تطوير', 'تطوير المحل'])) {
      let answer =
        `لتطوير المحل وزيادة الأرباح، عندك 3 محاور سريعة العمل بناءً على أرقامك الحالية:\n` +
        `1. **رفع متوسط السلة من الكاشير**: متوسط الفاتورة حالياً ${fmt(s.sales.averageBasket)} — اقتراح منتج مكافآت أو إكسسوار عند الدفع يرفع الإيراد بسرعة.\n` +
        `2. **تأمين المخزون الأكثر مبيعاً**: عندك ${s.inventory.lowStockItems.length} أصناف منخفضة، إعادة طلب الأصناف السريعة تمنع ضياع المبيعات.\n` +
        `3. **الربط بين الخدمات والمنتجات**: عمل باقة سريعة تجذب عملاء جديد وتزود نسبة تكرار الزيارة (${s.crm.repeatCustomerRate.toFixed(0)}٪).`;
      return { answer, confidence: 'HIGH', dataUsed: ['finance', 'sales', 'inventory', 'crm'] };
    }

    if (this.matches(query, ['تقرير', 'وضع', 'كيف', 'ملخص', 'overview', 'summary', 'report', 'شامل', 'كل شيء', 'كل حاجة', 'اخبارك', 'عامل ايه', 'ازيك'])) {
      const health = this.calcHealthScore(s);
      const profitable = s.finance.netProfit > 0;
      let answer =
        `باختصار كده: المحل ${this.getHealthLabel(health)} — تقييم تقريبي ${health} من 100. ` +
        `${profitable ? `بتربح صافي حوالي ${fmt(s.finance.netProfit)}` : `الصافي ضعيف/سالب حوالي ${fmt(s.finance.netProfit)}`} ` +
        `من إيراد ${fmt(s.finance.grossRevenue)}، ومتوسط الفاتورة ${fmt(s.sales.averageBasket)}. `;

      if (s.inventory.lowStockItems.length > 0) {
        answer += `في ${s.inventory.lowStockItems.length} أصناف مخزون واطي، وأهمهم «${s.inventory.lowStockItems[0].name}». `;
      } else {
        answer += `المخزون تحت السيطرة حاليًا. `;
      }
      answer +=
        `الخطوة اللي أنصحك بيها النهاردة: ` +
        (s.inventory.lowStockItems[0]
          ? `اعمل أمر شراء لـ «${s.inventory.lowStockItems[0].name}»،`
          : `ركّز على رفع متوسط السلة،`) +
        ` وبعدين نراجع الهامش. تحب نفصّل في حتة معينة؟`;
      return { answer, confidence: 'HIGH', dataUsed: ['finance', 'sales', 'inventory', 'crm', 'alerts'] };
    }

    // Greeting / thanks
    if (this.matches(query, ['مرحبا', 'اهلا', 'أهلا', 'السلام', 'hello', 'hi', 'صباح', 'مساء', 'شكرا', 'merci', 'thanks'])) {
      return {
        answer:
          `أهلًا بيك! أنا معاك على بيانات المحل الفعلية. قولي عايز نبص على إيه: الفلوس، المبيعات، المخزون، العملاء، ولا تاخد مني صورة سريعة عن الوضع؟`,
        confidence: 'HIGH',
        dataUsed: [],
      };
    }

    return {
      answer:
        `فهمت سؤالك، بس خليني أتأكد إني جاوبك صح. من الأرقام اللي قدامي: الصافي حوالي ${fmt(s.finance.netProfit)}، وفي ${s.inventory.lowStockItems.length} أصناف مخزون واطي.` +
        ` تقدر تسألني بصيغة أوضح عن الوضع المالي، المبيعات، المخزون، العملاء، التنبيهات، أو تقولي «تقرير شامل».`,
      confidence: 'LOW',
      dataUsed: [],
    };
  }

  private static matches(query: string, keywords: string[]): boolean {
    const normQ = query.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ـ/g, '').toLowerCase();
    return keywords.some(kw => {
      const normKw = kw.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ـ/g, '').toLowerCase();
      return normQ.includes(normKw);
    });
  }

  private static translateCategory(cat: string): string {
    const map: Record<string, string> = {
      RENT: 'الإيجار',
      SALARY: 'الرواتب',
      UTILITIES: 'المرافق',
      SUPPLIES: 'المستلزمات',
      OTHER: 'مصاريف أخرى',
    };
    return map[cat] || cat;
  }

  private static calcHealthScore(s: FullSystemSnapshot): number {
    let score = 100;
    if (s.finance.netProfit < 0) score -= 30;
    if (s.finance.netMargin < 5) score -= 15;
    score -= Math.min(20, s.inventory.lowStockItems.length * 10);
    score -= s.inventory.expiringBatches.filter(b => b.daysLeft < 30).length * 10;
    if (s.services.completionRate < 80 && s.services.totalAppointments > 0) score -= 10;
    if (s.crm.repeatCustomerRate < 50 && s.crm.totalCustomers > 5) score -= 10;
    return Math.max(0, Math.min(100, score));
  }

  private static getHealthLabel(score: number): string {
    if (score >= 80) return 'ماشي كويس جدًا';
    if (score >= 60) return 'وضع مقبول وفيه فرص';
    if (score >= 40) return 'محتاج شغل شوية';
    return 'محتاج تدخل سريع';
  }
}
