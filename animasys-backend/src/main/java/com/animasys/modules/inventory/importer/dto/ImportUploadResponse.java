package com.animasys.modules.inventory.importer.dto;

import com.animasys.modules.inventory.importer.service.ColumnMappingSuggestion;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ImportUploadResponse {
    private String sessionId;
    private String fileName;
    private String sheetName;
    private int totalRows;
    private List<String> headers;
    private List<ColumnMappingSuggestion> suggestedMapping;
    /** True when the AI provider resolved at least one column the alias/value matchers could not. */
    private boolean aiAssisted;
    /** Field codes with no column at all — the UI warns before they silently default to 0. */
    private List<String> unmappedFields;
}
