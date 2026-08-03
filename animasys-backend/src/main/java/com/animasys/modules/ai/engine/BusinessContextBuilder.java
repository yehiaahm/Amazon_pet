package com.animasys.modules.ai.engine;

import com.animasys.modules.ai.config.AiPromptLimits;
import com.animasys.modules.ai.context.AiClientContextSanitizer;
import com.animasys.modules.ai.context.AiContextRepository;
import com.animasys.modules.ai.context.AiContextRepository.LowStockRow;
import com.animasys.modules.ai.context.AiContextRepository.PaymentBreakdownRow;
import com.animasys.modules.analytics.bre.BusinessRulesEngine;
import com.animasys.modules.analytics.kpi.KPIEngine;
import com.animasys.modules.analytics.repository.DashboardAnalyticsRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;

@Component
@RequiredArgsConstructor
public class BusinessContextBuilder {

    private static final ZoneId ZONE = ZoneId.systemDefault();

    private final KPIEngine kpiEngine;
    private final BusinessRulesEngine rulesEngine;
    private final DashboardAnalyticsRepository analyticsRepository;
    private final AiContextRepository aiContextRepository;

    public String buildContextString(String tenantId) {
        return buildContextString(tenantId, null);
    }

    public String buildContextString(String tenantId, String clientContext) {
        Map<String, Object> kpis = kpiEngine.calculateKPIMetrics(tenantId);
        List<Map<String, Object>> alerts = rulesEngine.evaluateBusinessRules();

        StringBuilder sb = new StringBuilder();
        sb.append("--- بيانات سياق الأعمال (من قاعدة Amazon Pet) ---\n");
        sb.append("المؤشرات المالية الرئيسية (KPIs):\n");
        kpis.forEach((k, v) -> sb.append("- ").append(k).append(": ").append(v).append("\n"));

        appendSalesIntelligence(sb, tenantId);
        appendInventorySummary(sb, tenantId);
        sb.append("\nتنبيهات المخاطر التشغيلية:\n");
        if (alerts.isEmpty()) {
            sb.append("- لا توجد مخاطر فورية مرصودة من محرك قواعد الأعمال.\n");
        } else {
            alerts.stream().limit(12).forEach(alert -> sb.append("- [").append(alert.get("rule")).append("] ")
                    .append("الخطورة: ").append(alert.get("severity")).append(" | الرسالة: ")
                    .append(alert.get("message")).append("\n"));
        }

        String sanitizedClientContext = AiClientContextSanitizer.sanitize(clientContext);
        if (sanitizedClientContext != null) {
            sb.append("\n--- سياق إضافي من واجهة المستشار (بيانات حية مجمّعة) ---\n");
            sb.append(sanitizedClientContext).append("\n");
        }

        sb.append("--- نهاية بيانات السياق ---\n");
        return enforceContextByteLimit(sb.toString());
    }

    private String enforceContextByteLimit(String context) {
        int max = AiPromptLimits.AI_PROMPT_MAX_CONTEXT_BYTES;
        if (context.getBytes(StandardCharsets.UTF_8).length <= max) {
            return context;
        }
        String suffix = AiPromptLimits.CLIENT_CONTEXT_TRUNCATED_SUFFIX;
        int suffixBytes = suffix.getBytes(StandardCharsets.UTF_8).length;
        StringBuilder sb = new StringBuilder(context);
        while (sb.length() > 0
                && sb.toString().getBytes(StandardCharsets.UTF_8).length + suffixBytes > max) {
            sb.setLength(sb.length() - 1);
        }
        return sb + suffix;
    }

    private void appendSalesIntelligence(StringBuilder sb, String tenantId) {
        LocalDate today = LocalDate.now(ZONE);
        LocalDate d7 = today.minusDays(7);
        LocalDate d30 = today.minusDays(30);

        var week = analyticsRepository.aggregatePeriod(tenantId, d7, today);
        var month = analyticsRepository.aggregatePeriod(tenantId, d30, today);
        Instant from30 = d30.atStartOfDay(ZONE).toInstant();
        Instant toExclusive = today.plusDays(1).atStartOfDay(ZONE).toInstant();
        List<PaymentBreakdownRow> payments = aiContextRepository.paymentBreakdown(tenantId, from30, toExclusive);
        List<Map<String, Object>> topProducts = analyticsRepository.topProducts(tenantId, d30, today, 5);
        List<Map<String, Object>> topCustomers = analyticsRepository.topCustomers(tenantId, d30, today, 5);

        sb.append("\nذكاء المبيعات:\n");
        sb.append("- إيراد آخر 7 أيام: ").append(week.revenue().setScale(2, RoundingMode.HALF_UP))
                .append(" (").append(week.saleCount()).append(" فاتورة)\n");
        sb.append("- إيراد آخر 30 يوم: ").append(month.revenue().setScale(2, RoundingMode.HALF_UP))
                .append(" (").append(month.saleCount()).append(" فاتورة)\n");

        BigDecimal cash = BigDecimal.ZERO;
        BigDecimal card = BigDecimal.ZERO;
        BigDecimal mobile = BigDecimal.ZERO;
        for (PaymentBreakdownRow row : payments) {
            switch (row.method()) {
                case "CASH" -> cash = row.amount();
                case "CARD" -> card = row.amount();
                case "MOBILE" -> mobile = row.amount();
                default -> { }
            }
        }
        sb.append("- توزيع الدفع (30 يوم): نقد ").append(cash.setScale(2, RoundingMode.HALF_UP))
                .append(" | بطاقة ").append(card.setScale(2, RoundingMode.HALF_UP))
                .append(" | موبايل ").append(mobile.setScale(2, RoundingMode.HALF_UP)).append("\n");

        appendTopList(sb, "أعلى 5 منتجات (30 يوم)", topProducts, "name", "quantity", "revenue");
        appendTopCustomers(sb, topCustomers);
    }

    private void appendInventorySummary(StringBuilder sb, String tenantId) {
        long lowStock = aiContextRepository.lowStockSkuCount(tenantId);
        List<LowStockRow> samples = aiContextRepository.topLowStock(tenantId, 5);
        sb.append("\nملخص المخزون:\n");
        sb.append("- أصناف at/below حد إعادة الطلب: ").append(lowStock).append("\n");
        if (samples.isEmpty()) {
            sb.append("- لا توجد عينات low-stock حالياً.\n");
        } else {
            sb.append("- عينات low-stock:\n");
            int i = 1;
            for (LowStockRow row : samples) {
                sb.append("  ").append(i++).append(") ").append(row.productName())
                        .append(" / ").append(row.variantName())
                        .append(" — مخزون ").append(row.stock())
                        .append(" / حد ").append(row.minStock()).append("\n");
            }
        }
    }

    private void appendTopList(StringBuilder sb, String title, List<Map<String, Object>> rows,
                               String nameKey, String qtyKey, String revKey) {
        if (rows.isEmpty()) {
            sb.append("- لا توجد ").append(title).append(".\n");
            return;
        }
        sb.append("- ").append(title).append(":\n");
        int i = 1;
        for (Map<String, Object> row : rows) {
            sb.append("  ").append(i++).append(") ").append(row.get(nameKey))
                    .append(" — كمية ").append(row.get(qtyKey))
                    .append(" — إيراد ").append(row.get(revKey)).append("\n");
        }
    }

    private void appendTopCustomers(StringBuilder sb, List<Map<String, Object>> rows) {
        if (rows.isEmpty()) {
            sb.append("- لا توجد بيانات عملاء top في آخر 30 يوم.\n");
            return;
        }
        sb.append("- أعلى 5 عملاء (30 يوم):\n");
        int i = 1;
        for (Map<String, Object> row : rows) {
            sb.append("  ").append(i++).append(") ").append(row.get("name"))
                    .append(" — طلبات ").append(row.get("orderCount"))
                    .append(" — إنفاق ").append(row.get("totalSpend")).append("\n");
        }
    }
}
