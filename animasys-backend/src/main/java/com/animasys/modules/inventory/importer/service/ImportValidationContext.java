package com.animasys.modules.inventory.importer.service;

import lombok.Builder;
import lombok.Data;

import java.util.Set;

/** Tenant-scoped reference data preloaded once per session to avoid per-row DB lookups. */
@Data
@Builder
public class ImportValidationContext {
    private Set<String> existingWarehouseNamesNormalized;
    private Set<String> existingSupplierNamesNormalized;
    private Set<String> existingCategoryNamesNormalized;
    /** Fields the uploaded file actually has a column for — everything else defaults with a warning. */
    private Set<ImportField> mappedFields;
    private boolean autoCreateSupplier;
    private boolean priceBelowCostIsWarningOnly; // true = warning, false = error

    public boolean isMapped(ImportField field) {
        return mappedFields != null && mappedFields.contains(field);
    }
}
