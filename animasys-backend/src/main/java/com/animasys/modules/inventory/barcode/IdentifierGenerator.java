package com.animasys.modules.inventory.barcode;

public interface IdentifierGenerator {
    String generate(String tenantId, String type);
}
