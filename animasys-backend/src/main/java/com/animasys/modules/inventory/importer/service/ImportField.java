package com.animasys.modules.inventory.importer.service;

import com.fasterxml.jackson.annotation.JsonValue;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * Canonical product-import fields with their known Arabic/English header aliases.
 * Used by {@link ColumnMappingEngine} to auto-map uploaded spreadsheet columns.
 *
 * <p>Aliases are matched after {@link HeaderNormalizer} folding, so there is no need to list
 * spelling variants that differ only by diacritics, alef/ya/ta-marbuta forms, letter case,
 * punctuation, or the Arabic definite article — those are all generated automatically.
 * Keep each alias unique across fields: an alias claimed by two fields makes the winner
 * depend on enum order.</p>
 */
public enum ImportField {
    BARCODE(false, "Barcode", "Bar Code", "الباركود", "باركود", "رقم الباركود", "كود الباركود",
            "EAN", "EAN13", "UPC", "GTIN"),
    // A row needs SKU *or* Barcode (enforced in ImportRowValidator), since real supplier
    // templates often only carry a barcode.
    SKU(false, "SKU", "SKU Code", "Product Code", "Code", "Item Code", "Item No", "Item Number", "Part Number",
            "كود الصنف", "كود المنتج", "كود الصنف (SKU)", "الكود", "كود", "رقم الصنف", "رقم المنتج"),
    PRODUCT_NAME(true, "اسم المنتج", "المنتج", "الاسم", "اسم", "البيان", "الوصف", "اسم السلعة",
            "Product", "Product Name", "Name", "Item Name", "Item", "Description"),
    BRAND(false, "الماركة", "العلامة التجارية", "الشركة", "الشركة المصنعة", "Brand", "Manufacturer"),
    CATEGORY(false, "الفئة", "القسم", "التصنيف", "النوع", "المجموعة", "Category", "Type", "Group", "Section", "Department"),
    VARIANT(false, "الحجم", "الوزن", "اللون", "المقاس", "الموديل", "المتغير", "اسم الصنف",
            "Variant", "Model", "Size", "Weight", "Color", "اسم الصنف / الوزن / الحجم"),
    // Not persisted anywhere in the current product/variant schema — collected for
    // display/reference only, so it's never required.
    UNIT(false, "الوحدة", "وحدة القياس", "Unit", "UOM", "Unit of Measure"),
    QUANTITY(false, "الكمية", "الكمية الحالية", "الكمية المتاحة", "الكمية المتوفرة", "المخزون", "العدد",
            "الرصيد", "الرصيد الحالي", "المتاح", "Stock", "Stock Qty", "Quantity", "Qty", "Count", "Balance", "On Hand"),
    COST_PRICE(false, "سعر التكلفة", "التكلفة", "سعر الشراء", "الشراء", "تكلفة الوحدة",
            "Cost", "Cost Price", "Unit Cost", "Purchase Price", "Buy Price"),
    SELLING_PRICE(false, "سعر البيع", "السعر", "سعر القطعة", "سعر الوحدة", "البيع",
            "Price", "Selling Price", "Sale Price", "Sell Price", "Retail Price", "Unit Price"),
    MINIMUM_STOCK(false, "حد الطلب الأدنى", "الحد الأدنى", "حد الطلب", "أقل كمية", "الحد الأدنى للمخزون",
            "Minimum Stock", "Min Stock", "Reorder Level"),
    WAREHOUSE(false, "المخزن", "الفرع", "المستودع", "الموقع", "Warehouse", "Branch", "Store", "Location", "المخزن / الفرع"),
    SUPPLIER(false, "المورد", "اسم المورد", "الشركة الموردة", "Supplier", "Vendor"),
    EXPIRY_DATE(false, "تاريخ الصلاحية", "تاريخ الانتهاء", "الصلاحية", "انتهاء الصلاحية",
            "Expiry", "Expiry Date", "Exp Date", "Expiration"),
    BATCH_NUMBER(false, "رقم الباتش", "الباتش", "التشغيلة", "رقم التشغيلة", "Batch", "Batch Number", "Batch No", "Lot", "Lot Number"),
    NOTES(false, "ملاحظات", "ملاحظة", "تعليق", "Notes", "Remarks", "Comment");

    /**
     * Fields the import cannot invent a sane value for. Everything else degrades to a
     * warning plus a default so a partially-recognized file still imports — see
     * {@link ImportRowValidator}.
     */
    private final boolean required;
    private final List<String> aliases;

    ImportField(boolean required, String... aliases) {
        this.required = required;
        this.aliases = List.of(aliases);
    }

    public boolean isRequired() {
        return required;
    }

    /** True for the columns that identify a product; a file needs at least one of them. */
    public boolean isIdentifier() {
        return this == SKU || this == BARCODE || this == PRODUCT_NAME;
    }

    /**
     * Aliases plus the field's own enum name/code, all pre-normalized for matching, each
     * also present in its definite-article-stripped form ("الكمية" -> "كميه").
     */
    public Set<String> normalizedAliases() {
        Set<String> normalized = new LinkedHashSet<>();
        java.util.stream.Stream.concat(aliases.stream(), List.of(name(), code()).stream())
                .map(HeaderNormalizer::normalize)
                .filter(a -> !a.isEmpty())
                .forEach(a -> {
                    normalized.add(a);
                    normalized.add(HeaderNormalizer.stripDefiniteArticle(a));
                });
        return normalized;
    }

    /** Wire-format code sent to/from the frontend, e.g. "PRODUCT_NAME" -> "productName". */
    @JsonValue
    public String code() {
        String[] parts = name().toLowerCase().split("_");
        StringBuilder sb = new StringBuilder(parts[0]);
        for (int i = 1; i < parts.length; i++) {
            sb.append(Character.toUpperCase(parts[i].charAt(0))).append(parts[i].substring(1));
        }
        return sb.toString();
    }

    public static ImportField fromCode(String code) {
        if (code == null) {
            return null;
        }
        String trimmed = code.trim();
        for (ImportField field : values()) {
            if (field.code().equalsIgnoreCase(trimmed) || field.name().equalsIgnoreCase(trimmed)) {
                return field;
            }
        }
        return null;
    }
}
