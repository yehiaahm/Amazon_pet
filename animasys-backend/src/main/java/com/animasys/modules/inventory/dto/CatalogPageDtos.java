package com.animasys.modules.inventory.dto;

import lombok.Builder;
import lombok.Value;

import java.math.BigDecimal;
import java.util.List;

public final class CatalogPageDtos {

    private CatalogPageDtos() {}

    @Value
    @Builder
    public static class CatalogSearchCriteria {
        int page;
        int size;
        String sort;
        String search;
        String category;
        String brand;
        String supplier;
        String status;
        String barcode;
        String sku;
        Boolean lowStock;

        public static final int DEFAULT_SIZE = 1000;
        public static final int MAX_SIZE = 5000;
    }

    @Value
    @Builder
    public static class CatalogVariantSummaryDTO {
        String variantId;
        String productId;
        String sku;
        String productName;
        String variantName;
        BigDecimal price;
        BigDecimal cost;
        BigDecimal wholesalePrice;
        int stockQuantity;
        int minStockLimit;
        int reorderLevel;
        String barcode;
        String barcodeFormat;
        Boolean barcodeGenerated;
        String barcodeSource;
        String barcodeStatus;
        String categoryId;
        String categoryName;
        String brandId;
        String brandName;
        String supplierId;
        String supplierName;
    }

    @Value
    @Builder
    public static class CatalogPageResponse {
        List<CatalogVariantSummaryDTO> content;
        long totalElements;
        int totalPages;
        int page;
        int size;
        String sort;
    }
}
