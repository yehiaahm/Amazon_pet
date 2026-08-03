package com.animasys.modules.analytics.kpi;

import com.animasys.modules.analytics.repository.DashboardAnalyticsRepository;
import com.animasys.modules.analytics.repository.DashboardAnalyticsRepository.KpiSalesMetrics;
import com.animasys.modules.inventory.service.FifoCostingService;
import lombok.RequiredArgsConstructor;
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
