package com.animasys.modules.sales.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SaleItemSummaryDTO {
    private String id;
    private String type;
    private String itemId;
    private String name;
    private int quantity;
    private BigDecimal price;
    private BigDecimal listPrice;
    private BigDecimal cost;
    private BigDecimal cogs;
    private BigDecimal unitCogs;
    private int quantityReturned;
    private BigDecimal grossProfit;
}
