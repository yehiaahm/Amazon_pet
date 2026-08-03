package com.animasys.modules.inventory.service;

import com.animasys.modules.inventory.domain.InventoryBatch;
import com.animasys.modules.inventory.domain.Product;
import com.animasys.modules.inventory.domain.ProductVariant;
import com.animasys.modules.inventory.dto.InventoryBatchResponseDTO;
import com.animasys.modules.inventory.dto.LowStockAlertDTO;
import com.animasys.modules.inventory.repository.InventoryBatchRepository;
import com.animasys.modules.inventory.repository.ProductRepository;
import com.animasys.modules.inventory.repository.ProductVariantRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

@Service
@RequiredArgsConstructor
public class InventoryInsightsService {

    private final ProductRepository productRepository;
    private final ProductVariantRepository variantRepository;
    private final InventoryBatchRepository batchRepository;

    @Transactional(readOnly = true)
    public List<LowStockAlertDTO> getLowStockAlerts(String tenantId) {
        List<LowStockAlertDTO> alerts = new ArrayList<>();

        for (Product product : productRepository.findByTenantId(tenantId)) {
            for (ProductVariant variant : variantRepository.findByProductId(product.getId())) {
                int stock = variant.getStockQuantity();
                int minLimit = product.getMinStockLimit();
                if (stock < minLimit) {
                    alerts.add(LowStockAlertDTO.builder()
                            .productVariantId(variant.getId())
                            .productId(product.getId())
                            .sku(variant.getSku())
                            .productName(product.getName())
                            .variantName(variant.getName())
                            .stockQuantity(stock)
                            .minStockLimit(minLimit)
                            .deficit(minLimit - stock)
                            .cost(variant.getCost())
                            .price(variant.getPrice())
                            .build());
                }
            }
        }

        alerts.sort(Comparator.comparingInt(LowStockAlertDTO::getDeficit).reversed());
        return alerts;
    }

    @Transactional(readOnly = true)
    public List<InventoryBatchResponseDTO> getExpiringBatches(String tenantId, int withinDays) {
        LocalDate cutoff = LocalDate.now().plusDays(Math.max(1, withinDays));
        List<InventoryBatch> batches = batchRepository
                .findByTenantIdAndExpiryDateBeforeAndRemainingQuantityGreaterThan(tenantId, cutoff, 0);

        return batches.stream()
                .filter(batch -> batch.getExpiryDate() != null
                        && batch.getStatus() == InventoryBatch.BatchStatus.ACTIVE)
                .sorted(Comparator.comparing(InventoryBatch::getExpiryDate))
                .map(batch -> InventoryBatchResponseDTO.builder()
                        .id(batch.getId())
                        .productVariantId(batch.getProductVariant() != null ? batch.getProductVariant().getId() : null)
                        .batchNumber(batch.getBatchNumber())
                        .expiryDate(batch.getExpiryDate())
                        .quantity(batch.getRemainingQuantity())
                        .initialQuantity(batch.getInitialQuantity())
                        .unitCost(batch.getUnitCost())
                        .purchaseDate(batch.getPurchaseDate())
                        .status(batch.getStatus() != null ? batch.getStatus().name() : null)
                        .purchaseInvoiceId(batch.getPurchaseInvoice() != null ? batch.getPurchaseInvoice().getId() : null)
                        .supplierId(batch.getSupplier() != null ? batch.getSupplier().getId() : null)
                        .build())
                .toList();
    }
}
