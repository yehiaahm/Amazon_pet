package com.animasys.modules.inventory.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class TransferStockRequest {
    @NotBlank
    private String variantId;

    @NotBlank
    private String sourceWarehouseId;

    @NotBlank
    private String targetWarehouseId;

    @NotNull
    private Integer quantity;

    @NotBlank
    private String employeeId;
}
