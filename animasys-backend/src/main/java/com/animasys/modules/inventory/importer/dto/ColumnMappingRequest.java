package com.animasys.modules.inventory.importer.dto;

import lombok.Data;

import java.util.Map;

@Data
public class ColumnMappingRequest {
    /** Raw header text -> ImportField wire code (e.g. "SKU", "productName"). Null/omitted = unmapped. */
    private Map<String, String> mapping;
    private boolean autoCreateSupplier;
    private boolean priceBelowCostIsWarningOnly = true;
}
