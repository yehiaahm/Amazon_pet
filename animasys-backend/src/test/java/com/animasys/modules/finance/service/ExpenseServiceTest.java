package com.animasys.modules.finance.service;

import com.animasys.core.exception.ResourceNotFoundException;
import com.animasys.modules.finance.domain.Expense;
import com.animasys.modules.finance.repository.ExpenseRepository;
import com.animasys.modules.iam.domain.Branch;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.iam.repository.BranchRepository;
import com.animasys.modules.iam.repository.TenantRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ExpenseServiceTest {

    @Mock private ExpenseRepository expenseRepository;
    @Mock private TenantRepository tenantRepository;
    @Mock private BranchRepository branchRepository;
    @Mock private GeneralLedgerService ledgerService;

    @InjectMocks private ExpenseService expenseService;

    private Tenant tenant;
    private Branch branch;

    @BeforeEach
    void setUp() {
        tenant = Tenant.builder().id("t-fin").name("Finance").subdomain("fin").build();
        branch = Branch.builder().id("b-fin").tenant(tenant).name("Main").build();
    }

    @Test
    void createExpense_cashExpensePostsCashDrawerCredit() {
        Expense dto = Expense.builder()
                .category("utilities")
                .amount(BigDecimal.valueOf(50))
                .description("Electric bill")
                .paidFrom("cash")
                .build();

        when(tenantRepository.findById("t-fin")).thenReturn(Optional.of(tenant));
        when(branchRepository.findById("b-fin")).thenReturn(Optional.of(branch));
        when(expenseRepository.save(any(Expense.class))).thenAnswer(inv -> inv.getArgument(0));

        Expense saved = expenseService.createExpense("t-fin", "b-fin", dto);

        assertEquals("CASH", saved.getPaidFrom());
        ArgumentCaptor<Map<String, BigDecimal>> debits = ArgumentCaptor.forClass(Map.class);
        ArgumentCaptor<Map<String, BigDecimal>> credits = ArgumentCaptor.forClass(Map.class);
        verify(ledgerService).postJournalEntry(eq(tenant), anyString(), debits.capture(), credits.capture());
        assertTrue(debits.getValue().containsKey("EXPENSE_UTILITIES"));
        assertTrue(credits.getValue().containsKey("CASH_DRAWER"));
    }

    @Test
    void createExpense_bankExpenseCreditsBankAccount() {
        Expense dto = Expense.builder()
                .category("rent")
                .amount(BigDecimal.valueOf(100))
                .paidFrom("BANK")
                .build();

        when(tenantRepository.findById("t-fin")).thenReturn(Optional.of(tenant));
        when(branchRepository.findById("b-fin")).thenReturn(Optional.of(branch));
        when(expenseRepository.save(any(Expense.class))).thenAnswer(inv -> inv.getArgument(0));

        expenseService.createExpense("t-fin", "b-fin", dto);

        ArgumentCaptor<Map<String, BigDecimal>> credits = ArgumentCaptor.forClass(Map.class);
        verify(ledgerService).postJournalEntry(eq(tenant), anyString(), anyMap(), credits.capture());
        assertTrue(credits.getValue().containsKey("BANK_ACCOUNT"));
    }

    @Test
    void createExpense_invalidPaidFromDefaultsToCash() {
        Expense dto = Expense.builder().category("misc").amount(BigDecimal.TEN).paidFrom("CRYPTO").build();

        when(tenantRepository.findById("t-fin")).thenReturn(Optional.of(tenant));
        when(branchRepository.findById("b-fin")).thenReturn(Optional.of(branch));
        when(expenseRepository.save(any(Expense.class))).thenAnswer(inv -> inv.getArgument(0));

        Expense saved = expenseService.createExpense("t-fin", "b-fin", dto);
        assertEquals("CASH", saved.getPaidFrom());
    }

    @Test
    void getById_wrongTenantThrowsNotFound() {
        when(expenseRepository.findByIdAndTenantId("exp-1", "t-fin")).thenReturn(Optional.empty());

        assertThrows(ResourceNotFoundException.class,
                () -> expenseService.getById("t-fin", "exp-1"));
    }

    @Test
    void deleteExpense_isTenantScoped() {
        Expense expense = Expense.builder().id("exp-1").tenant(tenant).amount(BigDecimal.TEN).build();
        when(expenseRepository.findByIdAndTenantId("exp-1", "t-fin")).thenReturn(Optional.of(expense));

        expenseService.deleteExpense("t-fin", "exp-1");

        verify(expenseRepository).delete(expense);
    }
}
