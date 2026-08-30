package com.animasys.modules.inventory.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class StockCountRequest {
    @NotBlank
    private String variantId;

    @NotBlank
    private String warehouseId;

    @NotNull
    @Min(0)
    private Integer countedQuantity;

    private String reason;
}
