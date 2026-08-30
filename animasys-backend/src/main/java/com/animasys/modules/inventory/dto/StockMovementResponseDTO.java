package com.animasys.modules.inventory.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StockMovementResponseDTO {
    private String id;
    private String warehouseId;
    private String productVariantId;
    private int quantity;
    private String type;
    private Instant timestamp;
    private String employeeId;
    private String detail;
}
