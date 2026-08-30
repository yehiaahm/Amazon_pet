package com.animasys.modules.inventory.importer.service;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/** Normalizes Excel/CSV header text for reliable Arabic/English column matching. */
final class HeaderNormalizer {

    // Arabic diacritics (tashkeel) + tatweel
    private static final Pattern ARABIC_DIACRITICS = Pattern.compile("[\\u064B-\\u065F\\u0670\\u0640]");
    private static final Pattern NON_ALNUM = Pattern.compile("[^\\p{L}\\p{N}]+");
    /** Arabic-Indic (٠-٩) and extended Arabic-Indic (۰-۹) digit blocks. */
    private static final char ARABIC_INDIC_ZERO = '٠';
    private static final char EXTENDED_ARABIC_INDIC_ZERO = '۰';

    private HeaderNormalizer() {
    }

    /**
     * Case/diacritic/letter-variant folding that <em>keeps</em> separators, so the result can
     * still be split into words. {@link #normalize} is this plus separator stripping.
     */
    static String fold(String raw) {
        if (raw == null) {
            return "";
        }
        String s = Normalizer.normalize(raw.trim(), Normalizer.Form.NFKC);
        s = ARABIC_DIACRITICS.matcher(s).replaceAll("");
        // Normalize Arabic letter variants (alef forms, ta marbuta/ha, ya/alef maksura)
        s = s.replace('أ', 'ا').replace('إ', 'ا').replace('آ', 'ا');
        s = s.replace('ة', 'ه');
        s = s.replace('ى', 'ي');
        s = toLatinDigits(s);
        return s.toLowerCase();
    }

    static String normalize(String raw) {
        return NON_ALNUM.matcher(fold(raw)).replaceAll("");
    }

    /**
     * Splits a header into normalized words. Real templates glue several labels into one
     * cell ("المخزن / الفرع", "كود الصنف (SKU)"), so matching a single word is often the
     * only way to recognize the column.
     */
    static List<String> tokens(String raw) {
        List<String> tokens = new ArrayList<>();
        for (String part : NON_ALNUM.split(fold(raw))) {
            if (part.length() >= 2) {
                tokens.add(part);
            }
        }
        return tokens;
    }

    /**
     * Arabic-Indic digits are what Windows/Office produce under an Arabic locale; every
     * numeric parse downstream expects ASCII, so fold them here once.
     */
    static String toLatinDigits(String raw) {
        if (raw == null) {
            return "";
        }
        StringBuilder sb = new StringBuilder(raw.length());
        for (char c : raw.toCharArray()) {
            if (c >= ARABIC_INDIC_ZERO && c <= ARABIC_INDIC_ZERO + 9) {
                sb.append((char) ('0' + (c - ARABIC_INDIC_ZERO)));
            } else if (c >= EXTENDED_ARABIC_INDIC_ZERO && c <= EXTENDED_ARABIC_INDIC_ZERO + 9) {
                sb.append((char) ('0' + (c - EXTENDED_ARABIC_INDIC_ZERO)));
            } else {
                sb.append(c);
            }
        }
        return sb.toString();
    }

    /** Arabic often prefixes the definite article; "الكمية" and "كمية" must match the same field. */
    static String stripDefiniteArticle(String normalized) {
        if (normalized.length() > 4 && normalized.startsWith("ال")) {
            return normalized.substring(2);
        }
        return normalized;
    }
}
