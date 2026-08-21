package com.animasys.modules.inventory.repository;

import com.animasys.modules.inventory.domain.InventoryBatch;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

@Repository
public interface InventoryBatchRepository extends JpaRepository<InventoryBatch, String> {

    /**
     * Retrieves active batches for a product variant ordered by purchase date (FIFO order)
     * using PESSIMISTIC_WRITE lock (SELECT ... FOR UPDATE) to prevent concurrent checkout race conditions.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
        SELECT b FROM InventoryBatch b 
        WHERE b.tenantId = :tenantId 
          AND b.warehouse.id = :warehouseId
          AND b.productVariant.id = :productVariantId 
          AND b.remainingQuantity > 0 
          AND b.status = 'ACTIVE' 
        ORDER BY b.purchaseDate ASC, b.id ASC
    """)
    List<InventoryBatch> findActiveBatchesForUpdate(
        @Param("tenantId") String tenantId,
        @Param("warehouseId") String warehouseId,
        @Param("productVariantId") String productVariantId
    );

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
        SELECT b FROM InventoryBatch b 
        WHERE b.tenantId = :tenantId 
          AND b.warehouse.id = :warehouseId
          AND b.productVariant.id = :productVariantId 
          AND b.remainingQuantity > 0 
          AND b.status = 'ACTIVE' 
        ORDER BY CASE WHEN b.expiryDate IS NULL THEN 1 ELSE 0 END, b.expiryDate ASC, b.purchaseDate ASC, b.id ASC
    """)
    List<InventoryBatch> findActiveBatchesForUpdateFefo(
        @Param("tenantId") String tenantId,
        @Param("warehouseId") String warehouseId,
        @Param("productVariantId") String productVariantId
    );

    /**
     * Active batches this specific purchase invoice created for this variant, locked for update.
     * Used for supplier returns — scoped to the invoice being returned, not tenant-wide FIFO order.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
        SELECT b FROM InventoryBatch b
        WHERE b.tenantId = :tenantId
          AND b.purchaseInvoice.id = :purchaseInvoiceId
          AND b.productVariant.id = :productVariantId
          AND b.remainingQuantity > 0
          AND b.status = 'ACTIVE'
        ORDER BY b.purchaseDate ASC, b.id ASC
    """)
    List<InventoryBatch> findActiveBatchesForPurchaseReturn(
        @Param("tenantId") String tenantId,
        @Param("purchaseInvoiceId") String purchaseInvoiceId,
        @Param("productVariantId") String productVariantId
    );

    @Query("""
        SELECT COALESCE(SUM(b.remainingQuantity), 0)
        FROM InventoryBatch b
        WHERE b.tenantId = :tenantId
          AND b.productVariant.id = :productVariantId
          AND b.status = :status
          AND b.remainingQuantity > 0
    """)
    int sumRemainingQuantityByTenantAndVariantAndStatus(
        @Param("tenantId") String tenantId,
        @Param("productVariantId") String productVariantId,
        @Param("status") InventoryBatch.BatchStatus status
    );

    @Query("""
        SELECT COALESCE(SUM(b.remainingQuantity), 0) 
        FROM InventoryBatch b 
        WHERE b.tenantId = :tenantId 
          AND b.warehouse.id = :warehouseId
          AND b.productVariant.id = :productVariantId 
          AND b.status = :status 
          AND b.remainingQuantity > 0
    """)
    int sumRemainingQuantityByTenantAndWarehouseAndVariantAndStatus(
        @Param("tenantId") String tenantId,
        @Param("warehouseId") String warehouseId,
        @Param("productVariantId") String productVariantId,
        @Param("status") InventoryBatch.BatchStatus status
    );

    List<InventoryBatch> findByTenantIdAndRemainingQuantityGreaterThanOrderByPurchaseDateAsc(
        String tenantId, int minQty
    );

    List<InventoryBatch> findByTenantIdAndStatusAndRemainingQuantityGreaterThanOrderByPurchaseDateAsc(
        String tenantId, InventoryBatch.BatchStatus status, int minQty
    );

    /**
     * Optimized aggregate valuation query computed entirely inside MySQL DB.
     */
    @Query("""
        SELECT COALESCE(SUM(b.unitCost * b.remainingQuantity), 0.0000) 
        FROM InventoryBatch b 
        WHERE b.tenantId = :tenantId 
          AND b.status = 'ACTIVE' 
          AND b.remainingQuantity > 0
    """)
    BigDecimal calculateTotalValuation(@Param("tenantId") String tenantId);

    List<InventoryBatch> findByTenantIdAndProductVariantIdAndRemainingQuantityGreaterThanAndStatusOrderByPurchaseDateAscIdAsc(
        String tenantId, String productVariantId, int minQty, InventoryBatch.BatchStatus status
    );

    List<InventoryBatch> findByTenantIdAndStatus(String tenantId, InventoryBatch.BatchStatus status);

    List<InventoryBatch> findByTenantIdAndExpiryDateBeforeAndRemainingQuantityGreaterThan(
        String tenantId, LocalDate date, int minQty
    );

    List<InventoryBatch> findByProductVariantId(String productVariantId);
}
