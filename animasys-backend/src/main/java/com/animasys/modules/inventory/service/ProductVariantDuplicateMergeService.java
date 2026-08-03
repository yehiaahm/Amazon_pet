package com.animasys.modules.inventory.service;

import com.animasys.core.security.UserPrincipal;
import com.animasys.modules.iam.repository.TenantRepository;
import com.animasys.modules.inventory.domain.*;
import com.animasys.modules.inventory.dto.SkuDuplicateMergeReport;
import com.animasys.modules.inventory.repository.*;
import com.animasys.modules.sales.domain.SaleItem;
import com.animasys.modules.sales.repository.SaleItemRepository;
import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class ProductVariantDuplicateMergeService {

    private final TenantRepository tenantRepository;
    private final ProductRepository productRepository;
    private final ProductVariantRepository variantRepository;
    private final InventoryBatchRepository batchRepository;
    private final InventoryLedgerTransactionRepository ledgerRepository;
    private final WarehouseStockRepository warehouseStockRepository;
    private final StockMovementRepository stockMovementRepository;
    private final InventoryAdjustmentItemRepository adjustmentItemRepository;
    private final SaleItemRepository saleItemRepository;
    private final ImportSessionItemRepository importSessionItemRepository;
    private final SkuCatalogService skuCatalogService;
    private final InventoryStockSyncService stockSyncService;
    private final EntityManager entityManager;

    @Transactional
    public SkuDuplicateMergeReport mergeAllTenants() {
        SkuDuplicateMergeReport report = new SkuDuplicateMergeReport();
        tenantRepository.findAll().forEach(t -> mergeTenant(t.getId(), report));
        finalizeReport(report, null);
        return report;
    }

    @Transactional
    public SkuDuplicateMergeReport mergeTenant(String tenantId) {
        assertAuthenticatedTenantScope(tenantId);
        SkuDuplicateMergeReport report = new SkuDuplicateMergeReport();
        mergeTenant(tenantId, report);
        finalizeReport(report, tenantId);
        return report;
    }

    /** Collapses multiple variants on one product (same SKU) without scanning the whole tenant. */
    @Transactional
    public void consolidateProductCatalogRow(String tenantId, Product product) {
        if (product == null || product.getId() == null) {
            return;
        }
        product = productRepository.findById(product.getId()).orElse(product);
        SkuDuplicateMergeReport report = new SkuDuplicateMergeReport();
        String normalized = product.getSku() != null ? SkuCatalogService.normalizeSku(product.getSku()) : "";
        consolidateVariantsOnProduct(product, tenantId, normalized, report);
    }

    private void finalizeReport(SkuDuplicateMergeReport report, String tenantId) {
        int remaining = countRemainingDuplicateSkuGroups(tenantId);
        report.setDuplicateSkuGroupsRemaining(remaining);
        report.setDatabaseClean(remaining == 0);
        log.info("SKU merge complete: mergedVariants={}, batchesMoved={}, duplicateGroupsRemaining={}",
                report.getMergedVariants().size(), report.getBatchesMoved().size(), remaining);
    }

    private void mergeTenant(String tenantId, SkuDuplicateMergeReport report) {
        List<Product> products = productRepository.findByTenantId(tenantId);
        Map<String, List<Product>> byNormalizedSku = products.stream()
                .filter(p -> p.getSku() != null && !p.getSku().isBlank())
                .collect(Collectors.groupingBy(p -> SkuCatalogService.normalizeSku(p.getSku())));

        for (Map.Entry<String, List<Product>> entry : byNormalizedSku.entrySet()) {
            List<Product> group = entry.getValue();
            if (group.size() <= 1) {
                consolidateVariantsOnProduct(group.get(0), tenantId, entry.getKey(), report);
                continue;
            }

            report.getDuplicateGroupsFound().add(buildGroupReport(tenantId, entry.getKey(), group));

            Product survivorProduct = selectSurvivorProduct(group);
            String canonicalSku = survivorProduct.getSku().trim();
            survivorProduct.setSku(canonicalSku);
            productRepository.saveAndFlush(survivorProduct);

            ProductVariant survivorVariant = ensureSingleVariantOnProduct(survivorProduct, tenantId, canonicalSku);

            for (Product product : group) {
                if (product.getId().equals(survivorProduct.getId())) {
                    continue;
                }
                for (ProductVariant variant : new ArrayList<>(variantRepository.findByProductId(product.getId()))) {
                    mergeVariantInto(survivorVariant, variant, tenantId, canonicalSku, report, product.getId());
                }
                productRepository.delete(product);
                productRepository.flush();
            }

            consolidateVariantsOnProduct(survivorProduct, tenantId, entry.getKey(), report);
        }

        for (Product product : products) {
            if (product.getSku() == null || product.getSku().isBlank()) {
                consolidateVariantsOnProduct(product, tenantId, "", report);
            }
        }
    }

    private void consolidateVariantsOnProduct(
            Product product,
            String tenantId,
            String normalizedSku,
            SkuDuplicateMergeReport report
    ) {
        List<ProductVariant> variants = variantRepository.findByProductId(product.getId());
        if (variants.size() <= 1) {
            if (variants.size() == 1) {
                skuCatalogService.syncVariantSkuFromProduct(variants.get(0), product);
                variantRepository.save(variants.get(0));
            }
            return;
        }

        SkuDuplicateMergeReport.DuplicateVariantGroup group = new SkuDuplicateMergeReport.DuplicateVariantGroup();
        group.setTenantId(tenantId);
        group.setNormalizedSku(normalizedSku);
        group.setProductIds(List.of(product.getId()));
        group.setVariantIds(variants.stream().map(ProductVariant::getId).toList());
        report.getDuplicateGroupsFound().add(group);

        ProductVariant survivor = skuCatalogService.selectSurvivorVariant(variants);
        skuCatalogService.syncVariantSkuFromProduct(survivor, product);
        variantRepository.saveAndFlush(survivor);

        for (ProductVariant variant : variants) {
            if (variant.getId().equals(survivor.getId())) {
                continue;
            }
            mergeVariantInto(survivor, variant, tenantId, product.getSku(), report, null);
        }
    }

    private ProductVariant ensureSingleVariantOnProduct(Product product, String tenantId, String sku) {
        List<ProductVariant> variants = variantRepository.findByProductId(product.getId());
        if (variants.isEmpty()) {
            return skuCatalogService.updateOrCreateSingleVariant(product, "Standard", null, null);
        }
        ProductVariant survivor = skuCatalogService.selectSurvivorVariant(variants);
        skuCatalogService.syncVariantSkuFromProduct(survivor, product);
        return variantRepository.saveAndFlush(survivor);
    }

    private void mergeVariantInto(
            ProductVariant target,
            ProductVariant source,
            String tenantId,
            String sku,
            SkuDuplicateMergeReport report,
            String removedProductId
    ) {
        if (target.getId().equals(source.getId())) {
            return;
        }

        String sourceId = source.getId();
        String targetId = target.getId();

        for (InventoryBatch batch : batchRepository.findByProductVariantId(sourceId)) {
            batch.setProductVariant(target);
            batchRepository.save(batch);
            report.getBatchesMoved().add("batch:" + batch.getId() + " -> variant:" + targetId);
        }

        for (InventoryLedgerTransaction tx : ledgerRepository.findByProductVariantId(sourceId)) {
            tx.setProductVariant(target);
            ledgerRepository.save(tx);
            report.getAffectedInventoryLedgerIds().add(tx.getId());
        }

        for (StockMovement movement : stockMovementRepository.findByProductVariantId(sourceId)) {
            movement.setProductVariant(target);
            stockMovementRepository.save(movement);
        }

        for (InventoryAdjustmentItem item : adjustmentItemRepository.findByProductVariantId(sourceId)) {
            item.setProductVariant(target);
            adjustmentItemRepository.save(item);
        }

        mergeWarehouseStock(sourceId, target);
        reassignStockTransferItems(sourceId, targetId);

        for (SaleItem saleItem : saleItemRepository.findByItemId(sourceId)) {
            saleItem.setItemId(targetId);
            saleItemRepository.save(saleItem);
            report.getAffectedSaleItemIds().add(saleItem.getId());
        }

        for (ImportSessionItem sessionItem : importSessionItemRepository.findByAffectedEntityId(sourceId)) {
            sessionItem.setAffectedEntityId(targetId);
            importSessionItemRepository.save(sessionItem);
        }

        entityManager.flush();
        variantRepository.delete(source);
        variantRepository.flush();

        SkuDuplicateMergeReport.MergedVariantEntry entry = new SkuDuplicateMergeReport.MergedVariantEntry();
        entry.setTenantId(tenantId);
        entry.setSku(sku);
        entry.setSurvivorVariantId(targetId);
        entry.setRemovedVariantId(sourceId);
        entry.setRemovedProductId(removedProductId);
        report.getMergedVariants().add(entry);

        stockSyncService.syncVariantFromBatches(tenantId, targetId);
    }

    private void reassignStockTransferItems(String sourceVariantId, String targetVariantId) {
        try {
            entityManager.createNativeQuery(
                            "UPDATE stock_transfer_items SET product_variant_id = :target WHERE product_variant_id = :source")
                    .setParameter("target", targetVariantId)
                    .setParameter("source", sourceVariantId)
                    .executeUpdate();
        } catch (Exception ex) {
            log.debug("stock_transfer_items reassignment skipped: {}", ex.getMessage());
        }
    }

    private void mergeWarehouseStock(String sourceVariantId, ProductVariant target) {
        List<WarehouseStock> sourceRows = warehouseStockRepository.findByProductVariantId(sourceVariantId);
        for (WarehouseStock row : sourceRows) {
            String warehouseId = row.getWarehouse().getId();
            Optional<WarehouseStock> existing = warehouseStockRepository
                    .findByWarehouseIdAndProductVariantId(warehouseId, target.getId());
            if (existing.isPresent()) {
                WarehouseStock targetRow = existing.get();
                targetRow.setQuantity(targetRow.getQuantity() + row.getQuantity());
                warehouseStockRepository.save(targetRow);
                warehouseStockRepository.delete(row);
            } else {
                row.setProductVariant(target);
                warehouseStockRepository.save(row);
            }
        }
    }

    private Product selectSurvivorProduct(List<Product> group) {
        return group.stream()
                .max(Comparator.comparingInt(this::totalVariantStock)
                        .thenComparing(Product::getId, Comparator.reverseOrder()))
                .orElse(group.get(0));
    }

    private int totalVariantStock(Product product) {
        return variantRepository.findByProductId(product.getId()).stream()
                .mapToInt(ProductVariant::getStockQuantity)
                .sum();
    }

    private SkuDuplicateMergeReport.DuplicateVariantGroup buildGroupReport(
            String tenantId, String normalizedSku, List<Product> group
    ) {
        SkuDuplicateMergeReport.DuplicateVariantGroup groupReport = new SkuDuplicateMergeReport.DuplicateVariantGroup();
        groupReport.setTenantId(tenantId);
        groupReport.setNormalizedSku(normalizedSku);
        groupReport.setProductIds(group.stream().map(Product::getId).toList());
        groupReport.setVariantIds(group.stream()
                .flatMap(p -> variantRepository.findByProductId(p.getId()).stream())
                .map(ProductVariant::getId)
                .toList());
        return groupReport;
    }

    @Transactional(readOnly = true)
    public int countRemainingDuplicateSkuGroups(String tenantId) {
        List<Product> products = tenantId != null
                ? productRepository.findByTenantId(tenantId)
                : productRepository.findAll();
        Map<String, Long> counts = products.stream()
                .filter(p -> p.getTenant() != null && p.getSku() != null && !p.getSku().isBlank())
                .collect(Collectors.groupingBy(
                        p -> p.getTenant().getId() + "|" + SkuCatalogService.normalizeSku(p.getSku()),
                        Collectors.counting()));
        return (int) counts.values().stream().filter(c -> c > 1).count();
    }

    @Transactional(readOnly = true)
    public SkuDuplicateMergeReport previewDuplicates(String tenantId) {
        assertAuthenticatedTenantScope(tenantId);
        SkuDuplicateMergeReport report = new SkuDuplicateMergeReport();
        collectDuplicateGroupsForTenant(tenantId, report);
        finalizeReport(report, tenantId);
        return report;
    }

    private void collectDuplicateGroupsForTenant(String tenantId, SkuDuplicateMergeReport report) {
        List<Product> products = productRepository.findByTenantId(tenantId);
        Map<String, List<Product>> bySku = products.stream()
                .filter(p -> p.getSku() != null && !p.getSku().isBlank())
                .collect(Collectors.groupingBy(p -> SkuCatalogService.normalizeSku(p.getSku())));
        bySku.forEach((sku, group) -> {
            if (group.size() > 1) {
                report.getDuplicateGroupsFound().add(buildGroupReport(tenantId, sku, group));
            }
        });
        for (Product product : products) {
            List<ProductVariant> variants = variantRepository.findByProductId(product.getId());
            if (variants.size() > 1) {
                SkuDuplicateMergeReport.DuplicateVariantGroup group = new SkuDuplicateMergeReport.DuplicateVariantGroup();
                group.setTenantId(tenantId);
                group.setNormalizedSku(SkuCatalogService.normalizeSku(product.getSku()));
                group.setProductIds(List.of(product.getId()));
                group.setVariantIds(variants.stream().map(ProductVariant::getId).toList());
                report.getDuplicateGroupsFound().add(group);
            }
        }
    }

    /**
     * When a user session is present, catalog admin operations must target that tenant only.
     * Internal startup/migration callers run without authentication and are not restricted here.
     */
    private void assertAuthenticatedTenantScope(String tenantId) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getPrincipal() instanceof UserPrincipal principal)) {
            return;
        }
        if (principal.getEmployee().getTenant() == null
                || !tenantId.equals(principal.getEmployee().getTenant().getId())) {
            throw new AccessDeniedException("Cross-tenant catalog access denied");
        }
    }
}
