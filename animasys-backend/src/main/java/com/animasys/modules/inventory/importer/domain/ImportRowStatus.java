package com.animasys.modules.inventory.importer.domain;

public enum ImportRowStatus {
    PENDING,
    NEW,
    UPDATE,
    DUPLICATE,
    /** INVENTORY_COUNT mode only: row matched an existing product and is ready to reconcile. */
    COUNT_MATCHED,
    ERROR,
    IMPORTED,
    UPDATED,
    SKIPPED,
    FAILED
}
