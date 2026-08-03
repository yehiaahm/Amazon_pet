package com.animasys.modules.analytics.bre;

import com.animasys.core.security.SecurityUtils;
import com.animasys.modules.analytics.repository.BreAnalyticsRepository;
import com.animasys.modules.analytics.repository.BreAnalyticsRepository.ExpiringBatchAlertRow;
import com.animasys.modules.analytics.repository.BreAnalyticsRepository.LowStockAlertRow;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class BusinessRulesEngine {

    private final BreAnalyticsRepository breAnalyticsRepository;

    public List<Map<String, Object>> evaluateBusinessRules() {
        String tenantId;
        try {
            tenantId = SecurityUtils.requireTenantId();
        } catch (Exception ex) {
            tenantId = null;
        }
        if (tenantId == null) {
            return List.of();
        }
        return evaluateBusinessRules(tenantId);
    }

    public List<Map<String, Object>> evaluateBusinessRules(String tenantId) {
        List<Map<String, Object>> alerts = new ArrayList<>();
        for (LowStockAlertRow row : breAnalyticsRepository.lowStockAlerts(tenantId)) {
            alerts.add(Map.of(
                    "rule", "تنبيه_مخزون_منخفض",
                    "severity", "عالية",
                    "message", "كمية المخزون لـ '" + row.productName() + " - " + row.variantName() +
                            "' هي " + row.stockQuantity() + "، وهي أقل من الحد الأدنى المحدد وهو " + row.minStockLimit()
            ));
        }

        LocalDate now = LocalDate.now();
        for (ExpiringBatchAlertRow row : breAnalyticsRepository.expiringBatchCandidates(tenantId)) {
            if (row.expiryDate() == null) {
                continue;
            }
            long daysLeft = ChronoUnit.DAYS.between(now, row.expiryDate());
            if (daysLeft < 90) {
                alerts.add(Map.of(
                        "rule", "تحذير_انتهاء_صلاحية_الدفعة",
                        "severity", daysLeft < 30 ? "حرجة" : "متوسطة",
                        "message", "الدفعة '" + row.batchNumber() + "' من المنتج '" +
                                row.variantName() + "' تنتهي صلاحيتها خلال " + daysLeft + " يوم (" + row.expiryDate() + ")"
                ));
            }
        }
        return alerts;
    }
}
