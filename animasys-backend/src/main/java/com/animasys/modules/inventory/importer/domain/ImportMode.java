package com.animasys.modules.inventory.importer.domain;

public enum ImportMode {
    /** Excel quantity is added on top of current stock: New Stock = Current + Excel Quantity. */
    ADD_STOCK,
    /** Excel quantity is the actual counted stock: New Stock = Excel Quantity (adjustment = counted - current). */
    INVENTORY_COUNT
}
