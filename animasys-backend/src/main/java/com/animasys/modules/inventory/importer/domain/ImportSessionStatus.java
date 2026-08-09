package com.animasys.modules.inventory.importer.domain;

public enum ImportSessionStatus {
    PENDING_MAPPING,
    MAPPED,
    COMMITTING,
    COMPLETED,
    FAILED,
    CANCELLED
}
