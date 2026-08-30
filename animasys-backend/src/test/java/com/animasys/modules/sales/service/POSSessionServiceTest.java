package com.animasys.modules.sales.service;

import com.animasys.core.exception.BusinessRuleException;
import com.animasys.core.exception.ResourceNotFoundException;
import com.animasys.modules.finance.repository.DailyClosingRepository;
import com.animasys.modules.finance.repository.ExpenseRepository;
import com.animasys.modules.iam.domain.Branch;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.iam.repository.BranchRepository;
import com.animasys.modules.iam.repository.EmployeeRepository;
import com.animasys.modules.sales.domain.POSSession;
import com.animasys.modules.sales.domain.Sale;
import com.animasys.modules.sales.domain.SalePayment;
import com.animasys.modules.sales.repository.POSSessionRepository;
import com.animasys.modules.sales.repository.SalePaymentRepository;
import com.animasys.modules.sales.repository.SaleRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class POSSessionServiceTest {

    @Mock private POSSessionRepository sessionRepository;
    @Mock private BranchRepository branchRepository;
    @Mock private EmployeeRepository employeeRepository;
    @Mock private SaleRepository saleRepository;
    @Mock private SalePaymentRepository salePaymentRepository;
    @Mock private DailyClosingRepository dailyClosingRepository;
    @Mock private ExpenseRepository expenseRepository;

    @InjectMocks private POSSessionService posSessionService;

    private Tenant tenant;
    private Branch branch;
    private Employee employee;

    @BeforeEach
    void setUp() {
        tenant = Tenant.builder().id("t-pos").name("Shop").subdomain("shop").build();
        branch = Branch.builder().id("b-pos").tenant(tenant).name("Main").build();
        employee = Employee.builder().id("e-pos").tenant(tenant).branch(branch).username("cashier").role("CASHIER").build();
    }

    @Test
    void startSession_successWhenNoActiveSession() {
        when(sessionRepository.findByBranchIdAndStatus("b-pos", "OPEN")).thenReturn(Optional.empty());
        when(employeeRepository.findById("e-pos")).thenReturn(Optional.of(employee));
        when(branchRepository.findById("b-pos")).thenReturn(Optional.of(branch));
        when(sessionRepository.save(any(POSSession.class))).thenAnswer(inv -> inv.getArgument(0));

        POSSession session = posSessionService.startSession("b-pos", "e-pos", BigDecimal.valueOf(100));

        assertEquals("OPEN", session.getStatus());
        assertEquals(0, BigDecimal.valueOf(100).compareTo(session.getOpeningBalance()));
        verify(sessionRepository).save(any(POSSession.class));
    }

    @Test
    void startSession_rejectsDuplicateOpenSession() {
        when(sessionRepository.findByBranchIdAndStatus("b-pos", "OPEN"))
                .thenReturn(Optional.of(POSSession.builder().id("existing").status("OPEN").build()));

        assertThrows(BusinessRuleException.class,
                () -> posSessionService.startSession("b-pos", "e-pos", BigDecimal.TEN));
    }

    @Test
    void startSession_rejectsBranchFromDifferentTenant() {
        Tenant otherTenant = Tenant.builder().id("t-other").name("Other").subdomain("other").build();
        Branch otherBranch = Branch.builder().id("b-other").tenant(otherTenant).name("Other").build();

        when(sessionRepository.findByBranchIdAndStatus("b-other", "OPEN")).thenReturn(Optional.empty());
        when(employeeRepository.findById("e-pos")).thenReturn(Optional.of(employee));
        when(branchRepository.findById("b-other")).thenReturn(Optional.of(otherBranch));

        assertThrows(BusinessRuleException.class,
                () -> posSessionService.startSession("b-other", "e-pos", BigDecimal.TEN));
    }

    @Test
    void closeSession_computesExpectedBalanceFromCashSales() {
        POSSession session = POSSession.builder()
                .id("s-close")
                .branch(branch)
                .openingBalance(BigDecimal.valueOf(100))
                .status("OPEN")
                .build();

        Sale cashSale = Sale.builder().id("sale-cash").totalAmount(BigDecimal.valueOf(50)).paymentMethod("CASH").status("COMPLETED").build();
        Sale cardSale = Sale.builder().id("sale-card").totalAmount(BigDecimal.valueOf(30)).paymentMethod("CARD").status("COMPLETED").build();
        Sale refunded = Sale.builder().id("sale-refunded").totalAmount(BigDecimal.valueOf(20)).paymentMethod("CASH").status("REFUNDED").build();

        when(sessionRepository.findById("s-close")).thenReturn(Optional.of(session));
        when(employeeRepository.findById("e-pos")).thenReturn(Optional.of(employee));
        when(saleRepository.findByPosSession_Id("s-close")).thenReturn(List.of(cashSale, cardSale, refunded));
        when(salePaymentRepository.findBySale_IdIn(any())).thenReturn(List.of(
                SalePayment.builder().sale(cashSale).method("CASH").amount(BigDecimal.valueOf(50)).build(),
                SalePayment.builder().sale(cardSale).method("CARD").amount(BigDecimal.valueOf(30)).build()
        ));
        when(sessionRepository.save(any(POSSession.class))).thenAnswer(inv -> inv.getArgument(0));
        when(dailyClosingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        POSSession closed = posSessionService.closeSession(
                "s-close", BigDecimal.valueOf(150), BigDecimal.ZERO, BigDecimal.valueOf(150), "e-pos");

        assertEquals("CLOSED", closed.getStatus());
        verify(dailyClosingRepository).save(argThat(dc ->
                dc.getSystemExpected().compareTo(BigDecimal.valueOf(150)) == 0
                        && dc.getPhysicalActual().compareTo(BigDecimal.valueOf(150)) == 0));
    }

    @Test
    @DisplayName("Closing an already-closed session is a no-op (idempotent) rather than an error")
    void closeSession_alreadyClosedSessionIsNoOp() {
        POSSession session = POSSession.builder().id("s-closed").branch(branch).status("CLOSED").build();
        when(sessionRepository.findById("s-closed")).thenReturn(Optional.of(session));

        POSSession result = posSessionService.closeSession("s-closed", BigDecimal.TEN, BigDecimal.TEN, BigDecimal.TEN, "e-pos");

        assertEquals("CLOSED", result.getStatus());
        verify(sessionRepository, never()).save(any());
    }

    @Test
    void closeSession_rejectsCrossTenantClose() {
        Tenant otherTenant = Tenant.builder().id("t-other").name("Other").subdomain("other").build();
        Employee otherEmployee = Employee.builder().id("e-other").tenant(otherTenant).username("other").build();
        POSSession session = POSSession.builder().id("s-x").branch(branch).status("OPEN").openingBalance(BigDecimal.TEN).build();

        when(sessionRepository.findById("s-x")).thenReturn(Optional.of(session));
        when(employeeRepository.findById("e-other")).thenReturn(Optional.of(otherEmployee));

        assertThrows(BusinessRuleException.class,
                () -> posSessionService.closeSession("s-x", BigDecimal.TEN, BigDecimal.TEN, BigDecimal.TEN, "e-other"));
    }

    @Test
    void startSession_employeeNotFound() {
        when(sessionRepository.findByBranchIdAndStatus("b-pos", "OPEN")).thenReturn(Optional.empty());
        when(employeeRepository.findById("missing")).thenReturn(Optional.empty());

        assertThrows(ResourceNotFoundException.class,
                () -> posSessionService.startSession("b-pos", "missing", BigDecimal.TEN));
    }
}
