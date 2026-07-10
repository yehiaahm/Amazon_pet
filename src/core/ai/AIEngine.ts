/**
 * AIEngine - محرك الذكاء الاصطناعي المحلي
 * يستخدم سياق النظام الكامل للإجابة على أسئلة المستخدم بذكاء حقيقي
 * يعمل بدون API key ويحلل البيانات الفعلية
 */

import { FullSystemSnapshot } from './SystemContextEngine';

interface AIResponse {
  answer: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  dataUsed: string[];
}

export class AIEngine {

  static async generateResponse(
    query: string,
    snapshot: FullSystemSnapshot,
    _contextString: string
  ): Promise<string> {

    const q = query.toLowerCase().trim();

    // محاولة استدعاء الـ Backend أولاً (Gemini API)
    const backendUrl = localStorage.getItem('BACKEND_URL') || 'http://localhost:8080/api';
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const res = await fetch(`${backendUrl}/ai/ask`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ tenantId: 't-1', query })
        });
        const json = await res.json();
        if (json.success && json.data) return json.data;
      } catch (_) { /* fallback to local engine */ }
    }

    // ───── المحرك المحلي الذكي ──────────────────────────────
    const response = this.analyzeAndRespond(q, snapshot);
    return response.answer;
  }

  // ═══════════════════════════════════════════════════════════
  // محرك التحليل والرد الذكي
  // ═══════════════════════════════════════════════════════════
  private static analyzeAndRespond(query: string, s: FullSystemSnapshot): AIResponse {
    const fmt = (n: number) => `$${n.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // ─── تحليل ربحية المحل ────────────────────────────────
    if (this.matches(query, ['ربح', 'خسار', 'ربحي', 'أرباح', 'مالي', 'وضع المالي', 'profit', 'financial'])) {
      const profitable = s.finance.netProfit > 0;
      return {
        answer: `## 📊 التقرير المالي الشامل للمحل\n\n` +
          `**الحالة العامة:** المحل ${profitable ? '✅ يعمل بربحية' : '🔴 يعمل بخسارة'}\n\n` +
          `### المؤشرات الرئيسية\n` +
          `| المؤشر | القيمة |\n|---|---|\n` +
          `| إجمالي الإيرادات | ${fmt(s.finance.grossRevenue)} |\n` +
          `| إجمالي الربح | ${fmt(s.finance.grossProfit)} |\n` +
          `| صافي الربح | **${fmt(s.finance.netProfit)}** |\n` +
          `| هامش الربح الإجمالي | ${s.finance.grossMargin.toFixed(1)}٪ |\n` +
          `| هامش الربح الصافي | ${s.finance.netMargin.toFixed(1)}٪ |\n` +
          `| إجمالي المصاريف | ${fmt(s.finance.totalExpenses)} |\n\n` +
          `### توزيع المصاريف\n` +
          s.finance.expensesByCategory.map(e =>
            `- **${this.translateCategory(e.category)}:** ${fmt(e.amount)} (${e.percentage.toFixed(1)}٪)`
          ).join('\n') + '\n\n' +
          `### 💡 التوصية\n` +
          (profitable
            ? `الأداء المالي إيجابي. لزيادة الأرباح، يُنصح بالتركيز على خدمات الجروومينغ ذات الهامش المرتفع (${s.services.serviceMargins[0]?.estimatedMargin}٪) وتقليل تكلفة البضاعة المباعة البالغة ${fmt(s.finance.grossRevenue - s.finance.grossProfit)}.`
            : `⚠️ المحل يعمل بخسارة. يجب مراجعة تكاليف المصاريف الثابتة البالغة ${fmt(s.finance.totalExpenses)} وزيادة الإيرادات بشكل عاجل.`),
        confidence: 'HIGH',
        dataUsed: ['finance', 'kpis']
      };
    }

    // ─── تحليل المخزون ────────────────────────────────────
    if (this.matches(query, ['مخزون', 'بضاعة', 'inventory', 'stock', 'منتج', 'بضائع'])) {
      const lowStockCount = s.inventory.lowStockItems.length;
      const expiryCount = s.inventory.expiringBatches.length;
      return {
        answer: `## 📦 تقرير المخزون الشامل\n\n` +
          `**قيمة المخزون الإجمالية:** ${fmt(s.inventory.totalStockValue)}\n` +
          `**إجمالي المنتجات:** ${s.inventory.totalProducts} منتج | ${s.inventory.totalVariants} متغير\n` +
          `**معدل الدوران:** ${s.kpis.inventoryTurnover.toFixed(2)}x\n\n` +
          (lowStockCount > 0
            ? `### ⚠️ تنبيهات المخزون المنخفض (${lowStockCount} منتج)\n` +
              s.inventory.lowStockItems.map(item =>
                `- **${item.name} (${item.variant}):** متبقي **${item.current}** من أصل الحد الأدنى **${item.minimum}** ← يحتاج إعادة طلب **${item.deficit}** وحدة`
              ).join('\n') + '\n\n'
            : `✅ **جميع مستويات المخزون طبيعية**\n\n`) +
          (expiryCount > 0
            ? `### 🚨 دفعات قاربت على الانتهاء (${expiryCount})\n` +
              s.inventory.expiringBatches.map(b =>
                `- **${b.product}** - الدفعة ${b.batch}: تنتهي في ${b.expiryDate} ← **باقي ${b.daysLeft} يوم** | الكمية: ${b.quantity}`
              ).join('\n') + '\n\n'
            : '') +
          `### 🏆 أعلى المنتجات قيمةً في المخزون\n` +
          s.inventory.topStockItems.map((item, i) =>
            `${i + 1}. ${item.name}: ${item.quantity} وحدة | قيمة ${fmt(item.value)}`
          ).join('\n'),
        confidence: 'HIGH',
        dataUsed: ['inventory']
      };
    }

    // ─── تحليل المبيعات ───────────────────────────────────
    if (this.matches(query, ['مبيعات', 'sales', 'فواتير', 'إيراد', 'بيع', 'أكثر مبيعاً', 'أعلى مبيعاً'])) {
      return {
        answer: `## 🛍️ تقرير المبيعات التحليلي\n\n` +
          `| المؤشر | القيمة |\n|---|---|\n` +
          `| إجمالي الفواتير | ${s.sales.totalSales} فاتورة |\n` +
          `| إجمالي الإيرادات | ${fmt(s.sales.totalRevenue)} |\n` +
          `| متوسط قيمة السلة | **${fmt(s.sales.averageBasket)}** |\n` +
          `| إيرادات آخر 7 أيام | ${fmt(s.sales.last7DaysRevenue)} |\n` +
          `| إيرادات آخر 30 يوم | ${fmt(s.sales.last30DaysRevenue)} |\n` +
          `| المتوسط اليومي | ${fmt(s.sales.dailyAvgRevenue)} |\n` +
          `| عدد المرتجعات | ${s.sales.totalRefunds} فاتورة |\n\n` +
          `### 🏆 أكثر المنتجات مبيعاً\n` +
          s.sales.topSellingItems.map((item, i) =>
            `${i + 1}. **${item.name}** — الكمية: ${item.qty} | الإيراد: ${fmt(item.revenue)}`
          ).join('\n') + '\n\n' +
          `### 💳 توزيع طرق الدفع\n` +
          `- 💵 نقدي: ${fmt(s.sales.paymentMethodBreakdown.cash)} (${((s.sales.paymentMethodBreakdown.cash / s.sales.totalRevenue) * 100).toFixed(1)}٪)\n` +
          `- 💳 بطاقة: ${fmt(s.sales.paymentMethodBreakdown.card)} (${((s.sales.paymentMethodBreakdown.card / s.sales.totalRevenue) * 100).toFixed(1)}٪)\n` +
          `- 📱 موبايل: ${fmt(s.sales.paymentMethodBreakdown.mobile)} (${((s.sales.paymentMethodBreakdown.mobile / s.sales.totalRevenue) * 100).toFixed(1)}٪)\n\n` +
          `### 💡 توصية\n` +
          `متوسط السلة ${fmt(s.sales.averageBasket)} جيد. يمكن رفعه بإضافة عروض البيع التكميلي (Upsell) خلال عمليات الجروومينغ لتصل إلى ${fmt(s.sales.averageBasket * 1.2)}.`,
        confidence: 'HIGH',
        dataUsed: ['sales']
      };
    }

    // ─── تحليل الخدمات والمواعيد ──────────────────────────
    if (this.matches(query, ['خدمة', 'خدمات', 'موعد', 'مواعيد', 'جروومينغ', 'grooming', 'service', 'appointment', 'حجز', 'حجوزات'])) {
      return {
        answer: `## ✂️ تقرير الخدمات والمواعيد\n\n` +
          `**إجمالي المواعيد المسجلة:** ${s.services.totalAppointments}\n` +
          `**معدل الإتمام:** ${s.services.completionRate.toFixed(1)}٪\n` +
          `**أكثر خدمة محجوزة:** ${s.services.mostBookedService}\n` +
          `**إيرادات الخدمات الإجمالية:** ${fmt(s.services.totalServiceRevenue)}\n\n` +
          `### 📅 تفاصيل الحجوزات\n` +
          `- ✅ مكتملة: ${s.services.completedAppointments}\n` +
          `- 🔲 قادمة: ${s.services.upcomingAppointments}\n` +
          `- ❌ ملغاة: ${s.services.cancelledAppointments}\n\n` +
          `### 💰 هوامش ربح الخدمات\n` +
          s.services.serviceMargins.map(sv =>
            `- **${sv.name}:** السعر ${fmt(sv.price)} | الهامش المقدر **${sv.estimatedMargin}٪**`
          ).join('\n') + '\n\n' +
          `### 💡 التوصية\n` +
          `خدمات الجروومينغ تحقق أعلى هوامش في المحل. يُنصح بـ:\n` +
          `- زيادة الطاقة الاستيعابية في أيام الذروة\n` +
          `- إطلاق حملة SMS للعملاء غير النشطين (${Math.round(s.crm.totalCustomers * 0.35)} عميل) لحجز مواعيد جديدة\n` +
          `- تطبيق خصم 10٪ أيام الثلاثاء لتعبئة الجداول الفارغة`,
        confidence: 'HIGH',
        dataUsed: ['services', 'crm']
      };
    }

    // ─── تحليل العملاء ────────────────────────────────────
    if (this.matches(query, ['عميل', 'عملاء', 'customer', 'crm', 'ولاء', 'قاعدة عملاء'])) {
      return {
        answer: `## 👥 تقرير قاعدة العملاء والـ CRM\n\n` +
          `**إجمالي العملاء المسجلين:** ${s.crm.totalCustomers}\n` +
          `**إجمالي الحيوانات الأليفة:** ${s.crm.totalPets}\n` +
          `**معدل العملاء المتكررين:** ${s.crm.repeatCustomerRate}٪\n` +
          `**القيمة العمرية للعميل (CLV):** ${fmt(s.crm.customerLifetimeValue)}\n\n` +
          `### 🐾 أنواع الحيوانات الأليفة\n` +
          s.crm.petsBySpecies.map(p => `- ${this.translateSpecies(p.species)}: ${p.count} حيوان`).join('\n') + '\n\n' +
          `### 🏆 أفضل العملاء إنفاقاً\n` +
          s.crm.topCustomers.map((c, i) =>
            `${i + 1}. **${c.name}:** ${fmt(c.totalSpend)}`
          ).join('\n') + '\n\n' +
          `### 💡 توصيات تطوير قاعدة العملاء\n` +
          `- تفعيل برنامج نقاط الولاء لتحسين معدل التكرار من ${s.crm.repeatCustomerRate}٪ إلى 75٪+\n` +
          `- إرسال تذكيرات مواعيد الجروومينغ للعملاء كل 4-6 أسابيع\n` +
          `- استهداف أصحاب الكلاب (${s.crm.petsBySpecies.find(p => p.species === 'DOG')?.count || 0} عميل) بعروض التغذية المتخصصة`,
        confidence: 'HIGH',
        dataUsed: ['crm']
      };
    }

    // ─── تنبيهات وتحذيرات ─────────────────────────────────
    if (this.matches(query, ['تنبيه', 'تحذير', 'مشكلة', 'خطر', 'alert', 'warning', 'urgent', 'عاجل'])) {
      const criticals = s.alerts.filter(a => a.type === 'CRITICAL');
      const warnings = s.alerts.filter(a => a.type === 'WARNING');
      return {
        answer: `## 🚨 لوحة التنبيهات النشطة\n\n` +
          (criticals.length > 0
            ? `### 🔴 تنبيهات حرجة (${criticals.length})\n` +
              criticals.map(a => `- **[${a.category}]** ${a.message}`).join('\n') + '\n\n'
            : `✅ لا توجد تنبيهات حرجة\n\n`) +
          (warnings.length > 0
            ? `### 🟡 تحذيرات (${warnings.length})\n` +
              warnings.map(a => `- **[${a.category}]** ${a.message}`).join('\n') + '\n\n'
            : `✅ لا توجد تحذيرات\n\n`) +
          `### 📋 خطة العمل الموصى بها\n` +
          (s.inventory.lowStockItems.length > 0
            ? `1. **فوري:** طلب إعادة تخزين ${s.inventory.lowStockItems.map(i => i.name).join(' و ')}\n`
            : '') +
          (s.inventory.expiringBatches.length > 0
            ? `2. **هذا الأسبوع:** تخفيض أسعار المنتجات منتهية الصلاحية قريباً بنسبة 20٪ للتصفية\n`
            : '') +
          `3. **مستمر:** مراقبة هوامش الربح يومياً والحفاظ عليها فوق 10٪`,
        confidence: 'HIGH',
        dataUsed: ['alerts', 'inventory']
      };
    }

    // ─── مقارنة الخدمات ───────────────────────────────────
    if (this.matches(query, ['هامش', 'أعلى خدمة', 'أفضل خدمة', 'أعلى ربح', 'margin'])) {
      const sorted = [...s.services.serviceMargins].sort((a, b) => b.estimatedMargin - a.estimatedMargin);
      return {
        answer: `## 💰 تحليل هوامش ربح الخدمات\n\n` +
          `### ترتيب الخدمات حسب الهامش\n` +
          sorted.map((sv, i) =>
            `${i + 1}. **${sv.name}**\n` +
            `   - السعر: ${fmt(sv.price)} | الهامش: **${sv.estimatedMargin}٪**\n` +
            `   - الربح الصافي المقدر لكل وحدة: ${fmt(sv.price * (sv.estimatedMargin / 100))}`
          ).join('\n\n') + '\n\n' +
          `### 💡 التوصية الاستراتيجية\n` +
          `الخدمة الأعلى ربحية هي **${sorted[0]?.name}** بهامش **${sorted[0]?.estimatedMargin}٪**.\n` +
          `يُنصح بالتسويق لها بشكل مكثف وتدريب الموظفين على اقتراحها خلال كل زيارة.\n` +
          `زيادة حجم مبيعاتها بنسبة 20٪ سيضيف تقريباً ${fmt((s.services.totalServiceRevenue * 0.2 * sorted[0]?.estimatedMargin) / 100)} شهرياً للأرباح الصافية.`,
        confidence: 'HIGH',
        dataUsed: ['services']
      };
    }

    // ─── إعادة الطلب / موردين ──────────────────────────────
    if (this.matches(query, ['إعادة طلب', 'طلب شراء', 'مورد', 'موردين', 'reorder', 'supplier', 'purchase', 'شراء'])) {
      const lowItems = s.inventory.lowStockItems;
      if (lowItems.length === 0) {
        return {
          answer: `## ✅ لا توجد منتجات تحتاج إعادة طلب الآن\n\n` +
            `جميع مستويات المخزون أعلى من الحد الأدنى.\n\n` +
            `قيمة المخزون الحالية: ${fmt(s.inventory.totalStockValue)}`,
          confidence: 'HIGH',
          dataUsed: ['inventory']
        };
      }
      return {
        answer: `## 🛒 قائمة المشتريات المطلوبة\n\n` +
          `يوجد **${lowItems.length} منتجات** تحتاج إعادة طلب فوري:\n\n` +
          lowItems.map((item, i) => {
            const recommendedQty = item.deficit * 3; // 3x buffer
            return `### ${i + 1}. ${item.name} (${item.variant})\n` +
              `- المخزون الحالي: **${item.current}** وحدة\n` +
              `- الحد الأدنى: ${item.minimum} وحدة\n` +
              `- العجز الحالي: **${item.deficit}** وحدة\n` +
              `- الكمية الموصى بطلبها: **${recommendedQty}** وحدة (3x الحد الأدنى)`;
          }).join('\n\n') + '\n\n' +
          `### 📧 مسودة أمر الشراء\n` +
          `الموضوع: أمر شراء عاجل - ${new Date().toLocaleDateString('ar-EG')}\n\n` +
          `حضرة المورد الكريم،\n\n` +
          `نرجو توريد المنتجات التالية لفرع أنيماسيز:\n` +
          lowItems.map(item =>
            `- ${item.name} (${item.variant}): ${item.deficit * 3} وحدة`
          ).join('\n') + '\n\n' +
          `يُرجى التأكيد والإرسال على: billing@animasys.com`,
        confidence: 'HIGH',
        dataUsed: ['inventory']
      };
    }

    // ─── توقعات النمو ─────────────────────────────────────
    if (this.matches(query, ['توقع', 'نمو', 'مستقبل', 'forecast', 'grow', 'الشهر القادم', 'السنة'])) {
      const projectedGrowth = s.sales.last7DaysRevenue / 7 * 30;
      const currentMonthly = s.sales.last30DaysRevenue;
      const growthRate = currentMonthly > 0 ? ((projectedGrowth - currentMonthly) / currentMonthly) * 100 : 0;
      return {
        answer: `## 📈 تحليل التوقعات والنمو\n\n` +
          `### البيانات الفعلية\n` +
          `- إيرادات آخر 7 أيام: ${fmt(s.sales.last7DaysRevenue)}\n` +
          `- إيرادات آخر 30 يوم: ${fmt(s.sales.last30DaysRevenue)}\n` +
          `- متوسط يومي: ${fmt(s.sales.dailyAvgRevenue)}\n\n` +
          `### توقعات الشهر القادم\n` +
          `- الإيرادات المتوقعة: **${fmt(projectedGrowth)}**\n` +
          `- معدل النمو المتوقع: **${growthRate > 0 ? '+' : ''}${growthRate.toFixed(1)}٪**\n` +
          `- الربح الصافي المتوقع: **${fmt(projectedGrowth * (s.finance.netMargin / 100))}**\n` +
          `- المصاريف المتوقعة (ثابتة): ${fmt(s.finance.burnRate)}\n\n` +
          `### سيناريوهات النمو\n` +
          `| السيناريو | الإيرادات | الربح الصافي |\n|---|---|---|\n` +
          `| متحفظ (-5٪) | ${fmt(projectedGrowth * 0.95)} | ${fmt(projectedGrowth * 0.95 * s.finance.netMargin / 100)} |\n` +
          `| متوقع | ${fmt(projectedGrowth)} | ${fmt(projectedGrowth * s.finance.netMargin / 100)} |\n` +
          `| متفائل (+10٪) | ${fmt(projectedGrowth * 1.1)} | ${fmt(projectedGrowth * 1.1 * s.finance.netMargin / 100)} |\n\n` +
          `### 💡 لتحقيق السيناريو المتفائل\n` +
          `- زيادة مواعيد الجروومينغ بـ ${Math.ceil(s.services.totalAppointments * 0.1)} موعد شهرياً\n` +
          `- تفعيل عروض البيع التكميلي لرفع متوسط السلة من ${fmt(s.sales.averageBasket)} إلى ${fmt(s.sales.averageBasket * 1.15)}`,
        confidence: 'HIGH',
        dataUsed: ['sales', 'finance']
      };
    }

    // ─── تقرير شامل / ما هو وضع المحل ────────────────────
    if (this.matches(query, ['تقرير', 'وضع', 'كيف', 'ملخص', 'overview', 'summary', 'report', 'شامل', 'كل شيء', 'كل حاجة'])) {
      const alerts = s.alerts;
      const profitable = s.finance.netProfit > 0;
      const healthScore = this.calcHealthScore(s);
      return {
        answer: `## 🏪 التقرير التنفيذي الشامل لمحل AnimaSys\n\n` +
          `**🎯 نقاط الصحة التشغيلية:** ${healthScore}/100 — ${this.getHealthLabel(healthScore)}\n\n` +
          `---\n\n` +
          `### 💰 الوضع المالي\n` +
          `- الحالة: ${profitable ? '✅ مربح' : '🔴 خسارة'} | صافي الربح: **${fmt(s.finance.netProfit)}**\n` +
          `- الإيرادات الإجمالية: ${fmt(s.finance.grossRevenue)} | الهامش الإجمالي: ${s.finance.grossMargin.toFixed(1)}٪\n\n` +
          `### 🛍️ المبيعات\n` +
          `- ${s.sales.totalSales} فاتورة | متوسط السلة: ${fmt(s.sales.averageBasket)}\n` +
          `- أعلى منتج: ${s.sales.topSellingItems[0]?.name || 'لا توجد بيانات'}\n\n` +
          `### 📦 المخزون\n` +
          `- قيمة المخزون: ${fmt(s.inventory.totalStockValue)} | ${s.inventory.lowStockItems.length > 0 ? `⚠️ ${s.inventory.lowStockItems.length} منتج بمخزون منخفض` : '✅ مستويات سليمة'}\n\n` +
          `### ✂️ الخدمات\n` +
          `- ${s.services.totalAppointments} موعد | معدل الإتمام: ${s.services.completionRate.toFixed(0)}٪ | إيرادات: ${fmt(s.services.totalServiceRevenue)}\n\n` +
          `### 👥 العملاء\n` +
          `- ${s.crm.totalCustomers} عميل | ${s.crm.totalPets} حيوان أليف | معدل التكرار: ${s.crm.repeatCustomerRate}٪\n\n` +
          (alerts.length > 0
            ? `### 🚨 التنبيهات النشطة (${alerts.length})\n` +
              alerts.slice(0, 3).map(a => `- ${a.type === 'CRITICAL' ? '🔴' : '🟡'} ${a.message}`).join('\n') + '\n\n'
            : `### ✅ لا توجد تنبيهات نشطة\n\n`) +
          `### 🎯 أولويات العمل هذا الأسبوع\n` +
          `1. ${s.inventory.lowStockItems.length > 0 ? `إعادة طلب: ${s.inventory.lowStockItems[0]?.name}` : 'الحفاظ على مستويات المخزون الحالية'}\n` +
          `2. ${s.inventory.expiringBatches.length > 0 ? `تصفية: ${s.inventory.expiringBatches[0]?.product} بخصم 20٪` : 'لا توجد دفعات تحتاج تصفية'}\n` +
          `3. تفعيل حملة SMS لاستعادة العملاء غير النشطين لزيادة المواعيد`,
        confidence: 'HIGH',
        dataUsed: ['finance', 'sales', 'inventory', 'services', 'crm', 'alerts']
      };
    }

    // ─── الرد الافتراضي الذكي ─────────────────────────────
    return {
      answer: `## 🤖 تحليل سؤالك\n\n` +
        `لم أتعرف على موضوع محدد في سؤالك، لكن إليك ملخصاً سريعاً للوضع الراهن:\n\n` +
        `**📊 المحل:** ${s.finance.netProfit > 0 ? '✅ يعمل بربحية' : '🔴 يعمل بخسارة'} | الربح الصافي: **${fmt(s.finance.netProfit)}**\n` +
        `**📦 المخزون:** ${s.inventory.lowStockItems.length} منتج بمخزون منخفض\n` +
        `**🚨 التنبيهات:** ${s.alerts.filter(a => a.type === 'CRITICAL').length} حرجة، ${s.alerts.filter(a => a.type === 'WARNING').length} تحذيرية\n\n` +
        `يمكنك سؤالي عن:\n` +
        `- 💰 **الوضع المالي والأرباح**\n` +
        `- 📦 **المخزون والمنتجات**\n` +
        `- 🛍️ **المبيعات والإيرادات**\n` +
        `- ✂️ **الخدمات والمواعيد**\n` +
        `- 👥 **العملاء والـ CRM**\n` +
        `- 📈 **التوقعات والنمو**\n` +
        `- 🚨 **التنبيهات والمشاكل**\n` +
        `- 🛒 **طلبات الشراء والموردين**`,
      confidence: 'LOW',
      dataUsed: []
    };
  }

  // ─── دوال مساعدة ──────────────────────────────────────────
  private static matches(query: string, keywords: string[]): boolean {
    return keywords.some(kw => query.includes(kw));
  }

  private static translateCategory(cat: string): string {
    const map: Record<string, string> = {
      RENT: 'إيجار', SALARY: 'رواتب', UTILITIES: 'مرافق', SUPPLIES: 'مستلزمات', OTHER: 'أخرى'
    };
    return map[cat] || cat;
  }

  private static translateSpecies(species: string): string {
    const map: Record<string, string> = {
      DOG: '🐕 كلاب', CAT: '🐈 قطط', BIRD: '🐦 طيور', OTHER: '🐾 أخرى'
    };
    return map[species] || species;
  }

  private static calcHealthScore(s: FullSystemSnapshot): number {
    let score = 100;
    if (s.finance.netProfit < 0) score -= 30;
    if (s.finance.netMargin < 5) score -= 15;
    score -= s.inventory.lowStockItems.length * 10;
    score -= s.inventory.expiringBatches.filter(b => b.daysLeft < 30).length * 15;
    if (s.services.completionRate < 80) score -= 10;
    if (s.crm.repeatCustomerRate < 50) score -= 10;
    return Math.max(0, Math.min(100, score));
  }

  private static getHealthLabel(score: number): string {
    if (score >= 80) return '✅ ممتاز';
    if (score >= 60) return '🟡 جيد';
    if (score >= 40) return '🟠 يحتاج تحسين';
    return '🔴 يحتاج تدخل عاجل';
  }
}
