package com.animasys.modules.inventory.importer.service;

import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Map;

/**
 * Validates a single mapped row against the business rules.
 *
 * <p>The guiding rule: only reject what cannot be imported at all. A row with no identity
 * (no name, no code, no barcode) is an error; a row whose file simply has no cost column
 * is a warning with a zero default, because failing the row would block an import the user
 * can otherwise complete and correct afterwards. Warnings are shown per row in the preview
 * before anything is committed.</p>
 *
 * <p>Defaults are written back into the passed row so the commit stage persists exactly
 * what the preview showed.</p>
 */
@Component
public class ImportRowValidator {

    private static final List<DateTimeFormatter> DATE_FORMATS = List.of(
            DateTimeFormatter.ISO_LOCAL_DATE,
            DateTimeFormatter.ofPattern("dd/MM/yyyy"),
            DateTimeFormatter.ofPattern("dd-MM-yyyy"),
            DateTimeFormatter.ofPattern("dd.MM.yyyy"),
            DateTimeFormatter.ofPattern("yyyy/MM/dd"),
            DateTimeFormatter.ofPattern("d/M/yyyy"),
            DateTimeFormatter.ofPattern("M/d/yyyy")
    );

    public RowValidationResult validate(Map<ImportField, String> row, ImportValidationContext ctx) {
        RowValidationResult result = RowValidationResult.builder().build();

        boolean hasIdentifier = !text(row, ImportField.SKU).isEmpty() || !text(row, ImportField.BARCODE).isEmpty();
        boolean hasName = !text(row, ImportField.PRODUCT_NAME).isEmpty();
        if (!hasIdentifier && !hasName) {
            result.getErrors().add(ValidationIssue.of(ImportField.PRODUCT_NAME,
                    "الصف لا يحتوي على اسم منتج ولا SKU ولا باركود"));
        } else if (!hasIdentifier) {
            // ImportBatchExecutor derives a SKU for these; worth flagging, not worth failing.
            result.getWarnings().add(ValidationIssue.of(ImportField.SKU,
                    "لا يوجد SKU أو باركود — سيتم توليد كود تلقائي"));
        }

        BigDecimal quantity = optionalNonNegativeNumber(row, ImportField.QUANTITY, ctx, result);
        BigDecimal cost = optionalNonNegativeNumber(row, ImportField.COST_PRICE, ctx, result);
        BigDecimal sellingPrice = optionalNonNegativeNumber(row, ImportField.SELLING_PRICE, ctx, result);

        if (quantity != null && quantity.stripTrailingZeros().scale() > 0) {
            result.getWarnings().add(ValidationIssue.of(ImportField.QUANTITY,
                    "الكمية ليست رقمًا صحيحًا — سيتم تقريبها"));
        }
        if (cost != null && sellingPrice != null
                && sellingPrice.signum() > 0 && sellingPrice.compareTo(cost) < 0) {
            ValidationIssue issue = ValidationIssue.of(ImportField.SELLING_PRICE,
                    "سعر البيع أقل من سعر التكلفة");
            if (ctx.isPriceBelowCostIsWarningOnly()) {
                result.getWarnings().add(issue);
            } else {
                result.getErrors().add(issue);
            }
        }

        String expiry = text(row, ImportField.EXPIRY_DATE);
        if (!expiry.isEmpty()) {
            LocalDate expiryDate = parseDate(expiry);
            if (expiryDate == null) {
                // The date is only used to stamp the FIFO batch — dropping an unreadable one
                // costs a batch expiry, failing the row costs the whole product.
                result.getWarnings().add(ValidationIssue.of(ImportField.EXPIRY_DATE,
                        "تاريخ الصلاحية غير مفهوم وسيتم تجاهله: " + expiry));
                row.put(ImportField.EXPIRY_DATE, "");
            } else if (expiryDate.isBefore(LocalDate.now())) {
                result.getWarnings().add(ValidationIssue.of(ImportField.EXPIRY_DATE,
                        "المنتج منتهي الصلاحية: " + expiryDate));
            }
        }

        // Warning, not an error: the commit stage falls back to the default sales warehouse
        // for an unrecognized name, so rejecting the row here would block an import that
        // would otherwise succeed.
        String warehouse = text(row, ImportField.WAREHOUSE);
        if (!warehouse.isEmpty() && ctx.getExistingWarehouseNamesNormalized() != null
                && !ctx.getExistingWarehouseNamesNormalized().contains(HeaderNormalizer.normalize(warehouse))) {
            result.getWarnings().add(ValidationIssue.of(ImportField.WAREHOUSE,
                    "المخزن غير موجود: " + warehouse + " — سيتم استخدام المخزن الافتراضي"));
        }

        String supplier = text(row, ImportField.SUPPLIER);
        if (!supplier.isEmpty() && !ctx.isAutoCreateSupplier()
                && ctx.getExistingSupplierNamesNormalized() != null
                && !ctx.getExistingSupplierNamesNormalized().contains(HeaderNormalizer.normalize(supplier))) {
            result.getErrors().add(ValidationIssue.of(ImportField.SUPPLIER, "المورد غير موجود: " + supplier));
        }

        // Informational only — categories (like brands) are always auto-created on commit,
        // this just tells the user their sheet introduces a new one.
        String category = text(row, ImportField.CATEGORY);
        if (!category.isEmpty() && ctx.getExistingCategoryNamesNormalized() != null
                && !ctx.getExistingCategoryNamesNormalized().contains(HeaderNormalizer.normalize(category))) {
            result.getWarnings().add(ValidationIssue.of(ImportField.CATEGORY,
                    "فئة جديدة سيتم إنشاؤها: " + category));
        }

        return result;
    }

    public static LocalDate parseDate(String raw) {
        for (DateTimeFormatter fmt : DATE_FORMATS) {
            try {
                return LocalDate.parse(raw.trim(), fmt);
            } catch (DateTimeParseException ignored) {
                // try next format
            }
        }
        return null;
    }

    /**
     * A numeric field that the file may legitimately not carry. Missing column or empty
     * cell -> 0 with a warning; a value that is present but unreadable or negative is a
     * genuine data error and fails the row.
     */
    private BigDecimal optionalNonNegativeNumber(Map<ImportField, String> row, ImportField field,
                                                 ImportValidationContext ctx, RowValidationResult result) {
        String raw = text(row, field);
        if (raw.isEmpty()) {
            row.put(field, "0");
            result.getWarnings().add(ValidationIssue.of(field, ctx.isMapped(field)
                    ? fieldLabel(field) + " غير موجود في هذا الصف — تم اعتباره 0"
                    : fieldLabel(field) + " غير موجود في الملف — تم اعتباره 0"));
            return BigDecimal.ZERO;
        }
        try {
            BigDecimal value = new BigDecimal(raw);
            if (value.compareTo(BigDecimal.ZERO) < 0) {
                result.getErrors().add(ValidationIssue.of(field, fieldLabel(field) + " يجب ألا يكون سالبًا"));
                return null;
            }
            return value;
        } catch (NumberFormatException e) {
            result.getErrors().add(ValidationIssue.of(field, fieldLabel(field) + " يجب أن يكون رقمًا: " + raw));
            return null;
        }
    }

    private String text(Map<ImportField, String> row, ImportField field) {
        String v = row.get(field);
        return v == null ? "" : v.trim();
    }

    private String fieldLabel(ImportField field) {
        return switch (field) {
            case SKU -> "SKU";
            case PRODUCT_NAME -> "اسم المنتج";
            case UNIT -> "الوحدة";
            case QUANTITY -> "الكمية";
            case COST_PRICE -> "سعر التكلفة";
            case SELLING_PRICE -> "سعر البيع";
            case EXPIRY_DATE -> "تاريخ الصلاحية";
            case WAREHOUSE -> "المخزن";
            case SUPPLIER -> "المورد";
            default -> field.name();
        };
    }
}
