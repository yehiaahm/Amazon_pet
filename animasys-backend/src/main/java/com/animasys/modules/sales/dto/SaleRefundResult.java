package com.animasys.modules.sales.dto;

import com.animasys.modules.sales.domain.Sale;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SaleRefundResult {
    private Sale sale;
    private BigDecimal refundAmount;
    private BigDecimal cogsReversed;
    private boolean fullRefund;

    @Builder.Default
    private List<SaleRefundLineRequest> linesProcessed = new ArrayList<>();

    /** How much of this refund goes back to each original tender (cash/card/...). */
    @Builder.Default
    private List<SalePaymentSummaryDTO> refundBreakdown = new ArrayList<>();
}
