package com.animasys.modules.inventory.importer.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ImportMappingPresetDTO {
    private String id;
    private String name;
    private String importMode;
    private Map<String, String> mapping;
    private LocalDateTime createdAt;
}
