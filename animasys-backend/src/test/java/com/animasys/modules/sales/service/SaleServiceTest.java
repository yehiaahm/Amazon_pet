package com.animasys.modules.sales.service;

import com.animasys.core.audit.AuditLogRepository;
import com.animasys.modules.crm.repository.CustomerRepository;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.repository.EmployeeRepository;
import com.animasys.modules.inventory.domain.ProductVariant;
import com.animasys.modules.inventory.repository.ProductVariantRepository;
import com.animasys.modules.inventory.service.FifoCostingService;
import com.animasys.modules.inventory.service.StockService;
import com.animasys.modules.loyalty.service.LoyaltyService;
import com.animasys.modules.iam.domain.Branch;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.sales.domain.*;
import com.animasys.modules.sales.repository.*;
import com.animasys.modules.services.repository.GroomingServiceRepository;
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

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

public class SaleServiceTest {

    @Mock private SaleRepository saleRepository;
    @Mock private SaleItemRepository itemRepository;
    @Mock private POSSessionRepository sessionRepository;
    @Mock private EmployeeRepository employeeRepository;
    @Mock private CustomerRepository customerRepository;
    @Mock private ProductVariantRepository variantRepository;
    @Mock private GroomingServiceRepository groomingServiceRepository;
    @Mock private StockService stockService;
    @Mock private FifoCostingService fifoCostingService;
    @Mock private AuditLogRepository auditLogRepository;
    @Mock private ApplicationEventPublisher eventPublisher;
    @Mock private com.animasys.modules.inventory.service.InventoryIntegrityService inventoryIntegrityService;
    @Mock private SaleItemBatchAllocationRepository saleItemBatchAllocationRepository;
    @Mock private AuthenticationManager authenticationManager;
    @Mock private com.animasys.modules.inventory.repository.WarehouseRepository warehouseRepository;
    @Mock private LoyaltyService loyaltyService;
    @Mock private SalePaymentRepository paymentRepository;

    @InjectMocks
    private SaleService saleService;

    private POSSession session;
    private Employee employee;
    private SaleItem saleItem;
    private ProductVariant variant;

    @BeforeEach
    public void setup() {
        MockitoAnnotations.openMocks(this);

        session = POSSession.builder().id("s-1").status("OPEN").openingBalance(BigDecimal.valueOf(100)).build();
        Tenant tenant = Tenant.builder().id("t-1").name("Test").subdomain("test").build();
        Branch branch = Branch.builder().id("b-1").tenant(tenant).name("Main").build();
        session.setBranch(branch);
        employee = Employee.builder().id("e-1").username("bob").fullName("Bob Johnson").role("CASHIER").tenant(tenant).build();
        saleItem = SaleItem.builder().itemId("v-1").type("PRODUCT").name("Grooming Brush").quantity(1)
                .price(BigDecimal.TEN).cost(BigDecimal.ONE).build();
        variant = ProductVariant.builder().id("v-1").name("Grooming Brush")
                .price(BigDecimal.TEN).cost(BigDecimal.ONE).stockQuantity(5).build();

        when(loyaltyService.resolveRedemption(any(), any(), any(), any())).thenReturn(BigDecimal.ZERO);
        when(paymentRepository.save(any(SalePayment.class))).thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    public void testCreateSaleSuccess() {
        when(sessionRepository.findById("s-1")).thenReturn(Optional.of(session));
        when(employeeRepository.findById("e-1")).thenReturn(Optional.of(employee));
        when(variantRepository.findByIdWithProduct("v-1")).thenReturn(Optional.of(variant));
        when(saleRepository.save(any(Sale.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(itemRepository.save(any(SaleItem.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(auditLogRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        doNothing().when(stockService).ensureMirrored(anyString());
        when(fifoCostingService.getAvailableBatchQuantity(eq("t-1"), eq("wh-1"), eq("v-1"))).thenReturn(5);
        when(fifoCostingService.allocateSaleItemFifo(eq("t-1"), anyString(), any(), eq("e-1"))).thenReturn(List.of());

        com.animasys.modules.inventory.domain.Warehouse wh = com.animasys.modules.inventory.domain.Warehouse.builder().id("wh-1").branch(session.getBranch()).name("Main WH").build();
        when(warehouseRepository.findByBranchId("b-1")).thenReturn(List.of(wh));

        Sale sale = saleService.createSale(
                "s-1",
                "e-1",
                null,
                BigDecimal.TEN,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                "CASH",
                Collections.singletonList(saleItem)
        );

        assertNotNull(sale);
        assertNotNull(sale.getSaleNumber());
        assertEquals("e-1", sale.getEmployee().getId());
        assertEquals(0, BigDecimal.TEN.compareTo(sale.getTotalAmount()));
        verify(fifoCostingService).allocateSaleItemFifo(eq("t-1"), anyString(), any(), eq("e-1"));
        verify(eventPublisher, times(1)).publishEvent(any());
    }

    @Test
    public void testCreateSaleWithDeliveryFee() {
        when(sessionRepository.findById("s-1")).thenReturn(Optional.of(session));
        when(employeeRepository.findById("e-1")).thenReturn(Optional.of(employee));
        when(variantRepository.findByIdWithProduct("v-1")).thenReturn(Optional.of(variant));
        when(saleRepository.save(any(Sale.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(itemRepository.save(any(SaleItem.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(auditLogRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        doNothing().when(stockService).ensureMirrored(anyString());
        when(fifoCostingService.getAvailableBatchQuantity(eq("t-1"), eq("wh-1"), eq("v-1"))).thenReturn(5);
        when(fifoCostingService.allocateSaleItemFifo(eq("t-1"), anyString(), any(), eq("e-1"))).thenReturn(List.of());

        com.animasys.modules.inventory.domain.Warehouse wh = com.animasys.modules.inventory.domain.Warehouse.builder().id("wh-1").branch(session.getBranch()).name("Main WH").build();
        when(warehouseRepository.findByBranchId("b-1")).thenReturn(List.of(wh));

        // subtotal 10 (1 x item @10) + delivery fee 15 = total 25
        Sale sale = saleService.createSale(
                "s-1",
                "e-1",
                null,
                BigDecimal.valueOf(25),
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                "CASH",
                Collections.singletonList(saleItem),
                null,
                null,
                true,
                BigDecimal.valueOf(15)
        );

        assertNotNull(sale);
        assertTrue(sale.isDelivery());
        assertEquals(0, BigDecimal.valueOf(15).setScale(2).compareTo(sale.getDeliveryFee()));
        assertEquals(0, BigDecimal.valueOf(25).setScale(2).compareTo(sale.getTotalAmount()));
    }

    @Test
    public void testCreateSaleIgnoresFeeWhenNotFlaggedAsDelivery() {
        when(sessionRepository.findById("s-1")).thenReturn(Optional.of(session));
        when(employeeRepository.findById("e-1")).thenReturn(Optional.of(employee));
        when(variantRepository.findByIdWithProduct("v-1")).thenReturn(Optional.of(variant));
        when(saleRepository.save(any(Sale.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(itemRepository.save(any(SaleItem.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(auditLogRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        doNothing().when(stockService).ensureMirrored(anyString());
        when(fifoCostingService.getAvailableBatchQuantity(eq("t-1"), eq("wh-1"), eq("v-1"))).thenReturn(5);
        when(fifoCostingService.allocateSaleItemFifo(eq("t-1"), anyString(), any(), eq("e-1"))).thenReturn(List.of());

        com.animasys.modules.inventory.domain.Warehouse wh = com.animasys.modules.inventory.domain.Warehouse.builder().id("wh-1").branch(session.getBranch()).name("Main WH").build();
        when(warehouseRepository.findByBranchId("b-1")).thenReturn(List.of(wh));

        // A stray fee sent without the delivery flag must not affect the total.
        Sale sale = saleService.createSale(
                "s-1",
                "e-1",
                null,
                BigDecimal.TEN,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                "CASH",
                Collections.singletonList(saleItem),
                null,
                null,
                false,
                BigDecimal.valueOf(15)
        );

        assertFalse(sale.isDelivery());
        assertEquals(0, BigDecimal.ZERO.setScale(2).compareTo(sale.getDeliveryFee()));
        assertEquals(0, BigDecimal.TEN.compareTo(sale.getTotalAmount()));
    }

    /**
     * Regression for a fixed bug: a checkout request with neither a single-tender
     * paymentMethod nor a split-tender payments list used to silently record CASH
     * instead of being rejected, corrupting cash-drawer reconciliation.
     */
    @Test
    public void testCreateSaleRejectsMissingPaymentMethod() {
        when(sessionRepository.findById("s-1")).thenReturn(Optional.of(session));
        when(employeeRepository.findById("e-1")).thenReturn(Optional.of(employee));
        when(variantRepository.findByIdWithProduct("v-1")).thenReturn(Optional.of(variant));
        when(fifoCostingService.getAvailableBatchQuantity(eq("t-1"), eq("wh-1"), eq("v-1"))).thenReturn(5);

        com.animasys.modules.inventory.domain.Warehouse wh = com.animasys.modules.inventory.domain.Warehouse.builder().id("wh-1").branch(session.getBranch()).name("Main WH").build();
        when(warehouseRepository.findByBranchId("b-1")).thenReturn(List.of(wh));

        assertThrows(com.animasys.core.exception.BusinessRuleException.class, () -> saleService.createSale(
                "s-1",
                "e-1",
                null,
                BigDecimal.TEN,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                null,
                Collections.singletonList(saleItem)
        ));

        verify(saleRepository, never()).save(any(Sale.class));
        verify(itemRepository, never()).save(any(SaleItem.class));
        verify(paymentRepository, never()).save(any(SalePayment.class));
    }

    @Test
    public void testCreateSaleRejectsBlankPaymentMethod() {
        when(sessionRepository.findById("s-1")).thenReturn(Optional.of(session));
        when(employeeRepository.findById("e-1")).thenReturn(Optional.of(employee));
        when(variantRepository.findByIdWithProduct("v-1")).thenReturn(Optional.of(variant));
        when(fifoCostingService.getAvailableBatchQuantity(eq("t-1"), eq("wh-1"), eq("v-1"))).thenReturn(5);

        com.animasys.modules.inventory.domain.Warehouse wh = com.animasys.modules.inventory.domain.Warehouse.builder().id("wh-1").branch(session.getBranch()).name("Main WH").build();
        when(warehouseRepository.findByBranchId("b-1")).thenReturn(List.of(wh));

        assertThrows(com.animasys.core.exception.BusinessRuleException.class, () -> saleService.createSale(
                "s-1",
                "e-1",
                null,
                BigDecimal.TEN,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                "   ",
                Collections.singletonList(saleItem)
        ));

        verify(saleRepository, never()).save(any(Sale.class));
    }
}
