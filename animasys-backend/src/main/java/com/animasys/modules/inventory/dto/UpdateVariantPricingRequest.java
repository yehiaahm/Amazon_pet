package com.animasys.modules.inventory.dto;

import lombok.Data;

import java.math.BigDecimal;

@Data
public class UpdateVariantPricingRequest {
    /** Selling price — null means leave unchanged. */
    private BigDecimal price;

    /** Cost — null means leave unchanged. */
    private BigDecimal cost;

    /** Wholesale price — null means leave unchanged. */
    private BigDecimal wholesalePrice;
}
