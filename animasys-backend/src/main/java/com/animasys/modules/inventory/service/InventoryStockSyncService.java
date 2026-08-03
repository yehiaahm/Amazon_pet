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
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Keeps {@link ProductVariant#getStockQuantity()} and warehouse balances aligned with
 * the sum of active {@link InventoryBatch#getRemainingQuantity()} (single source of truth).
 */
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

        Warehouse shelf = warehouseRepository.findById(StockService.DEFAULT_SALES_WAREHOUSE)
                .orElseGet(() -> warehouseRepository.findByTenantId(tenantId).stream().findFirst().orElse(null));
        if (shelf == null) {
            return;
        }

        WarehouseStock shelfRow = warehouseStockRepository
                .findByWarehouseIdAndProductVariantId(shelf.getId(), productVariantId)
                .orElseGet(() -> WarehouseStock.builder()
                        .id(java.util.UUID.randomUUID().toString())
                        .warehouse(shelf)
                        .productVariant(variant)
                        .quantity(0)
                        .build());
        shelfRow.setQuantity(batchTotal);
        warehouseStockRepository.save(shelfRow);

        List<WarehouseStock> allRows = warehouseStockRepository.findByProductVariantId(productVariantId);
        for (WarehouseStock row : allRows) {
            if (!row.getWarehouse().getId().equals(shelf.getId())) {
                row.setQuantity(0);
                warehouseStockRepository.save(row);
            }
        }
    }
}
