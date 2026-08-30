package com.animasys.modules.inventory.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class LowStockAlertDTO {
    private String productVariantId;
    private String productId;
    private String sku;
    private String productName;
    private String variantName;
    private int stockQuantity;
    private int minStockLimit;
    private int deficit;
    private BigDecimal cost;
    private BigDecimal price;
}
