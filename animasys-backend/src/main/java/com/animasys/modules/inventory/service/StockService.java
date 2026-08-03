package com.animasys.modules.inventory.service;

import com.animasys.core.exception.BusinessRuleException;
import com.animasys.core.exception.ResourceNotFoundException;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.repository.EmployeeRepository;
import com.animasys.modules.inventory.domain.*;
import com.animasys.modules.inventory.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Optional;

/**
 * Legacy warehouse movement helpers. Quantity truth lives in {@code inventory_batches};
 * use {@link FifoCostingService} + {@link InventoryStockSyncService} for all stock changes.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class StockService {
    public static final String DEFAULT_SALES_WAREHOUSE = "wh-shelf";
    public static final String DEFAULT_RECEIVING_WAREHOUSE = "wh-main";

    private static final String BLOCK_MSG =
            "تعديل المخزون المباشر غير مسموح. استخدم فاتورة الشراء، استيراد المنتجات، أو تعديل الكمية من شاشة المخزون (دفعات FIFO).";

    private final ProductVariantRepository variantRepository;
    private final WarehouseRepository warehouseRepository;
    private final WarehouseStockRepository warehouseStockRepository;
    private final ProductRepository productRepository;
    private final InventoryStockSyncService stockSyncService;

    public ProductVariant updateVariantPricing(
            String tenantId, String variantId, BigDecimal price, BigDecimal cost, BigDecimal wholesalePrice) {
        ProductVariant variant = variantRepository.findById(variantId)
                .orElseThrow(() -> new ResourceNotFoundException("Product Variant not found: " + variantId));

        if (!tenantId.equals(variant.getTenantId())) {
            throw new BusinessRuleException("Unauthorized variant access");
        }

        if (price != null) {
            if (price.compareTo(BigDecimal.ZERO) < 0) {
                throw new BusinessRuleException("سعر البيع لا يمكن أن يكون سالبًا");
            }
            variant.setPrice(price.setScale(2, RoundingMode.HALF_UP));
        }
        if (cost != null) {
            if (cost.compareTo(BigDecimal.ZERO) < 0) {
                throw new BusinessRuleException("التكلفة لا يمكن أن تكون سالبة");
            }
            variant.setCost(cost.setScale(2, RoundingMode.HALF_UP));
        }
        if (wholesalePrice != null) {
            if (wholesalePrice.compareTo(BigDecimal.ZERO) < 0) {
                throw new BusinessRuleException("سعر الجملة لا يمكن أن يكون سالبًا");
            }
            variant.setWholesalePrice(wholesalePrice.setScale(2, RoundingMode.HALF_UP));
        }

        return variantRepository.save(variant);
    }

    /**
     * @deprecated Bypasses FIFO batch layers — blocked for external callers.
     */
    @Deprecated
    public ProductVariant adjustStock(String variantId, String warehouseId, int diff, String type, String employeeId) {
        throw new BusinessRuleException(BLOCK_MSG);
    }

    /** @deprecated Use {@link FifoCostingService#allocateSaleItemFifo}. */
    @Deprecated
    public void deductForSale(String variantId, int quantity, String employeeId) {
        throw new BusinessRuleException(BLOCK_MSG);
    }

    /** @deprecated Use {@link FifoCostingService#processCustomerReturn}. */
    @Deprecated
    public void restoreForRefund(String variantId, int quantity, String employeeId) {
        throw new BusinessRuleException(BLOCK_MSG);
    }

    public int getWarehouseQuantity(String warehouseId, String variantId) {
        return warehouseStockRepository
                .findByWarehouseIdAndProductVariantId(warehouseId, variantId)
                .map(WarehouseStock::getQuantity)
                .orElse(0);
    }

    /**
     * Aligns warehouse + variant display qty with batch layers (never inflates from stale variant.stockQuantity).
     */
    public void ensureMirrored(String variantId) {
        variantRepository.findByIdWithProduct(variantId).ifPresent(variant -> {
            if (variant.getProduct() != null && variant.getProduct().getTenant() != null) {
                stockSyncService.syncVariantFromBatches(
                        variant.getProduct().getTenant().getId(),
                        variantId
                );
            }
        });
    }
}
