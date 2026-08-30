package com.animasys.modules.inventory.service;

import com.animasys.modules.inventory.dto.InventoryValuationReportDTO;
import com.animasys.modules.inventory.domain.InventoryBatch;
import com.animasys.modules.inventory.domain.InventoryLedgerTransaction;
import com.animasys.modules.sales.domain.SaleItem;
import com.animasys.modules.sales.domain.SaleItemBatchAllocation;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public interface FifoCostingService {

    /**
     * Creates a new purchase batch (cost layer) upon goods receipt.
     */
    InventoryBatch createPurchaseBatch(
        String tenantId,
        String warehouseId,
        String productVariantId,
        String supplierId,
        String purchaseInvoiceId,
        String batchNumber,
        BigDecimal unitCost,
        int quantity,
        LocalDate expiryDate,
        Instant purchaseDate,
        String employeeId
    );

    /** Opening / import stock without a purchase invoice document. */
    InventoryBatch createOpeningBatch(
        String tenantId,
        String warehouseId,
        String productVariantId,
        BigDecimal unitCost,
        int quantity,
        LocalDate expiryDate,
        String batchNumber,
        String employeeId
    );

    int getAvailableBatchQuantity(String tenantId, String productVariantId);

    /**
     * Warehouse-scoped stock check. Must be used wherever the caller will subsequently
     * allocate via {@link #allocateSaleItemFifo}, since that deduction is warehouse-scoped —
     * a tenant-wide total here can say "in stock" while the actual warehouse has none.
     */
    int getAvailableBatchQuantity(String tenantId, String warehouseId, String productVariantId);

    /**
     * Allocates stock for a sale item using FIFO/FEFO deduction with pessimistic DB locks.
     */
    List<SaleItemBatchAllocation> allocateSaleItemFifo(
        String tenantId,
        String warehouseId,
        SaleItem saleItem,
        String employeeId
    );

    /**
     * Deducts quantity from batches (FIFO/FEFO) for manual negative stock adjustments.
     */
    void deductBatchesForAdjustment(
        String tenantId,
        String warehouseId,
        String productVariantId,
        int quantity,
        String reason,
        String employeeId
    );

    /**
     * Handles customer return by restoring allocated batch stock in reverse-FIFO order.
     * @return total COGS reversed for the returned quantity
     */
    BigDecimal processCustomerReturn(
        String tenantId,
        String warehouseId,
        String saleItemId,
        int quantityReturned,
        String employeeId
    );

    /**
     * Handles a supplier return by deducting stock from the batch(es) that this specific
     * purchase invoice created for this product variant (not arbitrary tenant-wide FIFO stock).
     * @param quantity return quantity in batch/individual units (already multiplied by conversionFactor)
     * @return total cost value reversed for the returned quantity
     */
    BigDecimal processSupplierReturn(
        String tenantId,
        String purchaseInvoiceId,
        String productVariantId,
        int quantity,
        String employeeId
    );

    /**
     * Handles stock adjustment (shrinkage/damaged/expired write-off).
     */
    void processInventoryWriteOff(
        String tenantId,
        String warehouseId,
        String inventoryBatchId,
        int quantity,
        String reason,
        String employeeId
    );

    /**
     * Calculates the total inventory asset valuation for a tenant across active batches.
     */
    BigDecimal calculateInventoryValuation(String tenantId);

    /**
     * Retrieves active inventory batches for a product variant.
     */
    List<InventoryBatch> getActiveBatches(String tenantId, String productVariantId);

    /**
     * Retrieves the complete immutable inventory movement ledger for auditing.
     */
    List<InventoryLedgerTransaction> getInventoryLedger(String tenantId, String productVariantId);

    List<InventoryLedgerTransaction> getTenantLedger(String tenantId);

    InventoryValuationReportDTO buildValuationReport(String tenantId);
}
