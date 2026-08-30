package com.animasys.modules.inventory.importer.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import lombok.Data;

import java.util.Map;

@Data
public class SaveImportMappingPresetRequest {
    @NotBlank
    private String name;
    @NotBlank
    private String importMode; // ADD_STOCK or INVENTORY_COUNT
    @NotEmpty
    private Map<String, String> mapping;
}
