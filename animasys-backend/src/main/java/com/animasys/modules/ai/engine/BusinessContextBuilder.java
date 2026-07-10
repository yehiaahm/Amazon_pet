package com.animasys.modules.ai.engine;

import com.animasys.modules.analytics.bre.BusinessRulesEngine;
import com.animasys.modules.analytics.kpi.KPIEngine;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import java.util.List;
import java.util.Map;

@Component
@RequiredArgsConstructor
public class BusinessContextBuilder {
    private final KPIEngine kpiEngine;
    private final BusinessRulesEngine rulesEngine;

    public String buildContextString(String tenantId) {
        Map<String, Object> kpis = kpiEngine.calculateKPIMetrics(tenantId);
        List<Map<String, Object>> alerts = rulesEngine.evaluateBusinessRules();

        StringBuilder sb = new StringBuilder();
        sb.append("--- بيانات سياق الأعمال ---\n");
        sb.append("المؤشرات المالية الرئيسية (KPIs):\n");
        kpis.forEach((k, v) -> sb.append("- ").append(k).append(": ").append(v).append("\n"));

        sb.append("\nتنبيهات المخاطر التشغيلية:\n");
        if (alerts.isEmpty()) {
            sb.append("- لا توجد مخاطر فورية مرصودة من محرك قواعد الأعمال.\n");
        } else {
            alerts.forEach(alert -> sb.append("- [").append(alert.get("rule")).append("] ")
                    .append("الخطورة: ").append(alert.get("severity")).append(" | الرسالة: ")
                    .append(alert.get("message")).append("\n"));
        }
        sb.append("--- نهاية بيانات السياق ---\n");

        return sb.toString();
    }
}
