package com.animasys.modules.analytics.kpi;

import com.animasys.modules.analytics.repository.DashboardAnalyticsRepository;
import com.animasys.modules.analytics.repository.DashboardAnalyticsRepository.KpiSalesMetrics;
import com.animasys.modules.inventory.service.FifoCostingService;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class KPIEngine {

    private final DashboardAnalyticsRepository analyticsRepository;
    private final FifoCostingService fifoCostingService;

    /**
     * aggregateKpiSales() is a genuine all-time aggregate (no period to bound it by, unlike the
     * dashboard's period metrics) -- its cost is inherent to the total row count and only grows.
     * Confirmed live during the 2026-08-22 16h soak: at ~15k sale_items it took 60+ seconds per
     * call, holding a Hikari connection the whole time (all 144 connection-leak warnings in that
     * run traced to this exact method), compounding pool exhaustion under concurrent load. This is
     * a business-intelligence figure (revenue/COGS/margin), not a transactional read -- caching it
     * for the same TTL already used elsewhere in this codebase (CacheConfig's 30min Caffeine cache)
     * trades acceptable staleness for eliminating repeated full-table recomputation.
     */
    @Cacheable(value = "kpiMetrics", key = "#tenantId")
    public Map<String, Object> calculateKPIMetrics(String tenantId) {
        KpiSalesMetrics sales = analyticsRepository.aggregateKpiSales(tenantId);
        BigDecimal grossRevenue = sales.revenue();
        BigDecimal totalCOGS = sales.cogs();
        BigDecimal totalExpenses = analyticsRepository.sumExpenses(tenantId);
        BigDecimal grossProfit = grossRevenue.subtract(totalCOGS);
        BigDecimal netProfit = grossProfit.subtract(totalExpenses);

        BigDecimal margin = BigDecimal.ZERO;
        if (grossRevenue.compareTo(BigDecimal.ZERO) > 0) {
            margin = grossProfit.divide(grossRevenue, 4, RoundingMode.HALF_UP).multiply(BigDecimal.valueOf(100));
        }

        long totalSalesCount = sales.saleCount();
        double repeatRate = analyticsRepository.repeatCustomerRate(tenantId);
        BigDecimal averageBasket = totalSalesCount > 0
                ? grossRevenue.divide(BigDecimal.valueOf(totalSalesCount), 2, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;

        Instant cutoff = Instant.now().minus(30, ChronoUnit.DAYS);
        long deadStockCount = analyticsRepository.deadStockCount(tenantId, cutoff);
        BigDecimal inventoryValue = fifoCostingService.calculateInventoryValuation(tenantId);

        String turnover = "N/A";
        if (inventoryValue.compareTo(BigDecimal.ZERO) > 0) {
            turnover = totalCOGS.divide(inventoryValue, 2, RoundingMode.HALF_UP).toPlainString();
        }

        Map<String, Object> metrics = new HashMap<>();
        metrics.put("إجمالي_الإيرادات", grossRevenue);
        metrics.put("تكلفة_البضاعة_المباعة", totalCOGS);
        metrics.put("إجمالي_الربح", grossProfit);
        metrics.put("صافي_الربح", netProfit);
        metrics.put("إجمالي_المصاريف", totalExpenses);
        metrics.put("نسبة_هامش_الربح_الإجمالي", margin.setScale(2, RoundingMode.HALF_UP) + "%");
        metrics.put("معدل_تكرار_العملاء", String.format("%.2f%%", repeatRate));
        metrics.put("معدل_دوران_المخزون", turnover);
        metrics.put("عدد_المنتجات_الراكدة", deadStockCount);
        metrics.put("متوسط_السلة", averageBasket);
        metrics.put("قيمة_المخزون", inventoryValue.setScale(2, RoundingMode.HALF_UP));
        return metrics;
    }
}
