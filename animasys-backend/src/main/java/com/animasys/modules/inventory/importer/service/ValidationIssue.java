package com.animasys.modules.inventory.importer.service;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class ValidationIssue {
    private String field;
    private String message;

    public static ValidationIssue of(ImportField field, String message) {
        return new ValidationIssue(field != null ? field.code() : null, message);
    }
}
