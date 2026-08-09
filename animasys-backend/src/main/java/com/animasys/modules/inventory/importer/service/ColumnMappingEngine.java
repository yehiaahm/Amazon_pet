package com.animasys.modules.inventory.importer.service;

import org.springframework.stereotype.Component;

import java.util.*;

/**
 * Smart column mapping: matches uploaded spreadsheet headers to {@link ImportField}s.
 *
 * <p>Matching runs in descending order of trust and the best score across every alias of
 * every field wins:</p>
 * <ol>
 *   <li><b>exact</b> (1.0) — the normalized header <em>is</em> a known alias;</li>
 *   <li><b>word</b> (0.9) — one of the header's words is a known alias, which is what
 *       rescues the compound headers real templates use ("المخزن / الفرع");</li>
 *   <li><b>containment</b> (0.6–0.89, scaled by how much of the header the alias covers) —
 *       "الكمية بالمخزن", "Cost (EGP)";</li>
 *   <li><b>fuzzy</b> (edit distance) — catches typos such as "Prodcut Name".</li>
 * </ol>
 *
 * <p>When headers alone don't resolve the columns that identify a product, the sample data
 * is inspected too ({@link #inferFromValues}): a column of 13-digit numbers is a barcode
 * whatever its header says. Anything still unresolved after that is left for
 * {@link AiColumnMappingAdvisor} and, failing that, manual mapping.</p>
 */
@Component
public class ColumnMappingEngine {

    /** Below this confidence, a header is left unmapped for manual selection. */
    static final double AUTO_ACCEPT_THRESHOLD = 0.72;
    private static final double WORD_MATCH_SCORE = 0.9;
    private static final int MIN_CONTAINMENT_ALIAS_LENGTH = 3;
    /** Rows sampled for value-based inference — enough to be representative, cheap to scan. */
    static final int VALUE_SAMPLE_SIZE = 50;

    public List<ColumnMappingSuggestion> suggestMapping(List<String> headers) {
        return suggestMapping(headers, List.of());
    }

    public List<ColumnMappingSuggestion> suggestMapping(List<String> headers, List<Map<String, String>> sampleRows) {
        List<ColumnMappingSuggestion> suggestions = new ArrayList<>();
        for (String header : headers) {
            suggestions.add(matchHeader(header));
        }
        resolveCollisions(suggestions);
        if (sampleRows != null && !sampleRows.isEmpty()) {
            inferFromValues(headers, sampleRows, suggestions);
        }
        return suggestions;
    }

    /**
     * True when a cell's text is recognizable as a column label. Used by
     * {@link ExcelParserService} to find the real header row in files that open with a
     * title/logo/blank rows above it.
     */
    static boolean isRecognizedHeader(String cellText) {
        return matchHeader(cellText).getConfidence() >= AUTO_ACCEPT_THRESHOLD;
    }

    private static ColumnMappingSuggestion matchHeader(String header) {
        String normalized = HeaderNormalizer.normalize(header);
        if (normalized.isEmpty()) {
            return ColumnMappingSuggestion.builder().header(header).confidence(0).autoMapped(false).build();
        }
        Set<String> words = new LinkedHashSet<>(HeaderNormalizer.tokens(header));
        words.addAll(words.stream().map(HeaderNormalizer::stripDefiniteArticle).toList());

        ImportField bestField = null;
        double bestScore = 0;
        int bestAliasLength = 0;
        for (ImportField field : ImportField.values()) {
            for (String alias : field.normalizedAliases()) {
                double score = score(normalized, words, alias);
                // Ties go to the longer alias: it is the more specific evidence.
                if (score > bestScore || (score == bestScore && alias.length() > bestAliasLength)) {
                    bestScore = score;
                    bestField = field;
                    bestAliasLength = alias.length();
                }
            }
        }

        return ColumnMappingSuggestion.builder()
                .header(header)
                .field(bestField) // kept as a hint for manual selection even when below threshold
                .confidence(bestScore)
                .autoMapped(bestScore >= AUTO_ACCEPT_THRESHOLD)
                .build();
    }

    private static double score(String normalized, Set<String> words, String alias) {
        if (alias.isEmpty()) {
            return 0;
        }
        if (normalized.equals(alias)) {
            return 1.0;
        }
        if (alias.length() >= 2 && words.contains(alias)) {
            return WORD_MATCH_SCORE;
        }
        if (alias.length() >= MIN_CONTAINMENT_ALIAS_LENGTH) {
            double coverage = 0;
            if (normalized.contains(alias)) {
                coverage = (double) alias.length() / normalized.length();
            } else if (alias.contains(normalized)) {
                coverage = (double) normalized.length() / alias.length();
            }
            if (coverage > 0) {
                // 0.6 for a token buried in a long header, approaching 0.9 as it covers more of it.
                return 0.6 + (0.29 * coverage);
            }
        }
        return similarity(normalized, alias);
    }

    /** Drop duplicate auto-mappings, keeping only the highest-confidence header per field. */
    private void resolveCollisions(List<ColumnMappingSuggestion> suggestions) {
        Map<ImportField, ColumnMappingSuggestion> winners = new EnumMap<>(ImportField.class);
        for (ColumnMappingSuggestion s : suggestions) {
            if (!s.isAutoMapped() || s.getField() == null) {
                continue;
            }
            ColumnMappingSuggestion current = winners.get(s.getField());
            if (current == null || s.getConfidence() > current.getConfidence()) {
                winners.put(s.getField(), s);
            }
        }
        for (ColumnMappingSuggestion s : suggestions) {
            if (s.isAutoMapped() && s.getField() != null && winners.get(s.getField()) != s) {
                s.setAutoMapped(false);
            }
        }
    }

    /**
     * Last deterministic resort for files whose headers are missing, renamed beyond
     * recognition, or in a language we don't carry aliases for: identify the columns that
     * matter from what they contain. Only the two identity fields are auto-accepted this
     * way — guessing a price column wrong is far more damaging than leaving it blank, so
     * quantity and prices are recorded as manual-review hints instead.
     */
    private void inferFromValues(List<String> headers, List<Map<String, String>> sampleRows,
                                 List<ColumnMappingSuggestion> suggestions) {
        Set<ImportField> claimed = EnumSet.noneOf(ImportField.class);
        for (ColumnMappingSuggestion s : suggestions) {
            if (s.isAutoMapped() && s.getField() != null) {
                claimed.add(s.getField());
            }
        }

        Map<String, ColumnStats> stats = new LinkedHashMap<>();
        List<Map<String, String>> sample = sampleRows.size() > VALUE_SAMPLE_SIZE
                ? sampleRows.subList(0, VALUE_SAMPLE_SIZE) : sampleRows;
        for (String header : headers) {
            stats.put(header, ColumnStats.of(sample, header));
        }

        Set<String> usedHeaders = new HashSet<>();
        for (ColumnMappingSuggestion s : suggestions) {
            if (s.isAutoMapped()) {
                usedHeaders.add(s.getHeader());
            }
        }

        if (!claimed.contains(ImportField.BARCODE)) {
            assign(suggestions, stats, usedHeaders, ImportField.BARCODE, 0.75, true,
                    st -> st.barcodeRatio >= 0.7, st -> st.barcodeRatio);
        }
        if (!claimed.contains(ImportField.PRODUCT_NAME)) {
            assign(suggestions, stats, usedHeaders, ImportField.PRODUCT_NAME, 0.7, true,
                    st -> st.textRatio >= 0.7 && st.avgLength >= 5 && st.uniqueRatio >= 0.5, st -> st.avgLength);
        }
        if (!claimed.contains(ImportField.QUANTITY)) {
            assign(suggestions, stats, usedHeaders, ImportField.QUANTITY, 0.6, false,
                    st -> st.integerRatio >= 0.8 && st.maxValue <= 100_000, st -> st.integerRatio);
        }
    }

    private void assign(List<ColumnMappingSuggestion> suggestions, Map<String, ColumnStats> stats,
                        Set<String> usedHeaders, ImportField field, double confidence, boolean autoMap,
                        java.util.function.Predicate<ColumnStats> eligible,
                        java.util.function.ToDoubleFunction<ColumnStats> rank) {
        ColumnMappingSuggestion best = null;
        double bestRank = Double.NEGATIVE_INFINITY;
        for (ColumnMappingSuggestion s : suggestions) {
            if (usedHeaders.contains(s.getHeader())) {
                continue;
            }
            ColumnStats st = stats.get(s.getHeader());
            if (st == null || st.filled == 0 || !eligible.test(st)) {
                continue;
            }
            double value = rank.applyAsDouble(st);
            if (value > bestRank) {
                bestRank = value;
                best = s;
            }
        }
        if (best == null) {
            return;
        }
        best.setField(field);
        best.setConfidence(confidence);
        best.setAutoMapped(autoMap);
        best.setSource(ColumnMappingSuggestion.Source.VALUES);
        if (autoMap) {
            usedHeaders.add(best.getHeader());
        }
    }

    /** Shape of one column's sample values, used by {@link #inferFromValues}. */
    private static final class ColumnStats {
        private int filled;
        private double barcodeRatio;
        private double textRatio;
        private double integerRatio;
        private double uniqueRatio;
        private double avgLength;
        private double maxValue;

        static ColumnStats of(List<Map<String, String>> rows, String header) {
            ColumnStats st = new ColumnStats();
            int barcodes = 0, texts = 0, integers = 0, totalLength = 0;
            Set<String> distinct = new HashSet<>();
            for (Map<String, String> row : rows) {
                String raw = row.get(header);
                String value = raw == null ? "" : HeaderNormalizer.toLatinDigits(raw).trim();
                if (value.isEmpty()) {
                    continue;
                }
                st.filled++;
                distinct.add(value);
                totalLength += value.length();
                if (value.length() >= 8 && value.length() <= 14 && value.chars().allMatch(Character::isDigit)) {
                    barcodes++;
                }
                Double numeric = parseNumber(value);
                if (numeric == null) {
                    texts++;
                } else {
                    st.maxValue = Math.max(st.maxValue, Math.abs(numeric));
                    if (numeric == Math.floor(numeric)) {
                        integers++;
                    }
                }
            }
            if (st.filled > 0) {
                st.barcodeRatio = (double) barcodes / st.filled;
                st.textRatio = (double) texts / st.filled;
                st.integerRatio = (double) integers / st.filled;
                st.uniqueRatio = (double) distinct.size() / st.filled;
                st.avgLength = (double) totalLength / st.filled;
            }
            return st;
        }

        private static Double parseNumber(String value) {
            try {
                return Double.valueOf(value.replace(",", "").replace(" ", ""));
            } catch (NumberFormatException e) {
                return null;
            }
        }
    }

    /** Normalized similarity in [0,1] based on Levenshtein distance. */
    static double similarity(String a, String b) {
        if (a.isEmpty() && b.isEmpty()) {
            return 1.0;
        }
        int maxLen = Math.max(a.length(), b.length());
        if (maxLen == 0) {
            return 1.0;
        }
        int distance = levenshtein(a, b);
        return 1.0 - ((double) distance / maxLen);
    }

    private static int levenshtein(String a, String b) {
        int[] prev = new int[b.length() + 1];
        int[] curr = new int[b.length() + 1];
        for (int j = 0; j <= b.length(); j++) {
            prev[j] = j;
        }
        for (int i = 1; i <= a.length(); i++) {
            curr[0] = i;
            for (int j = 1; j <= b.length(); j++) {
                int cost = a.charAt(i - 1) == b.charAt(j - 1) ? 0 : 1;
                curr[j] = Math.min(Math.min(curr[j - 1] + 1, prev[j] + 1), prev[j - 1] + cost);
            }
            int[] tmp = prev;
            prev = curr;
            curr = tmp;
        }
        return prev[b.length()];
    }
}
