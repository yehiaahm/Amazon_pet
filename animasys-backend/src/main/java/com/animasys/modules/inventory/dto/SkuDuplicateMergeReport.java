package com.animasys.modules.inventory.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
public class SkuDuplicateMergeReport {
    private List<DuplicateVariantGroup> duplicateGroupsFound = new ArrayList<>();
    private List<MergedVariantEntry> mergedVariants = new ArrayList<>();
    private List<String> batchesMoved = new ArrayList<>();
    private List<String> affectedSaleItemIds = new ArrayList<>();
    private List<String> affectedInventoryLedgerIds = new ArrayList<>();
    private int duplicateSkuGroupsRemaining;
    private boolean databaseClean;

    @Data
    public static class DuplicateVariantGroup {
        private String tenantId;
        private String normalizedSku;
        private List<String> productIds;
        private List<String> variantIds;
    }

    @Data
    public static class MergedVariantEntry {
        private String tenantId;
        private String sku;
        private String survivorVariantId;
        private String removedVariantId;
        private String removedProductId;
    }
}
