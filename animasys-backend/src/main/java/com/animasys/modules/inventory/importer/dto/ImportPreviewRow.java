package com.animasys.modules.inventory.importer.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ImportPreviewRow {
    private String itemId;
    private int rowNumber;
    private String status;
    private String barcode;
    private String sku;
    private String productName;
    private String brand;
    private String category;
    private String variant;
    private String unit;
    private String quantity;
    private String costPrice;
    private String sellingPrice;
    private String warehouse;
    private String supplier;
    private String expiryDate;
    private String batchNumber;
    private String duplicateMatchType;
    private String resolution;
    private List<String> errors;
    private List<String> warnings;
}
