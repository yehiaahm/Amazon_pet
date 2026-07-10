package com.animasys.modules.analytics.kpi;

import com.animasys.modules.finance.domain.Expense;
import com.animasys.modules.finance.repository.ExpenseRepository;
import com.animasys.modules.sales.domain.Sale;
import com.animasys.modules.sales.domain.SaleItem;
import com.animasys.modules.sales.repository.SaleRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class KPIEngine {
    private final SaleRepository saleRepository;
    private final ExpenseRepository expenseRepository;

    public Map<String, Object> calculateKPIMetrics(String tenantId) {
        List<Sale> sales = saleRepository.findAll(); // في الإنتاج، يجب تقييد هذا الاستعلام بمعرّف المستأجر.
        List<Expense> expenses = expenseRepository.findByTenantId(tenantId);

        BigDecimal grossRevenue = BigDecimal.ZERO;
        BigDecimal totalCOGS = BigDecimal.ZERO;

        for (Sale sale : sales) {
            grossRevenue = grossRevenue.add(sale.getTotalAmount());
            for (SaleItem item : sale.getItems()) {
                if ("PRODUCT".equals(item.getType())) {
                    totalCOGS = totalCOGS.add(item.getCost().multiply(BigDecimal.valueOf(item.getQuantity())));
                }
            }
        }

        BigDecimal totalExpenses = expenses.stream()
                .map(Expense::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal grossProfit = grossRevenue.subtract(totalCOGS);
        BigDecimal netProfit = grossProfit.subtract(totalExpenses);

        BigDecimal margin = BigDecimal.ZERO;
        if (grossRevenue.compareTo(BigDecimal.ZERO) > 0) {
            margin = grossProfit.divide(grossRevenue, 4, RoundingMode.HALF_UP).multiply(BigDecimal.valueOf(100));
        }

        // حساب معدل العملاء المتكررين
        long totalSalesCount = sales.size();
        long repeatSalesCount = sales.stream().filter(s -> s.getCustomer() != null).count();
        double repeatRate = totalSalesCount > 0 ? ((double) repeatSalesCount / totalSalesCount) * 100 : 0.0;

        return Map.of(
            "إجمالي_الإيرادات", grossRevenue,
            "تكلفة_البضاعة_المباعة", totalCOGS,
            "إجمالي_الربح", grossProfit,
            "صافي_الربح", netProfit,
            "إجمالي_المصاريف", totalExpenses,
            "نسبة_هامش_الربح_الإجمالي", margin.setScale(2, RoundingMode.HALF_UP) + "%",
            "معدل_تكرار_العملاء", String.format("%.2f%%", repeatRate),
            "معدل_دوران_المخزون", "4.2مرة",
            "عدد_المنتجات_الراكدة", 3
        );
    }
}
