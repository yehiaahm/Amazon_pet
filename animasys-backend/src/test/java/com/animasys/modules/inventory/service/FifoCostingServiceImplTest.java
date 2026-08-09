package com.animasys.modules.inventory.service;

import com.animasys.core.exception.InsufficientStockException;
import com.animasys.modules.inventory.domain.InventoryBatch;
import com.animasys.modules.inventory.domain.InventoryLedgerTransaction;
import com.animasys.modules.inventory.domain.ProductVariant;
import com.animasys.modules.inventory.repository.InventoryBatchRepository;
import com.animasys.modules.inventory.repository.InventoryLedgerTransactionRepository;
import com.animasys.modules.inventory.repository.ProductVariantRepository;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.iam.repository.TenantRepository;
import com.animasys.modules.inventory.repository.PurchaseInvoiceRepository;
import com.animasys.modules.inventory.repository.SupplierRepository;
import com.animasys.modules.sales.domain.Sale;
import com.animasys.modules.sales.domain.SaleItem;
import com.animasys.modules.sales.domain.SaleItemBatchAllocation;
import com.animasys.modules.sales.repository.SaleItemBatchAllocationRepository;
import com.animasys.modules.sales.repository.SaleItemRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class FifoCostingServiceImplTest {

    @Mock
    private InventoryBatchRepository batchRepository;
    @Mock
    private SaleItemBatchAllocationRepository allocationRepository;
    @Mock
    private InventoryLedgerTransactionRepository ledgerRepository;
    @Mock
    private ProductVariantRepository productVariantRepository;
    @Mock
    private SupplierRepository supplierRepository;
    @Mock
    private SaleItemRepository saleItemRepository;
    @Mock
    private TenantRepository tenantRepository;
    @Mock
    private PurchaseInvoiceRepository purchaseInvoiceRepository;
    @Mock
    private InventoryStockSyncService stockSyncService;

    @InjectMocks
    private FifoCostingServiceImpl fifoCostingService;

    private ProductVariant dogFoodVariant;
    private final String tenantId = "tenant-pet-shop";
    private final String warehouseId = "wh-main";
    private final String employeeId = "emp-001";

    @BeforeEach
    void setUp() {
        dogFoodVariant = ProductVariant.builder()
                .id("pv-royal-canin")
                .name("Royal Canin Dog Food 10kg")
                .price(new BigDecimal("500.00"))
                .cost(new BigDecimal("700.00"))
                .stockQuantity(15)
                .build();
        when(tenantRepository.findById(tenantId)).thenReturn(Optional.of(
                Tenant.builder().id(tenantId).name("Test").subdomain("test").inventoryDeductionStrategy("FIFO").build()
        ));
        doNothing().when(stockSyncService).syncVariantFromBatches(anyString(), anyString());
    }

    @Test
    @DisplayName("User Problem Case: Verify Historical Profit Remains Frozen After Subsequent Lower-Cost Purchase")
    void testUserScenario_HistoricalProfitImmutability() {
        // 1. Setup Purchase #1: 5 units @ 700 EGP
        InventoryBatch batch1 = InventoryBatch.builder()
                .id("batch-1")
                .tenantId(tenantId)
                .productVariant(dogFoodVariant)
                .batchNumber("LOT-2026-001")
                .unitCost(new BigDecimal("700.0000"))
                .initialQuantity(5)
                .remainingQuantity(5)
                .purchaseDate(Instant.now().minusSeconds(3600))
                .status(InventoryBatch.BatchStatus.ACTIVE)
                .build();

        // 2. Setup Sale #1: Customer buys 1 unit @ 500 EGP
        Sale sale1 = Sale.builder().id("sale-001").saleNumber("INV-001").build();
        SaleItem saleItem1 = SaleItem.builder()
                .id("item-001")
                .sale(sale1)
                .type("PRODUCT")
                .itemId(dogFoodVariant.getId())
                .name(dogFoodVariant.getName())
                .quantity(1)
                .price(new BigDecimal("500.0000"))
                .cost(new BigDecimal("700.0000"))
                .build();

        when(batchRepository.findActiveBatchesForUpdate(tenantId, warehouseId, dogFoodVariant.getId()))
                .thenReturn(List.of(batch1));

        // Act - Allocate Sale #1
        List<SaleItemBatchAllocation> allocs1 = fifoCostingService.allocateSaleItemFifo(tenantId, warehouseId, saleItem1, employeeId);

        // Verify Sale #1 financial snapshot
        assertEquals(new BigDecimal("700.0000"), saleItem1.getCogs());
        assertEquals(new BigDecimal("-200.0000"), saleItem1.getGrossProfit());
        assertEquals(4, batch1.getRemainingQuantity());
        assertEquals(1, allocs1.size());

        // 3. Purchase #2 occurs: 10 units @ 200 EGP
        InventoryBatch batch2 = InventoryBatch.builder()
                .id("batch-2")
                .tenantId(tenantId)
                .productVariant(dogFoodVariant)
                .batchNumber("LOT-2026-002")
                .unitCost(new BigDecimal("200.0000"))
                .initialQuantity(10)
                .remainingQuantity(10)
                .purchaseDate(Instant.now())
                .status(InventoryBatch.BatchStatus.ACTIVE)
                .build();

        // Historical Sale #1 must STILL be -200 EGP
        assertEquals(new BigDecimal("-200.0000"), saleItem1.getGrossProfit(), 
                "CRITICAL: Historical sale gross profit must NEVER recalculate after Purchase #2!");

        // 4. Setup Sale #2: Customer buys 6 units @ 500 EGP (Consumes 4 from Batch 1 @ 700 + 2 from Batch 2 @ 200)
        Sale sale2 = Sale.builder().id("sale-002").saleNumber("INV-002").build();
        SaleItem saleItem2 = SaleItem.builder()
                .id("item-002")
                .sale(sale2)
                .type("PRODUCT")
                .itemId(dogFoodVariant.getId())
                .name(dogFoodVariant.getName())
                .quantity(6)
                .price(new BigDecimal("500.0000"))
                .cost(new BigDecimal("200.0000"))
                .build();

        when(batchRepository.findActiveBatchesForUpdate(tenantId, warehouseId, dogFoodVariant.getId()))
                .thenReturn(List.of(batch1, batch2));

        // Act - Allocate Sale #2 across multiple batches
        List<SaleItemBatchAllocation> allocs2 = fifoCostingService.allocateSaleItemFifo(tenantId, warehouseId, saleItem2, employeeId);

        // Revenue = 6 * 500 = 3000 EGP
        // COGS = (4 * 700) + (2 * 200) = 2800 + 400 = 3200 EGP
        // Gross Profit = 3000 - 3200 = -200 EGP
        assertEquals(new BigDecimal("3200.0000"), saleItem2.getCogs());
        assertEquals(new BigDecimal("-200.0000"), saleItem2.getGrossProfit());
        assertEquals(0, batch1.getRemainingQuantity());
        assertEquals(InventoryBatch.BatchStatus.EXHAUSTED, batch1.getStatus());
        assertEquals(8, batch2.getRemainingQuantity());
        assertEquals(2, allocs2.size());
    }

    @Test
    @DisplayName("Should throw InsufficientStockException when requested quantity exceeds active batch balance")
    void testInsufficientStock() {
        InventoryBatch batch = InventoryBatch.builder()
                .id("batch-1")
                .tenantId(tenantId)
                .productVariant(dogFoodVariant)
                .unitCost(new BigDecimal("700.00"))
                .initialQuantity(3)
                .remainingQuantity(3)
                .status(InventoryBatch.BatchStatus.ACTIVE)
                .build();

        SaleItem item = SaleItem.builder()
                .id("item-over")
                .itemId(dogFoodVariant.getId())
                .quantity(5)
                .price(new BigDecimal("500.00"))
                .build();

        when(batchRepository.findActiveBatchesForUpdate(tenantId, warehouseId, dogFoodVariant.getId()))
                .thenReturn(List.of(batch));

        assertThrows(InsufficientStockException.class, () -> 
                fifoCostingService.allocateSaleItemFifo(tenantId, warehouseId, item, employeeId)
        );
    }
}
