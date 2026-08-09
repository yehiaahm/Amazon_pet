package com.animasys.modules.inventory.importer.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ImportMappingResponse {
    private String sessionId;
    private int totalRows;
    private int newRows;
    private int updateRows;
    private int duplicateRows;
    private int errorRows;
    /** Rows that will import cleanly but had something worth a second look (a default, an unrecognized name). */
    private int warningRows;
}
