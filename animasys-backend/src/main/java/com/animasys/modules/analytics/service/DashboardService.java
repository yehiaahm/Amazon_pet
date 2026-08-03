package com.animasys.modules.analytics.service;

import com.animasys.modules.analytics.bre.BusinessRulesEngine;
import com.animasys.modules.analytics.repository.DashboardAnalyticsRepository;
import com.animasys.modules.analytics.repository.DashboardAnalyticsRepository.PeriodMetrics;
import com.animasys.modules.inventory.service.FifoCostingService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class DashboardService {

    private static final ZoneId ZONE = ZoneId.systemDefault();

    private final DashboardAnalyticsRepository analyticsRepository;
    private final FifoCostingService fifoCostingService;
    private final BusinessRulesEngine businessRulesEngine;

    public Map<String, Object> buildDashboardMetrics(String tenantId) {
        LocalDate today = LocalDate.now(ZONE);
        LocalDate yesterday = today.minusDays(1);
        LocalDate monthStart = today.withDayOfMonth(1);
        LocalDate prevMonthStart = monthStart.minusMonths(1);
        LocalDate prevMonthEnd = monthStart.minusDays(1);

        PeriodMetrics todayMetrics = analyticsRepository.aggregatePeriod(tenantId, today, today);
        PeriodMetrics yesterdayMetrics = analyticsRepository.aggregatePeriod(tenantId, yesterday, yesterday);
        PeriodMetrics monthMetrics = analyticsRepository.aggregatePeriod(tenantId, monthStart, today);
        PeriodMetrics prevMonthMetrics = analyticsRepository.aggregatePeriod(tenantId, prevMonthStart, prevMonthEnd);

        BigDecimal inventoryValue = fifoCostingService.calculateInventoryValuation(tenantId);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("todaySales", metricBlock(todayMetrics.revenue(), todayMetrics.saleCount(), yesterdayMetrics.revenue()));
        result.put("monthlySales", metricBlock(monthMetrics.revenue(), monthMetrics.saleCount(), prevMonthMetrics.revenue()));
        result.put("netProfit", amountBlock(monthMetrics.netProfit(), prevMonthMetrics.netProfit()));
        result.put("expenses", amountBlock(monthMetrics.expenses(), prevMonthMetrics.expenses()));
        result.put("purchases", amountBlock(monthMetrics.purchases(), prevMonthMetrics.purchases()));
        result.put("inventoryValue", inventoryValue.setScale(2, RoundingMode.HALF_UP));
        result.put("grossMargin", monthMetrics.grossMargin().setScale(2, RoundingMode.HALF_UP));
        result.put("cogs", monthMetrics.cogs().setScale(2, RoundingMode.HALF_UP));
        result.put("bestSellingProducts", analyticsRepository.topProducts(tenantId, monthStart, today, 5));
        result.put("topCustomers", analyticsRepository.topCustomers(tenantId, monthStart, today, 5));
        result.put("topSuppliers", analyticsRepository.topSuppliers(tenantId, monthStart, today, 5));
        result.put("alerts", businessRulesEngine.evaluateBusinessRules());
        result.put("monthlyChart", analyticsRepository.monthlyChart(tenantId, 6));
        return result;
    }

    private Map<String, Object> metricBlock(BigDecimal current, long count, BigDecimal previous) {
        Map<String, Object> block = new LinkedHashMap<>();
        block.put("revenue", current.setScale(2, RoundingMode.HALF_UP));
        block.put("count", count);
        block.put("previousRevenue", previous.setScale(2, RoundingMode.HALF_UP));
        block.put("trendPct", trendPct(current, previous));
        return block;
    }

    private Map<String, Object> amountBlock(BigDecimal current, BigDecimal previous) {
        Map<String, Object> block = new LinkedHashMap<>();
        block.put("amount", current.setScale(2, RoundingMode.HALF_UP));
        block.put("previousAmount", previous.setScale(2, RoundingMode.HALF_UP));
        block.put("trendPct", trendPct(current, previous));
        return block;
    }

    private double trendPct(BigDecimal current, BigDecimal previous) {
        if (previous.compareTo(BigDecimal.ZERO) == 0) {
            return current.compareTo(BigDecimal.ZERO) == 0 ? 0.0 : 100.0;
        }
        return current.subtract(previous)
                .divide(previous, 4, RoundingMode.HALF_UP)
                .multiply(BigDecimal.valueOf(100))
                .doubleValue();
    }
}
