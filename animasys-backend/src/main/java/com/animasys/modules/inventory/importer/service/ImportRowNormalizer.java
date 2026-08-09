package com.animasys.modules.inventory.importer.service;

import org.apache.poi.ss.usermodel.DateUtil;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Map;
import java.util.Set;

/**
 * Cleans a mapped row into the canonical shape the validator and the commit stage expect,
 * before either of them sees it.
 *
 * <p>Spreadsheets in the wild carry the same value in a dozen shapes: Arabic-Indic digits,
 * a currency suffix, a thousands separator, a decimal comma, an Excel date serial. Rejecting
 * those rows as "not a number" was the single biggest source of failed imports, and none of
 * them are actually ambiguous.</p>
 */
@Component
public class ImportRowNormalizer {

    private static final Set<ImportField> NUMERIC_FIELDS = EnumSet.of(
            ImportField.QUANTITY, ImportField.COST_PRICE, ImportField.SELLING_PRICE, ImportField.MINIMUM_STOCK);
    /** Excel serial-date range covering 1954-01-01 .. 2073-01-01 — a plausible expiry date. */
    private static final int MIN_EXCEL_SERIAL = 19_723;
    private static final int MAX_EXCEL_SERIAL = 63_150;

    public Map<ImportField, String> normalize(Map<ImportField, String> row) {
        Map<ImportField, String> cleaned = new EnumMap<>(ImportField.class);
        row.forEach((field, value) -> cleaned.put(field, value == null ? "" : value.trim()));

        for (ImportField field : NUMERIC_FIELDS) {
            String raw = cleaned.get(field);
            if (raw != null && !raw.isEmpty()) {
                cleaned.put(field, cleanNumber(raw));
            }
        }

        String expiry = cleaned.get(ImportField.EXPIRY_DATE);
        if (expiry != null && !expiry.isEmpty()) {
            cleaned.put(ImportField.EXPIRY_DATE, cleanDate(expiry));
        }

        // Identifiers only ever come back as text; strip the formula guard the parser added.
        for (ImportField field : EnumSet.of(ImportField.BARCODE, ImportField.SKU, ImportField.BATCH_NUMBER)) {
            String raw = cleaned.get(field);
            if (raw != null && raw.startsWith("'")) {
                cleaned.put(field, raw.substring(1).trim());
            }
        }

        // A nameless row is not importable, but the name is nearly always sitting in another
        // column — a variant label, or failing that the code the row is identified by.
        if (isBlank(cleaned.get(ImportField.PRODUCT_NAME))) {
            String fallback = firstNonBlank(cleaned, ImportField.VARIANT, ImportField.SKU, ImportField.BARCODE);
            if (fallback != null) {
                cleaned.put(ImportField.PRODUCT_NAME, fallback);
            }
        }
        return cleaned;
    }

    /**
     * Turns any human-written number into something {@link java.math.BigDecimal} accepts:
     * "١٢٣٫٥٠ ج.م" -> "123.50", "1,250" -> "1250", "12,5" -> "12.5", "'-3" -> "-3".
     * Returns the input untouched when nothing numeric can be found, so the validator
     * still reports it as a real data error rather than silently importing a zero.
     */
    static String cleanNumber(String raw) {
        String s = HeaderNormalizer.toLatinDigits(raw)
                .replace(" ", " ")     // non-breaking space
                .replace("٫", ".")     // Arabic decimal separator
                .replace("٬", "")      // Arabic thousands separator
                .trim();
        if (s.startsWith("'")) {
            s = s.substring(1).trim();
        }
        boolean negative = s.startsWith("-") || (s.startsWith("(") && s.endsWith(")"));

        StringBuilder digits = new StringBuilder();
        for (char c : s.toCharArray()) {
            if (Character.isDigit(c) || c == '.' || c == ',') {
                digits.append(c);
            }
        }
        String value = digits.toString();
        if (value.isEmpty()) {
            return raw;
        }

        int lastComma = value.lastIndexOf(',');
        int lastDot = value.lastIndexOf('.');
        if (lastComma >= 0 && lastDot >= 0) {
            // Whichever comes last is the decimal separator; the other groups thousands.
            value = lastComma > lastDot
                    ? value.replace(".", "").replace(',', '.')
                    : value.replace(",", "");
        } else if (lastComma >= 0) {
            // A single comma is a decimal separator unless it groups exactly three digits.
            boolean groupsThousands = value.length() - lastComma == 4 && value.indexOf(',') == lastComma;
            value = groupsThousands ? value.replace(",", "") : value.replace(',', '.');
        }
        value = collapseExtraDots(value);
        // A currency suffix such as "ج.م" contributes a stray dot that BigDecimal rejects.
        while (value.endsWith(".")) {
            value = value.substring(0, value.length() - 1);
        }
        if (value.startsWith(".")) {
            value = "0" + value;
        }
        if (value.isEmpty()) {
            return raw;
        }
        return negative ? "-" + value : value;
    }

    /** "1.234.567" style grouping leaves several dots; only the last one can be decimal. */
    private static String collapseExtraDots(String value) {
        int lastDot = value.lastIndexOf('.');
        if (lastDot < 0 || value.indexOf('.') == lastDot) {
            return value;
        }
        return value.substring(0, lastDot).replace(".", "") + value.substring(lastDot);
    }

    /**
     * Dates read out of an unformatted numeric cell arrive as an Excel serial number
     * ("46023"); anything else is left for {@link ImportRowValidator#parseDate}.
     */
    static String cleanDate(String raw) {
        String s = HeaderNormalizer.toLatinDigits(raw).trim();
        if (s.chars().allMatch(Character::isDigit) && s.length() <= 5) {
            try {
                int serial = Integer.parseInt(s);
                if (serial >= MIN_EXCEL_SERIAL && serial <= MAX_EXCEL_SERIAL) {
                    LocalDate date = DateUtil.getLocalDateTime(serial).toLocalDate();
                    return date.toString();
                }
            } catch (NumberFormatException ignored) {
                // fall through to the raw value
            }
        }
        return s;
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private static String firstNonBlank(Map<ImportField, String> row, ImportField... fields) {
        for (ImportField field : fields) {
            String value = row.get(field);
            if (!isBlank(value)) {
                return value.startsWith("'") ? value.substring(1).trim() : value.trim();
            }
        }
        return null;
    }
}
