package com.animasys.modules.sales.service;

import com.animasys.core.audit.AuditLogRepository;
import com.animasys.core.exception.BusinessRuleException;
import com.animasys.core.exception.ResourceNotFoundException;
import com.animasys.modules.crm.domain.Customer;
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
import com.animasys.modules.sales.domain.SaleItem;
import com.animasys.modules.sales.repository.*;
import com.animasys.modules.services.repository.GroomingServiceRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.authentication.AuthenticationManager;

import java.math.BigDecimal;
import java.util.Collections;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SaleServicePosGuardTest {

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

    @InjectMocks private SaleService saleService;

    private Tenant tenant;
    private Branch branch;
    private Employee employee;
    private POSSession openSession;
    private SaleItem saleItem;

    @BeforeEach
    void setUp() {
        tenant = Tenant.builder().id("t-sale").name("Shop").subdomain("shop").build();
        branch = Branch.builder().id("b-sale").tenant(tenant).name("Main").build();
        employee = Employee.builder().id("e-sale").tenant(tenant).branch(branch).role("CASHIER").username("cashier").build();
        openSession = POSSession.builder().id("s-open").status("OPEN").branch(branch).build();
        saleItem = SaleItem.builder().itemId("v-1").type("PRODUCT").name("Treat").quantity(1)
                .price(BigDecimal.TEN).cost(BigDecimal.ONE).build();
    }

    @Test
    void createSale_rejectsClosedSession() {
        POSSession closed = POSSession.builder().id("s-closed").status("CLOSED").branch(branch).build();
        when(sessionRepository.findById("s-closed")).thenReturn(Optional.of(closed));

        assertThrows(BusinessRuleException.class, () -> saleService.createSale(
                "s-closed", "e-sale", null, BigDecimal.TEN, BigDecimal.ZERO, BigDecimal.ZERO,
                "CASH", List.of(saleItem)));
    }

    @Test
    void createSale_rejectsEmptyItems() {
        assertThrows(BusinessRuleException.class, () -> saleService.createSale(
                "s-open", "e-sale", null, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO,
                "CASH", Collections.emptyList()));
    }

    @Test
    void createSale_rejectsBannedCustomer() {
        Customer banned = Customer.builder().id("c-banned").isBanned(true).name("Banned").build();

        when(sessionRepository.findById("s-open")).thenReturn(Optional.of(openSession));
        when(employeeRepository.findById("e-sale")).thenReturn(Optional.of(employee));
        when(customerRepository.findByIdAndTenantId("c-banned", "t-sale")).thenReturn(Optional.of(banned));

        assertThrows(BusinessRuleException.class, () -> saleService.createSale(
                "s-open", "e-sale", "c-banned", BigDecimal.TEN, BigDecimal.ZERO, BigDecimal.ZERO,
                "CASH", List.of(saleItem)));
    }

    @Test
    void createSale_rejectsCustomerFromWrongTenant() {
        when(sessionRepository.findById("s-open")).thenReturn(Optional.of(openSession));
        when(employeeRepository.findById("e-sale")).thenReturn(Optional.of(employee));
        when(customerRepository.findByIdAndTenantId("c-missing", "t-sale")).thenReturn(Optional.empty());

        assertThrows(ResourceNotFoundException.class, () -> saleService.createSale(
                "s-open", "e-sale", "c-missing", BigDecimal.TEN, BigDecimal.ZERO, BigDecimal.ZERO,
                "CASH", List.of(saleItem)));
    }
}
