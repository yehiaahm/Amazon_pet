package com.animasys.modules.inventory.importer.service;

import org.junit.jupiter.api.Test;

import java.util.EnumMap;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

class ImportRowValidatorTest {

    private final ImportRowValidator validator = new ImportRowValidator();

    private ImportValidationContext ctx() {
        return ImportValidationContext.builder()
                .existingWarehouseNamesNormalized(Set.of())
                .existingSupplierNamesNormalized(Set.of())
                .autoCreateSupplier(true)
                .priceBelowCostIsWarningOnly(true)
                .build();
    }

    @Test
    void acceptsRowWithBarcodeOnlyAndNoSku() {
        // Real supplier templates commonly leave SKU blank and only carry a barcode.
        Map<ImportField, String> row = new EnumMap<>(ImportField.class);
        row.put(ImportField.BARCODE, "8681470000123");
        row.put(ImportField.PRODUCT_NAME, "Best Pet Salmon Cat Wet 400g");
        row.put(ImportField.QUANTITY, "19");
        row.put(ImportField.COST_PRICE, "70");
        row.put(ImportField.SELLING_PRICE, "85");

        RowValidationResult result = validator.validate(row, ctx());

        assertFalse(result.hasErrors(), "expected no errors: " + result.getErrors());
    }

    @Test
    void acceptsRowWithNeitherSkuNorBarcodeButWarnsAboutTheGeneratedCode() {
        // Name-only price lists are a real format; the commit stage generates a code for
        // them and duplicate detection still matches on name+variant, so rejecting the row
        // would block an import that works.
        Map<ImportField, String> row = new EnumMap<>(ImportField.class);
        row.put(ImportField.PRODUCT_NAME, "Some Product");
        row.put(ImportField.QUANTITY, "5");
        row.put(ImportField.COST_PRICE, "10");
        row.put(ImportField.SELLING_PRICE, "15");

        RowValidationResult result = validator.validate(row, ctx());

        assertFalse(result.hasErrors(), "expected no errors: " + result.getErrors());
        assertTrue(result.getWarnings().stream().anyMatch(w -> w.getMessage().contains("كود تلقائي")));
    }

    @Test
    void rejectsRowWithNoIdentityAtAll() {
        Map<ImportField, String> row = new EnumMap<>(ImportField.class);
        row.put(ImportField.QUANTITY, "5");
        row.put(ImportField.COST_PRICE, "10");
        row.put(ImportField.SELLING_PRICE, "15");

        RowValidationResult result = validator.validate(row, ctx());

        assertTrue(result.hasErrors());
    }

    @Test
    void warnsButDoesNotRejectUnknownWarehouse() {
        Map<ImportField, String> row = new EnumMap<>(ImportField.class);
        row.put(ImportField.SKU, "SKU-1");
        row.put(ImportField.PRODUCT_NAME, "Some Product");
        row.put(ImportField.QUANTITY, "5");
        row.put(ImportField.COST_PRICE, "10");
        row.put(ImportField.SELLING_PRICE, "15");
        row.put(ImportField.WAREHOUSE, "فرع المعادي");

        RowValidationResult result = validator.validate(row, ctx());

        assertFalse(result.hasErrors(), "expected no errors: " + result.getErrors());
        assertEquals(1, result.getWarnings().size());
    }

    @Test
    void doesNotRequireUnit() {
        Map<ImportField, String> row = new EnumMap<>(ImportField.class);
        row.put(ImportField.SKU, "SKU-1");
        row.put(ImportField.PRODUCT_NAME, "Some Product");
        row.put(ImportField.QUANTITY, "5");
        row.put(ImportField.COST_PRICE, "10");
        row.put(ImportField.SELLING_PRICE, "15");

        RowValidationResult result = validator.validate(row, ctx());

        assertFalse(result.hasErrors(), "expected no errors: " + result.getErrors());
    }
}
