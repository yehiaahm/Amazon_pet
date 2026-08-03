package com.animasys.modules.inventory.dto;

import lombok.Data;

@Data
public class StartImportRequest {
    private String fileName;
    private Long fileSize;
    private String fileHash;
    private String duplicateStrategy;
    private String targetType;
    private String uploadedBy;
}
