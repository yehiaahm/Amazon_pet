package com.animasys.modules.inventory.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class AdjustStockRequest {
    @NotBlank
    private String variantId;

    @NotBlank
    private String warehouseId;

    @NotNull
    private Integer diff;

    @NotBlank
    private String type; // ADJUSTMENT, PURCHASE, etc.

    @NotBlank
    private String employeeId;
}
