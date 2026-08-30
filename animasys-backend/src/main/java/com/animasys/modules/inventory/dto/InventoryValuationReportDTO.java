package com.animasys.modules.inventory.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class InventoryValuationReportDTO {
    private String tenantId;
    private BigDecimal totalValuation;
    private int totalActiveBatches;
    private int totalQuantityInStock;
    private Instant generatedAt;
    private List<BatchValuationSummary> batchSummaries;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class BatchValuationSummary {
        private String batchId;
        private String batchNumber;
        private String productVariantId;
        private String productVariantName;
        private int remainingQuantity;
        private BigDecimal unitCost;
        private BigDecimal totalCostValue;
        private Instant purchaseDate;
    }
}
