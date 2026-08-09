package com.animasys.modules.sales.service;

import com.animasys.core.audit.AuditLogRepository;
import com.animasys.core.exception.InsufficientStockException;
import com.animasys.modules.crm.repository.CustomerRepository;
import com.animasys.modules.iam.domain.Branch;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.iam.repository.EmployeeRepository;
import com.animasys.modules.inventory.repository.ProductVariantRepository;
import com.animasys.modules.inventory.service.FifoCostingService;
import com.animasys.modules.inventory.service.InventoryIntegrityService;
import com.animasys.modules.inventory.service.StockService;
import com.animasys.modules.sales.domain.POSSession;
import com.animasys.modules.sales.domain.Sale;
import com.animasys.modules.sales.domain.SaleItem;
import com.animasys.modules.sales.domain.SaleItemBatchAllocation;
import com.animasys.modules.sales.dto.SaleRefundLineRequest;
import com.animasys.modules.sales.dto.SaleRefundResult;
import com.animasys.modules.sales.repository.POSSessionRepository;
import com.animasys.modules.sales.repository.SaleItemBatchAllocationRepository;
import com.animasys.modules.sales.repository.SaleItemRepository;
import com.animasys.modules.sales.repository.SaleRepository;
import com.animasys.modules.services.repository.GroomingServiceRepository;
import com.animasys.modules.inventory.repository.WarehouseRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.authentication.AuthenticationManager;

import java.math.BigDecimal;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class SaleServiceRefundTest {

    @Mock private SaleRepository saleRepository;
    @Mock private SaleItemRepository itemRepository;
    @Mock private POSSessionRepository sessionRepository;
    @Mock private EmployeeRepository employeeRepository;
    @Mock private CustomerRepository customerRepository;
    @Mock private ProductVariantRepository variantRepository;
    @Mock private GroomingServiceRepository groomingServiceRepository;
    @Mock private StockService stockService;
    @Mock private FifoCostingService fifoCostingService;
    @Mock private InventoryIntegrityService inventoryIntegrityService;
    @Mock private AuditLogRepository auditLogRepository;
    @Mock private ApplicationEventPublisher eventPublisher;
    @Mock private SaleItemBatchAllocationRepository saleItemBatchAllocationRepository;
    @Mock private AuthenticationManager authenticationManager;
    @Mock private WarehouseRepository warehouseRepository;

    @InjectMocks
    private SaleService saleService;

    private Employee employee;
    private Tenant tenant;
    private Branch branch;
    private POSSession session;
    private Sale sale;
    private SaleItem saleItem;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);

        tenant = Tenant.builder().id("t-refund").name("Refund Tenant").subdomain("refund").build();
        branch = Branch.builder().id("b-refund").tenant(tenant).name("Main").build();
        employee = Employee.builder()
                .id("e-refund")
                .username("refund_user")
                .fullName("Refund User")
                .role("MANAGER")
                .tenant(tenant)
                .branch(branch)
                .active(true)
                .build();
        session = POSSession.builder()
                .id("ps-refund")
                .branch(branch)
                .status("OPEN")
                .openingBalance(BigDecimal.TEN)
                .build();

        saleItem = SaleItem.builder()
                .id("si-1")
                .type("PRODUCT")
                .itemId("v-1")
                .name("Brush")
                .quantity(3)
                .price(new BigDecimal("10.00"))
                .listPrice(new BigDecimal("10.00"))
                .cost(new BigDecimal("4.00"))
                .build();

        sale = Sale.builder()
                .id("sale-1")
                .saleNumber("INV-100")
                .posSession(session)
                .employee(employee)
                .totalAmount(new BigDecimal("30.00"))
                .tax(BigDecimal.ZERO)
                .discount(BigDecimal.ZERO)
                .paymentMethod("CASH")
                .status("COMPLETED")
                .items(List.of(saleItem))
                .build();
        saleItem.setSale(sale);

        when(employeeRepository.findById("e-refund")).thenReturn(Optional.of(employee));
        when(saleRepository.findByIdAndTenantId("sale-1", "t-refund")).thenReturn(Optional.of(sale));
        AtomicInteger allocationLookups = new AtomicInteger(0);
        when(saleItemBatchAllocationRepository.findBySaleItemId("si-1")).thenAnswer(invocation -> {
            if (allocationLookups.incrementAndGet() <= 2) {
                return List.of(SaleItemBatchAllocation.builder().quantityAllocated(3).build());
            }
            return Collections.emptyList();
        });
        when(auditLogRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(saleRepository.saveAndFlush(any(Sale.class))).thenAnswer(invocation -> invocation.getArgument(0));

        com.animasys.modules.inventory.domain.Warehouse wh = com.animasys.modules.inventory.domain.Warehouse.builder().id(StockService.DEFAULT_SALES_WAREHOUSE).branch(branch).name("Main WH").build();
        when(warehouseRepository.findByBranchId("b-refund")).thenReturn(List.of(wh));
    }

    @Test
    void partialRefundUpdatesStatusAndAmount() {
        when(fifoCostingService.processCustomerReturn(
                eq("t-refund"), eq(StockService.DEFAULT_SALES_WAREHOUSE), eq("si-1"), eq(1), eq("e-refund")))
                .thenReturn(new BigDecimal("4.00"));

        SaleRefundResult result = saleService.refundSale(
                "sale-1",
                "e-refund",
                List.of(SaleRefundLineRequest.builder().saleItemId("si-1").quantity(1).build())
        );

        assertFalse(result.isFullRefund());
        assertEquals("PARTIALLY_REFUNDED", result.getSale().getStatus());
        assertEquals(0, new BigDecimal("10.00").compareTo(result.getRefundAmount()));
        assertEquals(0, new BigDecimal("4.00").compareTo(result.getCogsReversed()));
        verify(eventPublisher).publishEvent(any());
    }

    @Test
    void fullRefundMarksSaleRefunded() {
        when(fifoCostingService.processCustomerReturn(
                eq("t-refund"), eq(StockService.DEFAULT_SALES_WAREHOUSE), eq("si-1"), eq(3), eq("e-refund")))
                .thenAnswer(invocation -> {
                    saleItem.setQuantityReturned(3);
                    return new BigDecimal("12.00");
                });

        SaleRefundResult result = saleService.refundSale("sale-1", "e-refund", null);

        assertTrue(result.isFullRefund());
        assertEquals("REFUNDED", result.getSale().getStatus());
        assertEquals(0, new BigDecimal("30.00").compareTo(result.getRefundAmount()));
        verify(fifoCostingService).processCustomerReturn(
                eq("t-refund"), eq(StockService.DEFAULT_SALES_WAREHOUSE), eq("si-1"), eq(3), eq("e-refund"));
    }

    @Test
    void refundPropagatesInsufficientStockFromFifoReturn() {
        when(fifoCostingService.processCustomerReturn(
                anyString(), anyString(), anyString(), anyInt(), anyString()))
                .thenThrow(new InsufficientStockException("v-1", 1, 0));

        assertThrows(
                InsufficientStockException.class,
                () -> saleService.refundSale(
                        "sale-1",
                        "e-refund",
                        List.of(SaleRefundLineRequest.builder().saleItemId("si-1").quantity(1).build())
                )
        );

        verify(saleRepository, never()).saveAndFlush(any());
        verify(eventPublisher, never()).publishEvent(any());
    }
}
