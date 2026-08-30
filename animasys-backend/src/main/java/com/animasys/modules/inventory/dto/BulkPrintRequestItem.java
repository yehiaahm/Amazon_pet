package com.animasys.modules.inventory.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class BulkPrintRequestItem {
    @NotBlank(message = "variantId must not be blank")
    private String variantId;

    // quantity is optional: null means use default (1), positive values are valid
    @Max(value = 200, message = "quantity must not exceed 200")
    private Integer quantity;

    private Boolean useStockQuantity;
}
