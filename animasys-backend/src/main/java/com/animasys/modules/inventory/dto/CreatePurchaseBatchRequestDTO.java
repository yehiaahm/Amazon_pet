package com.animasys.modules.inventory.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CreatePurchaseBatchRequestDTO {

    @NotBlank(message = "Warehouse ID is required")
    private String warehouseId;

    @NotBlank(message = "Product Variant ID is required")
    private String productVariantId;

    private String supplierId;

    private String purchaseInvoiceId;

    @NotBlank(message = "Batch number is required")
    private String batchNumber;

    @NotNull(message = "Unit cost is required")
    @Min(value = 0, message = "Unit cost must be non-negative")
    private BigDecimal unitCost;

    @Min(value = 1, message = "Quantity must be at least 1")
    private int quantity;

    private LocalDate expiryDate;
}
