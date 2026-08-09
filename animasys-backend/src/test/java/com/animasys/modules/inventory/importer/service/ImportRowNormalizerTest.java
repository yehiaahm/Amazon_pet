package com.animasys.modules.inventory.importer.service;

import org.junit.jupiter.api.Test;

import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class ImportRowNormalizerTest {

    private final ImportRowNormalizer normalizer = new ImportRowNormalizer();
    private final ImportRowValidator validator = new ImportRowValidator();

    @Test
    void readsNumbersHoweverTheySpreadsheetWroteThem() {
        assertEquals("1250", ImportRowNormalizer.cleanNumber("1,250"));
        assertEquals("1250.75", ImportRowNormalizer.cleanNumber("1,250.75"));
        assertEquals("12.5", ImportRowNormalizer.cleanNumber("12,5"));
        assertEquals("1250.75", ImportRowNormalizer.cleanNumber("1.250,75"));
        assertEquals("85", ImportRowNormalizer.cleanNumber("85 ج.م"));
        assertEquals("123.5", ImportRowNormalizer.cleanNumber("١٢٣٫٥"));
        assertEquals("-3", ImportRowNormalizer.cleanNumber("'-3"));
        assertEquals("70", ImportRowNormalizer.cleanNumber(" 70 EGP "));
    }

    @Test
    void leavesUnreadableValuesAloneSoTheyAreReportedNotSilentlyZeroed() {
        assertEquals("غير محدد", ImportRowNormalizer.cleanNumber("غير محدد"));
    }

    @Test
    void convertsExcelSerialDatesAndArabicDigits() {
        assertEquals("2026-01-01", ImportRowNormalizer.cleanDate("46023"));
        assertEquals("2027-01-31", ImportRowNormalizer.cleanDate("٢٠٢٧-٠١-٣١"));
    }

    @Test
    void fillsAMissingProductNameFromTheNextBestColumn() {
        Map<ImportField, String> row = row(Map.of(
                ImportField.PRODUCT_NAME, "",
                ImportField.VARIANT, "دراي فود 400 جم",
                ImportField.BARCODE, "6221031000019"));

        assertEquals("دراي فود 400 جم", normalizer.normalize(row).get(ImportField.PRODUCT_NAME));
    }

    @Test
    void missingPriceColumnWarnsAndDefaultsInsteadOfFailingTheRow() {
        // The old behavior rejected every row of a file without a cost column, which is
        // exactly what a barcode+name+price supplier list looks like.
        Map<ImportField, String> row = normalizer.normalize(row(Map.of(
                ImportField.BARCODE, "6221031000019",
                ImportField.PRODUCT_NAME, "دراي فود قطط",
                ImportField.SELLING_PRICE, "95")));

        RowValidationResult result = validator.validate(row, context(ImportField.BARCODE,
                ImportField.PRODUCT_NAME, ImportField.SELLING_PRICE));

        assertFalse(result.hasErrors(), "a missing cost column must not fail the row");
        assertEquals("0", row.get(ImportField.COST_PRICE));
        assertTrue(result.getWarnings().stream().anyMatch(w -> w.getMessage().contains("سعر التكلفة")));
    }

    @Test
    void rowWithNoIdentityAtAllStillFails() {
        Map<ImportField, String> row = normalizer.normalize(row(Map.of(ImportField.QUANTITY, "5")));
        RowValidationResult result = validator.validate(row, context(ImportField.QUANTITY));

        assertTrue(result.hasErrors());
    }

    @Test
    void unreadableNumberIsAnErrorNotADefault() {
        Map<ImportField, String> row = normalizer.normalize(row(Map.of(
                ImportField.SKU, "SKU-1",
                ImportField.PRODUCT_NAME, "رمل قطط",
                ImportField.QUANTITY, "غير معروف")));

        RowValidationResult result = validator.validate(row, context(ImportField.SKU,
                ImportField.PRODUCT_NAME, ImportField.QUANTITY));

        assertTrue(result.hasErrors());
    }

    private static Map<ImportField, String> row(Map<ImportField, String> values) {
        Map<ImportField, String> row = new EnumMap<>(ImportField.class);
        row.putAll(values);
        return row;
    }

    private static ImportValidationContext context(ImportField... mapped) {
        return ImportValidationContext.builder()
                .mappedFields(EnumSet.copyOf(java.util.List.of(mapped)))
                .existingWarehouseNamesNormalized(java.util.Set.of())
                .existingSupplierNamesNormalized(java.util.Set.of())
                .autoCreateSupplier(true)
                .priceBelowCostIsWarningOnly(true)
                .build();
    }
}
