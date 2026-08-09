package com.animasys.modules.inventory.importer.service;

import java.util.EnumMap;
import java.util.Map;
import java.util.stream.Collectors;

/** Converts between the enum-keyed in-memory row representation and the string-keyed JSON storage form. */
public final class MappedDataCodec {

    private MappedDataCodec() {
    }

    public static Map<String, String> toStringKeyed(Map<ImportField, String> mapped) {
        return mapped.entrySet().stream()
                .collect(Collectors.toMap(e -> e.getKey().code(), Map.Entry::getValue));
    }

    public static Map<ImportField, String> fromStringKeyed(Map<String, String> raw) {
        Map<ImportField, String> result = new EnumMap<>(ImportField.class);
        if (raw != null) {
            raw.forEach((code, value) -> {
                ImportField field = ImportField.fromCode(code);
                if (field != null) {
                    result.put(field, value);
                }
            });
        }
        return result;
    }
}
