package com.animasys.modules.sales.dto;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;

@Data
@Builder
public class SaleBatchAllocationViewDTO {
    private String saleItemId;
    private String productName;
    private String batchNumber;
    private String inventoryBatchId;
    private int quantityAllocated;
    private BigDecimal unitCostAtSale;
    private BigDecimal totalAllocatedCost;
}
