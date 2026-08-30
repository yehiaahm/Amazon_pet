package com.animasys.modules.inventory.importer.service;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class ColumnMappingEngineTest {

    private final ColumnMappingEngine engine = new ColumnMappingEngine();

    @Test
    void mapsArabicAndEnglishHeadersExactly() {
        List<ColumnMappingSuggestion> suggestions = engine.suggestMapping(
                List.of("الباركود", "SKU", "اسم المنتج", "الكمية", "سعر التكلفة", "سعر البيع", "الوحدة"));

        Map<String, ImportField> byHeader = new java.util.HashMap<>();
        suggestions.forEach(s -> byHeader.put(s.getHeader(), s.getField()));

        assertEquals(ImportField.BARCODE, byHeader.get("الباركود"));
        assertEquals(ImportField.SKU, byHeader.get("SKU"));
        assertEquals(ImportField.PRODUCT_NAME, byHeader.get("اسم المنتج"));
        assertEquals(ImportField.QUANTITY, byHeader.get("الكمية"));
        assertEquals(ImportField.COST_PRICE, byHeader.get("سعر التكلفة"));
        assertEquals(ImportField.SELLING_PRICE, byHeader.get("سعر البيع"));
        assertEquals(ImportField.UNIT, byHeader.get("الوحدة"));
        suggestions.forEach(s -> assertTrue(s.isAutoMapped(), "expected auto-mapped: " + s.getHeader()));
    }

    @Test
    void fuzzyMatchesMisspelledHeader() {
        List<ColumnMappingSuggestion> suggestions = engine.suggestMapping(List.of("Prodcut Name"));
        assertEquals(ImportField.PRODUCT_NAME, suggestions.get(0).getField());
    }

    @Test
    void leavesUnknownHeaderUnmapped() {
        List<ColumnMappingSuggestion> suggestions = engine.suggestMapping(List.of("Random Unrelated Column XYZ"));
        assertFalse(suggestions.get(0).isAutoMapped());
    }

    @Test
    void doesNotAssignTwoHeadersToSameFieldAutomatically() {
        // Both "Code" and "SKU" are SKU aliases; only the stronger match should stay auto-mapped.
        List<ColumnMappingSuggestion> suggestions = engine.suggestMapping(List.of("SKU", "Code"));
        long autoMappedToSku = suggestions.stream()
                .filter(s -> s.getField() == ImportField.SKU && s.isAutoMapped())
                .count();
        assertEquals(1, autoMappedToSku);
    }

    @Test
    void mapsEverydayHeaderWordingsThatAreNotTheOfficialTemplate() {
        // None of these are the supplier template's exact labels — they are how stock sheets
        // are actually written, and each one used to leave a required field unmapped, which
        // failed the upload outright. Checked one at a time: several are synonyms of the same
        // field, and only one header may claim a field per file.
        assertMapsTo(ImportField.PRODUCT_NAME, "الاسم", "الوصف", "البيان", "Item Name", "اسم السلعة");
        assertMapsTo(ImportField.QUANTITY, "الرصيد", "الكميه المتاحه", "العدد", "Qty", "Stock");
        assertMapsTo(ImportField.COST_PRICE, "سعر الشراء", "التكلفة", "Cost", "Purchase Price");
        assertMapsTo(ImportField.SELLING_PRICE, "السعر", "سعر القطعة", "Retail Price");
        assertMapsTo(ImportField.SKU, "كود", "الكود", "رقم الصنف", "Item Code");
        assertMapsTo(ImportField.WAREHOUSE, "المستودع", "الموقع", "Store");
        assertMapsTo(ImportField.CATEGORY, "النوع", "المجموعة", "Section");
        assertMapsTo(ImportField.BRAND, "الشركة", "Manufacturer");
        assertMapsTo(ImportField.SUPPLIER, "اسم المورد", "Vendor");
    }

    private void assertMapsTo(ImportField expected, String... headers) {
        for (String header : headers) {
            ColumnMappingSuggestion suggestion = engine.suggestMapping(List.of(header)).get(0);
            assertTrue(suggestion.isAutoMapped(), "expected auto-mapped: " + header);
            assertEquals(expected, suggestion.getField(), "wrong field for: " + header);
        }
    }

    @Test
    void matchesAWordInsideACompoundHeader() {
        Map<String, ImportField> byHeader = mappingOf("الكمية بالمخزن", "Selling Price (EGP)", "اسم المنتج بالعربي");

        assertEquals(ImportField.QUANTITY, byHeader.get("الكمية بالمخزن"));
        assertEquals(ImportField.SELLING_PRICE, byHeader.get("Selling Price (EGP)"));
        assertEquals(ImportField.PRODUCT_NAME, byHeader.get("اسم المنتج بالعربي"));
    }

    @Test
    void identifiesBarcodeAndNameFromTheDataWhenHeadersAreMeaningless() {
        // A file exported with generic headers: nothing to match on, but the values are
        // unambiguous — 13-digit numbers are barcodes, long unique text is the product name.
        List<String> headers = List.of("Field1", "Field2", "Field3");
        List<Map<String, String>> rows = List.of(
                row(headers, "6221031000019", "دراي فود قطط سالمون 400 جم", "12"),
                row(headers, "6221031000026", "رمل قطط متكتل 10 كجم", "7"),
                row(headers, "6221031000033", "لعبة كلاب مطاطية كبيرة", "20"));

        Map<String, ImportField> byHeader = new HashMap<>();
        engine.suggestMapping(headers, rows).stream().filter(ColumnMappingSuggestion::isAutoMapped)
                .forEach(s -> byHeader.put(s.getHeader(), s.getField()));

        assertEquals(ImportField.BARCODE, byHeader.get("Field1"));
        assertEquals(ImportField.PRODUCT_NAME, byHeader.get("Field2"));
    }

    @Test
    void valueInferenceNeverOverridesAHeaderMatch() {
        List<String> headers = List.of("الباركود", "اسم المنتج");
        List<Map<String, String>> rows = List.of(row(headers, "6221031000019", "دراي فود قطط سالمون"));

        engine.suggestMapping(headers, rows).forEach(s ->
                assertEquals(1.0, s.getConfidence(), "header aliases must win over value inference: " + s.getHeader()));
    }

    @Test
    void mapsRealSupplierTemplateHeaders() {
        // Verbatim header row from a real supplier .xlsx, including compound headers
        // ("المخزن / الفرع"), a parenthetical alias ("كود الصنف (SKU)"), a reworded
        // quantity header ("الكمية الحالية"), and trailing required-marker asterisks.
        List<ColumnMappingSuggestion> suggestions = engine.suggestMapping(List.of(
                "الباركود  *", "كود الصنف (SKU)", "اسم المنتج *", "الماركة", "الفئة",
                "اسم الصنف / الوزن / الحجم", "الوحدة", "الكمية الحالية  *", "سعر التكلفة",
                "سعر البيع", "حد الطلب الأدنى", "المخزن / الفرع", "المورد", "تاريخ الصلاحية",
                "رقم الباتش", "ملاحظات"));

        Map<String, ColumnMappingSuggestion> byHeader = new java.util.HashMap<>();
        suggestions.forEach(s -> byHeader.put(s.getHeader(), s));

        assertEquals(ImportField.BARCODE, byHeader.get("الباركود  *").getField());
        assertEquals(ImportField.SKU, byHeader.get("كود الصنف (SKU)").getField());
        assertEquals(ImportField.PRODUCT_NAME, byHeader.get("اسم المنتج *").getField());
        assertEquals(ImportField.QUANTITY, byHeader.get("الكمية الحالية  *").getField());
        assertEquals(ImportField.WAREHOUSE, byHeader.get("المخزن / الفرع").getField());
        assertEquals(ImportField.VARIANT, byHeader.get("اسم الصنف / الوزن / الحجم").getField());
        // Every header in this exact template is pinned as a tier-1 exact alias — this
        // must hold at full (1.0) confidence, not just clear the fuzzy/containment
        // auto-accept threshold, so behavior is deterministic across re-uploads.
        suggestions.forEach(s -> assertEquals(1.0, s.getConfidence(), "not an exact match: " + s.getHeader()));
        assertTrue(byHeader.get("الباركود  *").isAutoMapped());
        assertTrue(byHeader.get("كود الصنف (SKU)").isAutoMapped());
        assertTrue(byHeader.get("الكمية الحالية  *").isAutoMapped());
        assertTrue(byHeader.get("المخزن / الفرع").isAutoMapped());
    }

    private Map<String, ImportField> mappingOf(String... headers) {
        Map<String, ImportField> byHeader = new HashMap<>();
        engine.suggestMapping(List.of(headers)).stream()
                .filter(ColumnMappingSuggestion::isAutoMapped)
                .forEach(s -> byHeader.put(s.getHeader(), s.getField()));
        return byHeader;
    }

    private static Map<String, String> row(List<String> headers, String... values) {
        Map<String, String> row = new java.util.LinkedHashMap<>();
        for (int i = 0; i < headers.size(); i++) {
            row.put(headers.get(i), values[i]);
        }
        return row;
    }
}
