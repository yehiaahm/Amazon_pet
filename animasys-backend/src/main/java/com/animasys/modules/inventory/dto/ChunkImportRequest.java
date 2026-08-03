package com.animasys.modules.inventory.dto;

import lombok.Data;
import java.util.List;

@Data
public class ChunkImportRequest {
    private List<BulkImportItem> items;
    private Integer chunkIndex;
    private Boolean dryRun;
    private String employeeId;
}
