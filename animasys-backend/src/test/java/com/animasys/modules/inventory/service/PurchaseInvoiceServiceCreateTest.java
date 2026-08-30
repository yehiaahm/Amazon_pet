package com.animasys.modules.inventory.service;

import com.animasys.core.audit.AuditLogRepository;
import com.animasys.core.exception.BusinessRuleException;
import com.animasys.modules.finance.service.AccountsPayableService;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.iam.repository.EmployeeRepository;
import com.animasys.modules.iam.repository.TenantRepository;
import com.animasys.modules.inventory.domain.PurchaseInvoice;
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
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Regression for a fixed tenant-isolation bug: createInvoice() used to silently
 * fall back to the hardcoded tenant "t-1" whenever the caller-supplied tenantId
 * was null/blank, instead of failing closed — the same class of bug SecurityUtils
 * was hardened against, but missed here since this fallback lived one layer down.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PurchaseInvoiceServiceCreateTest {

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

    private PurchaseInvoice dto;

    @BeforeEach
    void setUp() {
        dto = PurchaseInvoice.builder()
                .invoiceNumber("INV-100")
                .invoiceDate("2026-08-01")
                .supplierName("ACME Supplier")
                .grandTotal(new BigDecimal("50.00"))
                .build();

        when(invoiceRepository.findByFingerprint(any())).thenReturn(Optional.empty());
        Employee employee = Employee.builder().id("e-1").username("owner").fullName("Owner").build();
        when(employeeRepository.findById("e-1")).thenReturn(Optional.of(employee));
    }

    @Test
    void blankTenantIdIsRejectedInsteadOfDefaultingToT1() {
        assertThrows(BusinessRuleException.class,
                () -> purchaseInvoiceService.createInvoice(dto, "e-1", ""));

        verify(tenantRepository, never()).findById(any());
        verify(invoiceRepository, never()).save(any());
    }

    @Test
    void nullTenantIdIsRejectedInsteadOfDefaultingToT1() {
        assertThrows(BusinessRuleException.class,
                () -> purchaseInvoiceService.createInvoice(dto, "e-1", null));

        verify(tenantRepository, never()).findById(any());
        verify(invoiceRepository, never()).save(any());
    }

    @Test
    void validTenantIdIsUsedAsIs() {
        Tenant tenant = Tenant.builder().id("t-real").name("Real Tenant").subdomain("real").build();
        when(tenantRepository.findById("t-real")).thenReturn(Optional.of(tenant));

        // Downstream supplier/product resolution isn't mocked here — this test only cares
        // that the real tenantId reached tenantRepository, not that the whole flow succeeds.
        try {
            purchaseInvoiceService.createInvoice(dto, "e-1", "t-real");
        } catch (RuntimeException ignored) {
            // expected past this point due to incomplete downstream mocking
        }

        verify(tenantRepository).findById("t-real");
        verify(tenantRepository, never()).findById("t-1");
    }
}
