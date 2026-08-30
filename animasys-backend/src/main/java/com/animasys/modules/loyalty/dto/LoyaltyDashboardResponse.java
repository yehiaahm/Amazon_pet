package com.animasys.modules.loyalty.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class LoyaltyDashboardResponse {

    /** Sum of every customer's current balance — what the business would owe if all points were redeemed today. */
    private BigDecimal totalOutstandingLiability;

    /** All-time value credited to customers via checkout earning. */
    private BigDecimal totalEarned;

    /** All-time value actually redeemed at checkout — the real cost already paid out as discounts. */
    private BigDecimal totalRedeemed;

    /** All-time earned value that expired unused, before it ever became a cost. */
    private BigDecimal totalExpired;

    /** Net effect of return reversals (earn/redeem undone by refunds); can be positive or negative. */
    private BigDecimal totalReturnReversals;

    /** Net effect of manual staff adjustments; can be positive or negative. */
    private BigDecimal totalManualAdjustments;

    /** Customers currently holding a positive balance. */
    private long activeCustomersCount;

    private List<CustomerBalance> customers;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CustomerBalance {
        private String customerId;
        private String name;
        private String phone;
        private BigDecimal balance;
    }
}
