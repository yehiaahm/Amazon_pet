package com.animasys.modules.inventory.importer.service;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RowValidationResult {
    @Builder.Default
    private List<ValidationIssue> errors = new ArrayList<>();
    @Builder.Default
    private List<ValidationIssue> warnings = new ArrayList<>();

    public boolean hasErrors() {
        return errors != null && !errors.isEmpty();
    }
}
