package com.animasys.modules.inventory.importer.dto;

import lombok.Data;

import java.util.List;

@Data
public class DuplicateResolutionRequest {
    private List<String> itemIds;
    private String resolution; // UPDATE_EXISTING, SKIP, CREATE_NEW
}
