package com.animasys.modules.inventory.service;

import com.animasys.core.exception.ResourceNotFoundException;
import com.animasys.modules.inventory.domain.InventoryBatch;
import com.animasys.modules.inventory.domain.ProductVariant;
import com.animasys.modules.inventory.domain.Warehouse;
import com.animasys.modules.inventory.domain.WarehouseStock;
import com.animasys.modules.inventory.repository.InventoryBatchRepository;
import com.animasys.modules.inventory.repository.ProductVariantRepository;
import com.animasys.modules.inventory.repository.WarehouseRepository;
import com.animasys.modules.inventory.repository.WarehouseStockRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Keeps {@link ProductVariant#getStockQuantity()} and warehouse balances aligned with
 * the sum of active {@link InventoryBatch#getRemainingQuantity()} (single source of truth).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class InventoryStockSyncService {

    private final InventoryBatchRepository batchRepository;
    private final ProductVariantRepository variantRepository;
    private final WarehouseStockRepository warehouseStockRepository;
    private final WarehouseRepository warehouseRepository;

    @Transactional(readOnly = true)
    public int sumActiveBatchQuantity(String tenantId, String productVariantId) {
        return batchRepository.sumRemainingQuantityByTenantAndVariantAndStatus(
                tenantId, productVariantId, InventoryBatch.BatchStatus.ACTIVE);
    }

    /**
     * Reconcile denormalized stock fields to match batch layers exactly.
     * All quantity is mirrored into {@link StockService#DEFAULT_SALES_WAREHOUSE}; other warehouses for this variant are zeroed.
     */
    @Transactional
    public void syncVariantFromBatches(String tenantId, String productVariantId) {
        variantRepository.flush();
        batchRepository.flush();

        ProductVariant variant = variantRepository.findById(productVariantId)
                .orElseThrow(() -> new ResourceNotFoundException("Product Variant not found: " + productVariantId));

        int batchTotal = batchRepository.sumRemainingQuantityByTenantAndVariantAndStatus(
                tenantId, productVariantId, InventoryBatch.BatchStatus.ACTIVE);

        variant.setStockQuantity(batchTotal);
        variantRepository.save(variant);

        List<InventoryBatch> activeBatches = batchRepository.findByTenantIdAndProductVariantIdAndRemainingQuantityGreaterThanAndStatusOrderByPurchaseDateAscIdAsc(
                tenantId, productVariantId, 0, InventoryBatch.BatchStatus.ACTIVE);
        
        java.util.Map<String, Integer> stockPerWarehouse = new java.util.HashMap<>();
        for (InventoryBatch b : activeBatches) {
            Warehouse batchWarehouse = b.getWarehouse();
            if (batchWarehouse == null) {
                log.warn("Skipping batch {} with null warehouse while syncing variant {} (tenant {}); needs data backfill",
                        b.getId(), productVariantId, tenantId);
                continue;
            }
            String wId = batchWarehouse.getId();
            stockPerWarehouse.put(wId, stockPerWarehouse.getOrDefault(wId, 0) + b.getRemainingQuantity());
        }

        List<WarehouseStock> allRows = warehouseStockRepository.findByProductVariantId(productVariantId);
        for (WarehouseStock row : allRows) {
            String wId = row.getWarehouse().getId();
            int newQty = stockPerWarehouse.getOrDefault(wId, 0);
            row.setQuantity(newQty);
            warehouseStockRepository.save(row);
            stockPerWarehouse.remove(wId);
        }

        for (java.util.Map.Entry<String, Integer> entry : stockPerWarehouse.entrySet()) {
            if (entry.getValue() > 0) {
                Warehouse w = warehouseRepository.findById(entry.getKey()).orElse(null);
                if (w != null) {
                    WarehouseStock newRow = WarehouseStock.builder()
                            .id(java.util.UUID.randomUUID().toString())
                            .warehouse(w)
                            .productVariant(variant)
                            .quantity(entry.getValue())
                            .build();
                    warehouseStockRepository.save(newRow);
                }
            }
        }
    }
}
