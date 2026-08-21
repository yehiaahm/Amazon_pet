package com.animasys.modules.inventory.service;

import com.animasys.core.audit.AuditLog;
import com.animasys.core.audit.AuditLogRepository;
import com.animasys.core.exception.BusinessRuleException;
import com.animasys.modules.finance.service.AccountsPayableService;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.iam.repository.EmployeeRepository;
import com.animasys.modules.iam.repository.TenantRepository;
import com.animasys.modules.inventory.domain.Product;
import com.animasys.modules.inventory.domain.ProductVariant;
import com.animasys.modules.inventory.domain.PurchaseInvoice;
import com.animasys.modules.inventory.domain.PurchaseInvoiceItem;
import com.animasys.modules.inventory.dto.PurchaseReturnLineRequest;
import com.animasys.modules.inventory.dto.PurchaseReturnRequest;
import com.animasys.modules.inventory.dto.PurchaseReturnResult;
import com.animasys.modules.inventory.repository.CategoryRepository;
import com.animasys.modules.inventory.repository.ProductRepository;
import com.animasys.modules.inventory.repository.ProductVariantRepository;
import com.animasys.modules.inventory.repository.PurchaseInvoiceRepository;
import com.animasys.modules.inventory.repository.SupplierRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PurchaseInvoiceServiceReturnTest {

    @Mock private PurchaseInvoiceRepository invoiceRepository;
    @Mock private SupplierRepository supplierRepository;
    @Mock private EmployeeRepository employeeRepository;
    @Mock private TenantRepository tenantRepository;
    @Mock private ProductRepository productRepository;
    @Mock private ProductVariantRepository variantRepository;
    @Mock private CategoryRepository categoryRepository;
    @Mock private FifoCostingService fifoCostingService;
    @Mock private InventoryIntegrityService inventoryIntegrityService;
    @Mock private SkuCatalogService skuCatalogService;
    @Mock private CatalogPersistenceService catalogPersistenceService;
    @Mock private AccountsPayableService accountsPayableService;
    @Mock private ProductService productService;
    @Mock private AuditLogRepository auditLogRepository;

    @InjectMocks
    private PurchaseInvoiceService purchaseInvoiceService;

    private final String tenantId = "t-return";
    private final String employeeId = "e-return";
    private Employee employee;
    private PurchaseInvoice invoice;
    private PurchaseInvoiceItem item1;
    private PurchaseInvoiceItem item2;

    @BeforeEach
    void setUp() {
        Tenant tenant = Tenant.builder().id(tenantId).name("Return Tenant").subdomain("return").build();
        employee = Employee.builder().id(employeeId).username("owner").fullName("Owner").tenant(tenant).build();

        item1 = PurchaseInvoiceItem.builder()
                .id("pii-1")
                .productName("Dog Food")
                .sku("SKU-1")
                .cost(new BigDecimal("10.00"))
                .price(new BigDecimal("15.00"))
                .quantity(5)
                .quantityReturned(0)
                .build();
        item2 = PurchaseInvoiceItem.builder()
                .id("pii-2")
                .productName("Cat Litter")
                .sku("SKU-2")
                .cost(new BigDecimal("20.00"))
                .price(new BigDecimal("30.00"))
                .quantity(3)
                .quantityReturned(0)
                .build();

        invoice = PurchaseInvoice.builder()
                .id("pi-1")
                .invoiceNumber("INV-1")
                .invoiceDate("2026-08-01")
                .supplierName("ACME Supplier")
                .currency("EGP")
                .status("COMPLETED")
                .paymentStatus("UNPAID")
                .netTotal(new BigDecimal("110.00"))
                .grandTotal(new BigDecimal("110.00"))
                .items(new ArrayList<>(List.of(item1, item2)))
                .installments(new ArrayList<>())
                .build();

        Product product1 = Product.builder().id("p-1").sku("SKU-1").name("Dog Food").build();
        Product product2 = Product.builder().id("p-2").sku("SKU-2").name("Cat Litter").build();
        ProductVariant variant1 = ProductVariant.builder().id("pv-1").name("Dog Food").build();
        ProductVariant variant2 = ProductVariant.builder().id("pv-2").name("Cat Litter").build();

        when(employeeRepository.findById(employeeId)).thenReturn(Optional.of(employee));
        when(invoiceRepository.findByIdAndUploadedByTenantId("pi-1", tenantId)).thenReturn(Optional.of(invoice));
        when(productRepository.findBySkuIgnoreCaseAndTenantId("SKU-1", tenantId)).thenReturn(Optional.of(product1));
        when(productRepository.findBySkuIgnoreCaseAndTenantId("SKU-2", tenantId)).thenReturn(Optional.of(product2));
        when(skuCatalogService.findCanonicalVariant(product1)).thenReturn(Optional.of(variant1));
        when(skuCatalogService.findCanonicalVariant(product2)).thenReturn(Optional.of(variant2));
        when(auditLogRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(invoiceRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(accountsPayableService.applyReturnCredit(any(), any())).thenReturn(BigDecimal.ZERO);
    }

    @Test
    void partialReturnOfOneLineUpdatesQuantityAndAmount() {
        PurchaseReturnRequest request = new PurchaseReturnRequest();
        request.setLines(List.of(
                PurchaseReturnLineRequest.builder().purchaseInvoiceItemId("pii-1").quantity(2).build()));

        PurchaseReturnResult result = purchaseInvoiceService.returnInvoice(tenantId, employeeId, "pi-1", request);

        assertFalse(result.isFullReturn());
        assertEquals(0, new BigDecimal("20.00").compareTo(result.getReturnedAmount()));
        assertEquals(2, item1.getQuantityReturned());
        assertEquals(0, item2.getQuantityReturned());
        verify(fifoCostingService).processSupplierReturn(tenantId, "pi-1", "pv-1", 2, employeeId);
        verify(fifoCostingService, never()).processSupplierReturn(eq(tenantId), eq("pi-1"), eq("pv-2"), anyInt(), eq(employeeId));
        verify(accountsPayableService).applyReturnCredit(invoice, new BigDecimal("20.00"));
        verify(auditLogRepository).save(argThat((AuditLog log) -> "PARTIAL_PURCHASE_RETURN".equals(log.getAction())));
    }

    @Test
    void noLinesReturnsEverythingStillReturnable() {
        PurchaseReturnResult result = purchaseInvoiceService.returnInvoice(tenantId, employeeId, "pi-1", null);

        assertTrue(result.isFullReturn());
        assertEquals(0, new BigDecimal("110.00").compareTo(result.getReturnedAmount()));
        assertEquals(5, item1.getQuantityReturned());
        assertEquals(3, item2.getQuantityReturned());
        verify(fifoCostingService).processSupplierReturn(tenantId, "pi-1", "pv-1", 5, employeeId);
        verify(fifoCostingService).processSupplierReturn(tenantId, "pi-1", "pv-2", 3, employeeId);

        verify(auditLogRepository).save(argThat(log -> "PURCHASE_RETURN".equals(log.getAction())));
    }

    @Test
    void overQuantityRequestIsRejected() {
        PurchaseReturnRequest request = new PurchaseReturnRequest();
        request.setLines(List.of(
                PurchaseReturnLineRequest.builder().purchaseInvoiceItemId("pii-1").quantity(6).build()));

        assertThrows(BusinessRuleException.class,
                () -> purchaseInvoiceService.returnInvoice(tenantId, employeeId, "pi-1", request));

        verify(invoiceRepository, never()).save(any());
    }

    @Test
    void draftInvoiceCannotBeReturned() {
        invoice.setStatus("DRAFT");

        assertThrows(BusinessRuleException.class,
                () -> purchaseInvoiceService.returnInvoice(tenantId, employeeId, "pi-1", null));
    }

    @Test
    void fifoRejectionPropagatesAndInvoiceIsNotSaved() {
        when(fifoCostingService.processSupplierReturn(eq(tenantId), eq("pi-1"), eq("pv-1"), anyInt(), eq(employeeId)))
                .thenThrow(new BusinessRuleException("جزء من هذه الكمية اتباع بالفعل"));

        PurchaseReturnRequest request = new PurchaseReturnRequest();
        request.setLines(List.of(
                PurchaseReturnLineRequest.builder().purchaseInvoiceItemId("pii-1").quantity(2).build()));

        assertThrows(BusinessRuleException.class,
                () -> purchaseInvoiceService.returnInvoice(tenantId, employeeId, "pi-1", request));

        verify(invoiceRepository, never()).save(any());
    }

    @Test
    void excessCreditFromAccountsPayableIsSurfacedOnResult() {
        when(accountsPayableService.applyReturnCredit(any(), any())).thenReturn(new BigDecimal("15.00"));

        PurchaseReturnRequest request = new PurchaseReturnRequest();
        request.setLines(List.of(
                PurchaseReturnLineRequest.builder().purchaseInvoiceItemId("pii-1").quantity(2).build()));

        PurchaseReturnResult result = purchaseInvoiceService.returnInvoice(tenantId, employeeId, "pi-1", request);

        assertEquals(0, new BigDecimal("15.00").compareTo(result.getExcessCredit()));
    }

    /**
     * Regression: a line item with a null cost (e.g. left unset by an earlier import
     * flow) used to NPE inside returnInvoice's lineValue calculation instead of a
     * clean, user-facing error — and only after FIFO stock had already been deducted.
     */
    @Test
    void nullItemCostIsRejectedCleanlyWithoutDeductingStock() {
        item1.setCost(null);

        PurchaseReturnRequest request = new PurchaseReturnRequest();
        request.setLines(List.of(
                PurchaseReturnLineRequest.builder().purchaseInvoiceItemId("pii-1").quantity(2).build()));

        assertThrows(BusinessRuleException.class,
                () -> purchaseInvoiceService.returnInvoice(tenantId, employeeId, "pi-1", request));

        verify(fifoCostingService, never()).processSupplierReturn(any(), any(), any(), anyInt(), any());
        verify(invoiceRepository, never()).save(any());
        assertEquals(0, item1.getQuantityReturned());
    }
}
