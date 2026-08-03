package com.animasys.modules.inventory.service;

import com.animasys.modules.inventory.domain.Product;
import com.animasys.modules.inventory.domain.ProductVariant;
import com.animasys.modules.inventory.repository.ProductRepository;
import com.animasys.modules.inventory.repository.ProductVariantRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.Map;

/**
 * Ensures denormalized stock fields match {@code inventory_batches} totals.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class InventoryIntegrityService {

    private final ProductVariantRepository variantRepository;
    private final ProductRepository productRepository;
    private final InventoryStockSyncService stockSyncService;

    @Transactional
    public Map<String, Object> reconcileTenant(String tenantId) {
        int fixed = 0;
        int checked = 0;
        Map<String, Integer> mismatches = new HashMap<>();

        for (Product product : productRepository.findByTenantId(tenantId)) {
            for (ProductVariant variant : variantRepository.findByProductId(product.getId())) {
                checked++;
                int batchTotal = stockSyncService.sumActiveBatchQuantity(tenantId, variant.getId());
                int displayed = variant.getStockQuantity();
                if (batchTotal != displayed) {
                    mismatches.put(variant.getId(), displayed - batchTotal);
                    stockSyncService.syncVariantFromBatches(tenantId, variant.getId());
                    fixed++;
                }
            }
        }

        log.info("Inventory reconcile tenant {}: checked={}, fixed={}", tenantId, checked, fixed);
        Map<String, Object> result = new HashMap<>();
        result.put("tenantId", tenantId);
        result.put("variantsChecked", checked);
        result.put("variantsResynced", fixed);
        result.put("priorMismatches", mismatches);
        return result;
    }

    @Transactional(readOnly = true)
    public boolean isVariantAligned(String tenantId, String variantId) {
        ProductVariant variant = variantRepository.findById(variantId).orElse(null);
        if (variant == null) return true;
        int batchTotal = stockSyncService.sumActiveBatchQuantity(tenantId, variantId);
        return batchTotal == variant.getStockQuantity();
    }
}
