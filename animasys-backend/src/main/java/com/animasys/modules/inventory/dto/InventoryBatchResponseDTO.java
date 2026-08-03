package com.animasys.modules.inventory.dto;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

@Data
@Builder
public class InventoryBatchResponseDTO {
    private String id;
    private String productVariantId;
    private String batchNumber;
    private LocalDate expiryDate;
    /** Remaining units in this cost layer */
    private int quantity;
    private int initialQuantity;
    private BigDecimal unitCost;
    private Instant purchaseDate;
    private String status;
    private String purchaseInvoiceId;
    private String supplierId;
}
