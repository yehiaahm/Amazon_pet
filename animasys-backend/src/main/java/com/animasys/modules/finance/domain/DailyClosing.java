package com.animasys.modules.finance.domain;

import com.animasys.modules.iam.domain.Branch;
import com.animasys.modules.iam.domain.Employee;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(name = "daily_closings")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DailyClosing {
    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "branch_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnoreProperties({"hibernateLazyInitializer", "handler", "tenant"})
    private Branch branch;

    @Column(name = "cashbox_id", nullable = false)
    private String cashboxId;

    @Column(name = "opening_balance", nullable = false)
    private BigDecimal openingBalance;

    @Column(name = "closing_balance", nullable = false)
    private BigDecimal closingBalance;

    @Column(name = "system_expected", nullable = false)
    private BigDecimal systemExpected;

    @Column(name = "physical_actual", nullable = false)
    private BigDecimal physicalActual;

    @Column(nullable = false)
    private BigDecimal difference;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "closed_by_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnoreProperties({"hibernateLazyInitializer", "handler", "tenant", "branch", "passwordHash"})
    private Employee closedBy;

    @Column(nullable = false)
    private LocalDate date;

    @Column(name = "cash_sales_total")
    private BigDecimal cashSalesTotal;

    @Column(name = "card_sales_total")
    private BigDecimal cardSalesTotal;

    @Column(name = "instapay_sales_total")
    private BigDecimal instapaySalesTotal;

    @Column(name = "vodafone_sales_total")
    private BigDecimal vodafoneSalesTotal;

    @Column(name = "total_sales")
    private BigDecimal totalSales;

    @Column(name = "cash_expenses_total")
    private BigDecimal cashExpensesTotal;

    @Column(name = "delivery_orders_count")
    private Integer deliveryOrdersCount;

    @Column(name = "delivery_fees_total")
    private BigDecimal deliveryFeesTotal;
}
