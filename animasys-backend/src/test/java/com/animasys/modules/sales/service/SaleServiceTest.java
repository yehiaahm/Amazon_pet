package com.animasys.modules.sales.service;

import com.animasys.modules.sales.domain.*;
import com.animasys.modules.sales.repository.*;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.repository.EmployeeRepository;
import com.animasys.modules.crm.repository.CustomerRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.context.ApplicationEventPublisher;
import java.math.BigDecimal;
import java.util.Collections;
import java.util.Optional;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

public class SaleServiceTest {

    @Mock
    private SaleRepository saleRepository;
    @Mock
    private SaleItemRepository itemRepository;
    @Mock
    private POSSessionRepository sessionRepository;
    @Mock
    private EmployeeRepository employeeRepository;
    @Mock
    private CustomerRepository customerRepository;
    @Mock
    private ApplicationEventPublisher eventPublisher;

    @InjectMocks
    private SaleService saleService;

    private POSSession session;
    private Employee employee;
    private SaleItem saleItem;

    @BeforeEach
    public void setup() {
        MockitoAnnotations.openMocks(this);

        session = POSSession.builder().id("s-1").status("OPEN").openingBalance(BigDecimal.valueOf(100)).build();
        employee = Employee.builder().id("e-1").username("bob").fullName("Bob Johnson").role("CASHIER").build();
        saleItem = SaleItem.builder().itemId("v-1").type("PRODUCT").name("Grooming Brush").quantity(1).price(BigDecimal.TEN).cost(BigDecimal.ONE).build();
    }

    @Test
    public void testCreateSaleSuccess() {
        when(sessionRepository.findById("s-1")).thenReturn(Optional.of(session));
        when(employeeRepository.findById("e-1")).thenReturn(Optional.of(employee));
        when(saleRepository.save(any(Sale.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(itemRepository.save(any(SaleItem.class))).thenAnswer(invocation -> invocation.getArgument(0));

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
        verify(eventPublisher, times(1)).publishEvent(any());
    }
}
