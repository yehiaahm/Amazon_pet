package com.animasys.modules.inventory.importer.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ImportSummary {
    private String sessionId;
    private int imported;
    private int updated;
    private int skipped;
    private int failed;
    private long executionTimeMs;
}
