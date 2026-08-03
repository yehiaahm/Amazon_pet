package com.animasys.modules.sales.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SaleRefundFinancials {
    private BigDecimal refundAmount;
    private BigDecimal productRevenueReversed;
    private BigDecimal serviceRevenueReversed;
    private BigDecimal discountReversed;
    private BigDecimal taxReversed;
    private BigDecimal cogsReversed;
    private boolean fullRefund;
}
