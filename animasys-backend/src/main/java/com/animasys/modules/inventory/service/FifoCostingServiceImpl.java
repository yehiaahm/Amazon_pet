package com.animasys.modules.inventory.service;

import com.animasys.core.exception.BusinessRuleException;
import com.animasys.core.exception.InsufficientStockException;
import com.animasys.core.exception.ResourceNotFoundException;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.iam.repository.TenantRepository;
import com.animasys.modules.inventory.domain.InventoryBatch;
import com.animasys.modules.inventory.domain.InventoryDeductionStrategy;
import com.animasys.modules.inventory.domain.InventoryLedgerTransaction;
import com.animasys.modules.inventory.domain.ProductVariant;
import com.animasys.modules.inventory.domain.PurchaseInvoice;
import com.animasys.modules.inventory.domain.Supplier;
import com.animasys.modules.inventory.dto.InventoryValuationReportDTO;
import com.animasys.modules.inventory.repository.InventoryBatchRepository;
import com.animasys.modules.inventory.repository.InventoryLedgerTransactionRepository;
import com.animasys.modules.inventory.repository.ProductVariantRepository;
import com.animasys.modules.inventory.repository.PurchaseInvoiceRepository;
import com.animasys.modules.inventory.repository.SupplierRepository;
import com.animasys.modules.sales.domain.SaleItem;
import com.animasys.modules.sales.domain.SaleItemBatchAllocation;
import com.animasys.modules.sales.repository.SaleItemBatchAllocationRepository;
import com.animasys.modules.sales.repository.SaleItemRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class FifoCostingServiceImpl implements FifoCostingService {

    private final InventoryBatchRepository batchRepository;
    private final SaleItemBatchAllocationRepository allocationRepository;
    private final InventoryLedgerTransactionRepository ledgerRepository;
    private final ProductVariantRepository productVariantRepository;
    private final SupplierRepository supplierRepository;
    private final SaleItemRepository saleItemRepository;
    private final PurchaseInvoiceRepository purchaseInvoiceRepository;
    private final TenantRepository tenantRepository;
    private final InventoryStockSyncService stockSyncService;
    private final CatalogPersistenceService catalogPersistenceService;

    @Override
    @Transactional(readOnly = true)
    public int getAvailableBatchQuantity(String tenantId, String productVariantId) {
        return stockSyncService.sumActiveBatchQuantity(tenantId, productVariantId);
    }

    @Override
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public InventoryBatch createOpeningBatch(
            String tenantId,
            String warehouseId,
            String productVariantId,
            BigDecimal unitCost,
            int quantity,
            LocalDate expiryDate,
            String batchNumber,
            String employeeId
    ) {
        return persistBatchWithLedger(
                tenantId,
                warehouseId,
                productVariantId,
                null,
                null,
                batchNumber,
                unitCost,
                quantity,
                expiryDate,
                Instant.now(),
                employeeId,
                InventoryLedgerTransaction.TransactionType.OPENING_ADJUSTMENT,
                "STOCK_ADJUSTMENT",
                null
        );
    }

    @Override
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public InventoryBatch createPurchaseBatch(
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
    ) {
        return persistBatchWithLedger(
                tenantId,
                warehouseId,
                productVariantId,
                supplierId,
                purchaseInvoiceId,
                batchNumber,
                unitCost,
                quantity,
                expiryDate,
                purchaseDate,
                employeeId,
                InventoryLedgerTransaction.TransactionType.PURCHASE_RECEIPT,
                "PURCHASE_INVOICE",
                purchaseInvoiceId
        );
    }

    private InventoryBatch persistBatchWithLedger(
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
            String employeeId,
            InventoryLedgerTransaction.TransactionType ledgerType,
            String referenceType,
            String referenceId
    ) {
        if (unitCost == null || unitCost.compareTo(BigDecimal.ZERO) < 0) {
            throw new BusinessRuleException("Unit cost must be a non-negative value");
        }
        if (quantity <= 0) {
            throw new BusinessRuleException("Quantity must be greater than zero");
        }
        if (productVariantId == null || productVariantId.isBlank()) {
            throw new BusinessRuleException("Product variant id is required");
        }

        log.info("Creating purchase batch [{}] for product variant [{}] with qty {} @ {}",
                batchNumber, productVariantId, quantity, unitCost);

        ProductVariant productVariant = requirePersistedProductVariant(productVariantId);

        Supplier supplier = null;
        if (supplierId != null) {
            supplier = supplierRepository.findById(supplierId).orElse(null);
        }

        PurchaseInvoice purchaseInvoice = null;
        if (purchaseInvoiceId != null && !purchaseInvoiceId.isBlank()) {
            purchaseInvoice = purchaseInvoiceRepository.findById(purchaseInvoiceId)
                    .orElseThrow(() -> new ResourceNotFoundException("Purchase invoice not found: " + purchaseInvoiceId));
            if (supplier == null && purchaseInvoice.getSupplier() != null) {
                supplier = purchaseInvoice.getSupplier();
            }
        }

        Instant effectivePurchaseDate = purchaseDate != null ? purchaseDate : Instant.now();

        InventoryBatch batch = InventoryBatch.builder()
                .id(UUID.randomUUID().toString())
                .tenantId(tenantId)
                .productVariant(productVariant)
                .supplier(supplier)
                .purchaseInvoice(purchaseInvoice)
                .batchNumber(batchNumber)
                .unitCost(unitCost)
                .initialQuantity(quantity)
                .remainingQuantity(quantity)
                .purchaseDate(effectivePurchaseDate)
                .expiryDate(expiryDate)
                .status(InventoryBatch.BatchStatus.ACTIVE)
                .build();

        InventoryBatch savedBatch = batchRepository.save(batch);

        productVariantRepository.findById(productVariantId).ifPresent(v -> {
            v.setCost(unitCost);
            productVariantRepository.save(v);
        });

        BigDecimal totalCost = unitCost.multiply(BigDecimal.valueOf(quantity));
        String effectiveReferenceId = referenceId != null && !referenceId.isBlank()
                ? referenceId
                : savedBatch.getId();
        InventoryLedgerTransaction ledgerTx = InventoryLedgerTransaction.builder()
                .id(UUID.randomUUID().toString())
                .tenantId(tenantId)
                .warehouseId(warehouseId)
                .productVariant(productVariant)
                .inventoryBatch(savedBatch)
                .transactionType(ledgerType)
                .referenceType(referenceType)
                .referenceId(effectiveReferenceId)
                .quantityChange(quantity)
                .unitCost(unitCost)
                .totalCost(totalCost)
                .employeeId(employeeId)
                .createdAt(Instant.now())
                .build();

        ledgerRepository.save(ledgerTx);
        stockSyncService.syncVariantFromBatches(tenantId, productVariantId);

        return savedBatch;
    }

    @Override
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public List<SaleItemBatchAllocation> allocateSaleItemFifo(
            String tenantId,
            String warehouseId,
            SaleItem saleItem,
            String employeeId
    ) {
        String productVariantId = saleItem.getItemId();
        int quantityRequested = saleItem.getQuantity();

        if (quantityRequested <= 0) {
            throw new BusinessRuleException("Requested sale quantity must be greater than zero");
        }

        log.info("Executing batch allocation for SaleItem [{}] ProductVariant [{}] Qty [{}]",
                saleItem.getId(), productVariantId, quantityRequested);

        List<InventoryBatch> activeBatches = lockActiveBatchesInDeductionOrder(tenantId, productVariantId);

        int totalAvailable = activeBatches.stream()
                .mapToInt(InventoryBatch::getRemainingQuantity)
                .sum();

        if (totalAvailable < quantityRequested) {
            throw new InsufficientStockException(productVariantId, quantityRequested, totalAvailable);
        }

        int remainingToDeduct = quantityRequested;
        BigDecimal totalLineCogs = BigDecimal.ZERO;
        List<SaleItemBatchAllocation> allocations = new ArrayList<>();

        for (InventoryBatch batch : activeBatches) {
            if (remainingToDeduct <= 0) break;

            int deductQty = Math.min(batch.getRemainingQuantity(), remainingToDeduct);
            BigDecimal batchUnitCost = batch.getUnitCost();
            BigDecimal allocatedCost = batchUnitCost.multiply(BigDecimal.valueOf(deductQty));

            batch.deductQuantity(deductQty);
            batchRepository.save(batch);

            SaleItemBatchAllocation allocation = SaleItemBatchAllocation.builder()
                    .id(UUID.randomUUID().toString())
                    .saleItem(saleItem)
                    .inventoryBatch(batch)
                    .quantityAllocated(deductQty)
                    .unitCostAtSale(batchUnitCost)
                    .totalAllocatedCost(allocatedCost)
                    .createdAt(Instant.now())
                    .build();

            allocations.add(allocation);
            totalLineCogs = totalLineCogs.add(allocatedCost);
            remainingToDeduct -= deductQty;

            InventoryLedgerTransaction ledgerTx = InventoryLedgerTransaction.builder()
                    .id(UUID.randomUUID().toString())
                    .tenantId(tenantId)
                    .warehouseId(warehouseId)
                    .productVariant(batch.getProductVariant())
                    .inventoryBatch(batch)
                    .transactionType(InventoryLedgerTransaction.TransactionType.SALE_DEDUCTION)
                    .referenceType("SALE_INVOICE")
                    .referenceId(saleItem.getSale() != null ? saleItem.getSale().getId() : saleItem.getId())
                    .quantityChange(-deductQty)
                    .unitCost(batchUnitCost)
                    .totalCost(allocatedCost)
                    .employeeId(employeeId)
                    .createdAt(Instant.now())
                    .build();

            ledgerRepository.save(ledgerTx);
        }

        allocationRepository.saveAll(allocations);

        BigDecimal unitSellingPrice = saleItem.getPrice();
        BigDecimal totalLineRevenue = unitSellingPrice.multiply(BigDecimal.valueOf(quantityRequested));
        BigDecimal grossProfit = totalLineRevenue.subtract(totalLineCogs);
        BigDecimal unitCogs = totalLineCogs.divide(BigDecimal.valueOf(quantityRequested), 4, RoundingMode.HALF_UP);

        saleItem.setCogs(totalLineCogs);
        saleItem.setGrossProfit(grossProfit);
        saleItem.setUnitCogs(unitCogs);
        saleItem.setCost(unitCogs);
        saleItem.setAllocations(allocations);
        saleItemRepository.save(saleItem);

        stockSyncService.syncVariantFromBatches(tenantId, productVariantId);

        log.info("Batch allocation completed for SaleItem [{}]: Total COGS = {}, Gross Profit = {}",
                saleItem.getId(), totalLineCogs, grossProfit);

        return allocations;
    }

    @Override
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public void deductBatchesForAdjustment(
            String tenantId,
            String warehouseId,
            String productVariantId,
            int quantity,
            String reason,
            String employeeId
    ) {
        if (quantity <= 0) {
            throw new BusinessRuleException("Adjustment deduction quantity must be greater than zero");
        }

        List<InventoryBatch> activeBatches = lockActiveBatchesInDeductionOrder(tenantId, productVariantId);
        int totalAvailable = activeBatches.stream().mapToInt(InventoryBatch::getRemainingQuantity).sum();
        if (totalAvailable < quantity) {
            throw new InsufficientStockException(productVariantId, quantity, totalAvailable);
        }

        int remaining = quantity;
        for (InventoryBatch batch : activeBatches) {
            if (remaining <= 0) break;
            int deductQty = Math.min(batch.getRemainingQuantity(), remaining);
            batch.deductQuantity(deductQty);
            batchRepository.save(batch);
            remaining -= deductQty;

            BigDecimal cost = batch.getUnitCost().multiply(BigDecimal.valueOf(deductQty));
            InventoryLedgerTransaction ledgerTx = InventoryLedgerTransaction.builder()
                    .id(UUID.randomUUID().toString())
                    .tenantId(tenantId)
                    .warehouseId(warehouseId)
                    .productVariant(batch.getProductVariant())
                    .inventoryBatch(batch)
                    .transactionType(InventoryLedgerTransaction.TransactionType.SHRINKAGE_ADJUSTMENT)
                    .referenceType("INVENTORY_ADJUSTMENT")
                    .referenceId(reason != null && !reason.isBlank() ? reason : "COUNT_DISCREPANCY")
                    .quantityChange(-deductQty)
                    .unitCost(batch.getUnitCost())
                    .totalCost(cost)
                    .employeeId(employeeId)
                    .createdAt(Instant.now())
                    .build();
            ledgerRepository.save(ledgerTx);
        }

        stockSyncService.syncVariantFromBatches(tenantId, productVariantId);
    }

    @Override
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public BigDecimal processCustomerReturn(
            String tenantId,
            String warehouseId,
            String saleItemId,
            int quantityReturned,
            String employeeId
    ) {
        if (quantityReturned <= 0) {
            throw new BusinessRuleException("Return quantity must be greater than zero");
        }

        log.info("Processing customer return for SaleItem [{}] Qty [{}]", saleItemId, quantityReturned);

        SaleItem saleItem = saleItemRepository.findById(saleItemId)
                .orElseThrow(() -> new ResourceNotFoundException("SaleItem not found: " + saleItemId));

        List<SaleItemBatchAllocation> allocations = allocationRepository.findBySaleItemId(saleItemId);
        if (allocations.isEmpty()) {
            throw new IllegalStateException("No batch allocations found for sale item " + saleItemId);
        }

        int totalStillAllocated = allocations.stream().mapToInt(SaleItemBatchAllocation::getQuantityAllocated).sum();
        if (quantityReturned > totalStillAllocated) {
            throw new BusinessRuleException(String.format(
                    "Cannot return %d units for SaleItem [%s]. Maximum returnable allocated: %d",
                    quantityReturned, saleItemId, totalStillAllocated));
        }

        int remainingToRestore = quantityReturned;
        BigDecimal totalCogsReversed = BigDecimal.ZERO;

        for (int i = allocations.size() - 1; i >= 0; i--) {
            if (remainingToRestore <= 0) break;

            SaleItemBatchAllocation alloc = allocations.get(i);
            if (alloc.getQuantityAllocated() <= 0) {
                continue;
            }
            InventoryBatch batch = alloc.getInventoryBatch();

            int restoreQty = Math.min(alloc.getQuantityAllocated(), remainingToRestore);
            batch.restoreQuantity(restoreQty);
            batchRepository.save(batch);

            BigDecimal restoredLineCost = alloc.getUnitCostAtSale().multiply(BigDecimal.valueOf(restoreQty));
            totalCogsReversed = totalCogsReversed.add(restoredLineCost);

            int newAllocQty = alloc.getQuantityAllocated() - restoreQty;
            alloc.setQuantityAllocated(newAllocQty);
            alloc.setTotalAllocatedCost(
                    alloc.getUnitCostAtSale().multiply(BigDecimal.valueOf(newAllocQty)));
            allocationRepository.save(alloc);

            remainingToRestore -= restoreQty;

            InventoryLedgerTransaction ledgerTx = InventoryLedgerTransaction.builder()
                    .id(UUID.randomUUID().toString())
                    .tenantId(tenantId)
                    .warehouseId(warehouseId)
                    .productVariant(batch.getProductVariant())
                    .inventoryBatch(batch)
                    .transactionType(InventoryLedgerTransaction.TransactionType.CUSTOMER_RETURN)
                    .referenceType("SALE_RETURN")
                    .referenceId(saleItemId)
                    .quantityChange(restoreQty)
                    .unitCost(batch.getUnitCost())
                    .totalCost(restoredLineCost)
                    .employeeId(employeeId)
                    .createdAt(Instant.now())
                    .build();

            ledgerRepository.save(ledgerTx);
        }

        saleItem.setQuantityReturned(saleItem.getQuantityReturned() + quantityReturned);
        saleItem.setCogs(saleItem.getCogs().subtract(totalCogsReversed).max(BigDecimal.ZERO));
        int stillSold = saleItem.getQuantity() - saleItem.getQuantityReturned();
        BigDecimal netRevenue = saleItem.getPrice().multiply(BigDecimal.valueOf(stillSold));
        if (stillSold > 0 && saleItem.getCogs().compareTo(BigDecimal.ZERO) > 0) {
            saleItem.setUnitCogs(saleItem.getCogs().divide(
                    BigDecimal.valueOf(stillSold), 4, RoundingMode.HALF_UP));
        } else {
            saleItem.setUnitCogs(BigDecimal.ZERO);
        }
        saleItem.setGrossProfit(netRevenue.subtract(saleItem.getCogs()));
        saleItemRepository.save(saleItem);

        stockSyncService.syncVariantFromBatches(tenantId, saleItem.getItemId());
        return totalCogsReversed;
    }

    @Override
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public void processInventoryWriteOff(
            String tenantId,
            String warehouseId,
            String inventoryBatchId,
            int quantity,
            String reason,
            String employeeId
    ) {
        if (quantity <= 0) {
            throw new BusinessRuleException("Write-off quantity must be greater than zero");
        }

        InventoryBatch batch = batchRepository.findById(inventoryBatchId)
                .orElseThrow(() -> new ResourceNotFoundException("InventoryBatch not found: " + inventoryBatchId));

        if (!tenantId.equals(batch.getTenantId())) {
            throw new BusinessRuleException("Unauthorized batch access");
        }
        if (quantity > batch.getRemainingQuantity()) {
            throw new InsufficientStockException(
                    batch.getProductVariant().getId(),
                    quantity,
                    batch.getRemainingQuantity()
            );
        }

        batch.deductQuantity(quantity);
        batchRepository.save(batch);

        BigDecimal writeOffCost = batch.getUnitCost().multiply(BigDecimal.valueOf(quantity));

        InventoryLedgerTransaction.TransactionType txType = "EXPIRED".equalsIgnoreCase(reason)
                ? InventoryLedgerTransaction.TransactionType.EXPIRED_WRITE_OFF
                : InventoryLedgerTransaction.TransactionType.SHRINKAGE_ADJUSTMENT;

        InventoryLedgerTransaction ledgerTx = InventoryLedgerTransaction.builder()
                .id(UUID.randomUUID().toString())
                .tenantId(tenantId)
                .warehouseId(warehouseId)
                .productVariant(batch.getProductVariant())
                .inventoryBatch(batch)
                .transactionType(txType)
                .referenceType("INVENTORY_ADJUSTMENT")
                .referenceId(UUID.randomUUID().toString())
                .quantityChange(-quantity)
                .unitCost(batch.getUnitCost())
                .totalCost(writeOffCost)
                .employeeId(employeeId)
                .createdAt(Instant.now())
                .build();

        ledgerRepository.save(ledgerTx);
        stockSyncService.syncVariantFromBatches(tenantId, batch.getProductVariant().getId());
    }

    @Override
    @Transactional(readOnly = true)
    public BigDecimal calculateInventoryValuation(String tenantId) {
        return batchRepository.calculateTotalValuation(tenantId);
    }

    @Override
    @Transactional(readOnly = true)
    public List<InventoryBatch> getActiveBatches(String tenantId, String productVariantId) {
        return batchRepository.findByTenantIdAndProductVariantIdAndRemainingQuantityGreaterThanAndStatusOrderByPurchaseDateAscIdAsc(
                tenantId, productVariantId, 0, InventoryBatch.BatchStatus.ACTIVE);
    }

    @Override
    @Transactional(readOnly = true)
    public List<InventoryLedgerTransaction> getInventoryLedger(String tenantId, String productVariantId) {
        return ledgerRepository.findByTenantIdAndProductVariantIdOrderByCreatedAtDesc(tenantId, productVariantId);
    }

    @Override
    @Transactional(readOnly = true)
    public List<InventoryLedgerTransaction> getTenantLedger(String tenantId) {
        return ledgerRepository.findByTenantIdOrderByCreatedAtDesc(tenantId);
    }

    @Override
    @Transactional(readOnly = true)
    public InventoryValuationReportDTO buildValuationReport(String tenantId) {
        List<InventoryBatch> activeBatches = batchRepository
                .findByTenantIdAndStatusAndRemainingQuantityGreaterThanOrderByPurchaseDateAsc(
                        tenantId, InventoryBatch.BatchStatus.ACTIVE, 0);

        BigDecimal totalValuation = BigDecimal.ZERO;
        int totalQuantity = 0;
        List<InventoryValuationReportDTO.BatchValuationSummary> summaries = new ArrayList<>();

        for (InventoryBatch batch : activeBatches) {
            int qty = batch.getRemainingQuantity();
            BigDecimal unitCost = batch.getUnitCost() != null ? batch.getUnitCost() : BigDecimal.ZERO;
            BigDecimal lineValue = unitCost.multiply(BigDecimal.valueOf(qty));
            totalValuation = totalValuation.add(lineValue);
            totalQuantity += qty;

            ProductVariant variant = batch.getProductVariant();
            summaries.add(InventoryValuationReportDTO.BatchValuationSummary.builder()
                    .batchId(batch.getId())
                    .batchNumber(batch.getBatchNumber())
                    .productVariantId(variant != null ? variant.getId() : null)
                    .productVariantName(variant != null ? variant.getName() : null)
                    .remainingQuantity(qty)
                    .unitCost(unitCost)
                    .totalCostValue(lineValue)
                    .purchaseDate(batch.getPurchaseDate())
                    .build());
        }

        return InventoryValuationReportDTO.builder()
                .tenantId(tenantId)
                .totalValuation(totalValuation)
                .totalActiveBatches(activeBatches.size())
                .totalQuantityInStock(totalQuantity)
                .generatedAt(Instant.now())
                .batchSummaries(summaries)
                .build();
    }

    /**
     * Flush pending catalog writes in this transaction, then load a managed variant row.
     * Avoids {@code getReferenceById} / {@code existsById} before flush (auto-flush + transient FK errors).
     */
    private ProductVariant requirePersistedProductVariant(String productVariantId) {
        catalogPersistenceService.ensureVariantRowExists(productVariantId);
        productVariantRepository.flush();
        return productVariantRepository.findById(productVariantId)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "ProductVariant not found (save variant before creating batch): " + productVariantId));
    }

    private List<InventoryBatch> lockActiveBatchesInDeductionOrder(String tenantId, String productVariantId) {
        Tenant tenant = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Tenant not found: " + tenantId));
        InventoryDeductionStrategy strategy = InventoryDeductionStrategy.FIFO;
        if (tenant.getInventoryDeductionStrategy() != null
                && InventoryDeductionStrategy.FEFO.name().equalsIgnoreCase(tenant.getInventoryDeductionStrategy())) {
            strategy = InventoryDeductionStrategy.FEFO;
        }
        if (strategy == InventoryDeductionStrategy.FEFO) {
            return batchRepository.findActiveBatchesForUpdateFefo(tenantId, productVariantId);
        }
        return batchRepository.findActiveBatchesForUpdate(tenantId, productVariantId);
    }
}
