package com.animasys.modules.inventory.importer.domain;

public enum ImportRowStatus {
    PENDING,
    NEW,
    UPDATE,
    DUPLICATE,
    ERROR,
    IMPORTED,
    UPDATED,
    SKIPPED,
    FAILED
}
