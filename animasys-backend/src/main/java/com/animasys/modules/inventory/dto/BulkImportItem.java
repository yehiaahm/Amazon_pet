package com.animasys.modules.inventory.dto;

import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDate;

@Data
public class BulkImportItem {
    private String sku;
    private String productName;
    private String variantName;
    private BigDecimal cost;
    private BigDecimal price;
    private Integer stock;
    private String categoryName;
    private Integer minStockLimit;
    private String brand;
    private String supplier;
    private String imageUrl;
    /** Optional — used for FEFO batch layers on import. */
    private LocalDate expiryDate;
}
