package com.animasys.modules.inventory.importer.service;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** One header's auto-mapping result, returned to the UI for confirmation/override. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ColumnMappingSuggestion {
    private String header;
    private ImportField field; // null if no confident match was found
    private double confidence;  // 0.0 - 1.0
    private boolean autoMapped; // true if confidence cleared the auto-accept threshold
    @Builder.Default
    private Source source = Source.HEADER;

    /** How the suggestion was reached — surfaced in the UI so a guess is never mistaken for a certainty. */
    public enum Source {
        /** Matched against the field's known header aliases. */
        HEADER,
        /** Deduced from the shape of the column's data (e.g. 13-digit numbers => barcode). */
        VALUES,
        /** Proposed by the AI provider when neither of the above resolved the column. */
        AI
    }
}
