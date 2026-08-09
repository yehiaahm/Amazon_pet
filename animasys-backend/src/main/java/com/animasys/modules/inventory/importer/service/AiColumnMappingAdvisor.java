package com.animasys.modules.inventory.importer.service;

import com.animasys.modules.ai.config.AiProperties;
import com.animasys.modules.ai.service.AiService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.*;

/**
 * Falls back to the configured AI provider for columns that neither the alias table nor
 * the value heuristics could resolve — a supplier sheet labeled in a dialect, an English
 * abbreviation nobody anticipated, a column whose meaning only its sample data reveals.
 *
 * <p>Strictly best-effort: it runs only when something is genuinely unresolved, never blocks
 * the upload, and swallows every provider failure. A wrong suggestion is still shown to the
 * user as a low-confidence mapping they can override before any data is written.</p>
 */
@Component
@RequiredArgsConstructor
public class AiColumnMappingAdvisor {

    private static final Logger log = LoggerFactory.getLogger(AiColumnMappingAdvisor.class);

    /** Confidence reported for an AI-proposed column — deliberately below a header alias match. */
    static final double AI_CONFIDENCE = 0.8;
    private static final int MAX_HEADERS = 40;
    private static final int MAX_SAMPLE_ROWS = 3;
    private static final int MAX_SAMPLE_VALUE_LENGTH = 40;

    private final AiService aiService;
    private final AiProperties aiProperties;
    private final ObjectMapper objectMapper;

    public boolean isAvailable() {
        return aiProperties.hasApiKey() || aiProperties.isMockEnabled();
    }

    /**
     * Applies AI suggestions in place to the still-unmapped entries of {@code suggestions}.
     *
     * @return true if at least one column was newly mapped.
     */
    public boolean advise(List<ColumnMappingSuggestion> suggestions, List<Map<String, String>> sampleRows) {
        if (!isAvailable()) {
            return false;
        }
        List<ColumnMappingSuggestion> unresolved = suggestions.stream()
                .filter(s -> !s.isAutoMapped())
                .limit(MAX_HEADERS)
                .toList();
        if (unresolved.isEmpty()) {
            return false;
        }
        Set<ImportField> taken = EnumSet.noneOf(ImportField.class);
        suggestions.stream().filter(ColumnMappingSuggestion::isAutoMapped)
                .map(ColumnMappingSuggestion::getField).filter(Objects::nonNull).forEach(taken::add);

        Map<String, ImportField> proposed;
        try {
            String raw = aiService.mapImportColumns(buildPrompt(unresolved, sampleRows, taken));
            proposed = parse(raw, unresolved.stream().map(ColumnMappingSuggestion::getHeader).toList());
        } catch (Exception e) {
            log.warn("AI column mapping unavailable, falling back to manual mapping: {}", e.getMessage());
            return false;
        }

        boolean changed = false;
        for (ColumnMappingSuggestion suggestion : unresolved) {
            ImportField field = proposed.get(suggestion.getHeader());
            if (field == null || taken.contains(field)) {
                continue;
            }
            suggestion.setField(field);
            suggestion.setConfidence(AI_CONFIDENCE);
            suggestion.setAutoMapped(true);
            suggestion.setSource(ColumnMappingSuggestion.Source.AI);
            taken.add(field);
            changed = true;
        }
        return changed;
    }

    private String buildPrompt(List<ColumnMappingSuggestion> unresolved, List<Map<String, String>> sampleRows,
                               Set<ImportField> taken) {
        StringBuilder prompt = new StringBuilder();
        prompt.append("You are mapping the columns of a product/inventory spreadsheet (Arabic or English) ")
                .append("to the fixed fields of an ERP import.\n\n")
                .append("Allowed field codes:\n");
        for (ImportField field : ImportField.values()) {
            prompt.append("- ").append(field.code()).append(": ").append(String.join(" / ", describe(field))).append('\n');
        }
        if (!taken.isEmpty()) {
            prompt.append("\nAlready resolved (do NOT reuse these field codes): ");
            prompt.append(taken.stream().map(ImportField::code).sorted().reduce((a, b) -> a + ", " + b).orElse(""));
            prompt.append('\n');
        }

        prompt.append("\nActual Excel headers: [")
                .append(unresolved.stream().map(ColumnMappingSuggestion::getHeader)
                        .reduce((a, b) -> a + ", " + b).orElse(""))
                .append("]\n\nUnmapped columns with sample values:\n");
        List<Map<String, String>> sample = sampleRows == null ? List.of()
                : sampleRows.subList(0, Math.min(sampleRows.size(), MAX_SAMPLE_ROWS));
        for (ColumnMappingSuggestion suggestion : unresolved) {
            prompt.append("- \"").append(suggestion.getHeader()).append("\": ");
            List<String> values = new ArrayList<>();
            for (Map<String, String> row : sample) {
                String value = row.get(suggestion.getHeader());
                if (value != null && !value.isBlank()) {
                    values.add(value.length() > MAX_SAMPLE_VALUE_LENGTH
                            ? value.substring(0, MAX_SAMPLE_VALUE_LENGTH) + "…" : value);
                }
            }
            prompt.append(values.isEmpty() ? "(empty)" : String.join(" | ", values)).append('\n');
        }

        prompt.append("\nRespond with ONLY a JSON object whose keys are the exact header strings above ")
                .append("and whose values are one allowed field code, or \"\" when the column has no ")
                .append("equivalent. Never assign the same field code twice. No explanation, no markdown.");
        return prompt.toString();
    }

    private List<String> describe(ImportField field) {
        return switch (field) {
            case BARCODE -> List.of("product barcode", "EAN/UPC", "الباركود");
            case SKU -> List.of("internal item code", "كود الصنف");
            case PRODUCT_NAME -> List.of("product name/description", "اسم المنتج");
            case BRAND -> List.of("brand or manufacturer", "الماركة");
            case CATEGORY -> List.of("category/section", "الفئة");
            case VARIANT -> List.of("variant: size/weight/color", "الحجم أو الوزن");
            case UNIT -> List.of("unit of measure", "الوحدة");
            case QUANTITY -> List.of("stock quantity on hand", "الكمية");
            case COST_PRICE -> List.of("purchase/cost price", "سعر التكلفة");
            case SELLING_PRICE -> List.of("selling/retail price", "سعر البيع");
            case MINIMUM_STOCK -> List.of("reorder level", "حد الطلب الأدنى");
            case WAREHOUSE -> List.of("warehouse/branch/location", "المخزن");
            case SUPPLIER -> List.of("supplier/vendor", "المورد");
            case EXPIRY_DATE -> List.of("expiry date", "تاريخ الصلاحية");
            case BATCH_NUMBER -> List.of("batch/lot number", "رقم الباتش");
            case NOTES -> List.of("free-text notes", "ملاحظات");
        };
    }

    /**
     * Accepts either direction the provider might answer in — {@code {header: fieldCode}} or
     * the legacy {@code {"mapping": {fieldCode: header}}} shape — and ignores anything that
     * isn't a header we actually asked about.
     */
    private Map<String, ImportField> parse(String raw, List<String> askedHeaders) {
        Map<String, ImportField> result = new LinkedHashMap<>();
        Map<String, String> flat = readObject(raw);
        if (flat.isEmpty()) {
            return result;
        }
        Set<String> headerSet = new HashSet<>(askedHeaders);

        flat.forEach((key, value) -> {
            if (key == null || value == null || value.isBlank()) {
                return;
            }
            ImportField fieldFromValue = ImportField.fromCode(value);
            if (fieldFromValue != null && headerSet.contains(key)) {
                result.put(key, fieldFromValue);
                return;
            }
            // Reversed shape: the key is the field code and the value names the column.
            ImportField fieldFromKey = ImportField.fromCode(key);
            if (fieldFromKey != null && headerSet.contains(value)) {
                result.put(value, fieldFromKey);
            }
        });
        return result;
    }

    private Map<String, String> readObject(String raw) {
        if (raw == null) {
            return Map.of();
        }
        int start = raw.indexOf('{');
        int end = raw.lastIndexOf('}');
        if (start < 0 || end <= start) {
            return Map.of();
        }
        try {
            Map<String, Object> parsed = objectMapper.readValue(raw.substring(start, end + 1),
                    new TypeReference<Map<String, Object>>() {
                    });
            Map<String, Object> entries = new LinkedHashMap<>();
            if (parsed.get("mapping") instanceof Map<?, ?> nestedMap) {
                nestedMap.forEach((k, v) -> entries.put(String.valueOf(k), v));
            } else {
                entries.putAll(parsed);
            }
            Map<String, String> flat = new LinkedHashMap<>();
            entries.forEach((k, v) -> {
                if (v instanceof String s) {
                    flat.put(k, s);
                }
            });
            return flat;
        } catch (Exception e) {
            log.warn("Unparseable AI column-mapping response: {}", e.getMessage());
            return Map.of();
        }
    }
}
