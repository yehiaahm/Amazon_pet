package com.animasys.modules.finance.service;

import com.animasys.core.exception.ResourceNotFoundException;
import com.animasys.modules.finance.domain.Expense;
import com.animasys.modules.finance.repository.ExpenseRepository;
import com.animasys.modules.iam.domain.Branch;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.iam.repository.BranchRepository;
import com.animasys.modules.iam.repository.TenantRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional
@Slf4j
public class ExpenseService {

    private final ExpenseRepository expenseRepository;
    private final TenantRepository tenantRepository;
    private final BranchRepository branchRepository;
    private final GeneralLedgerService ledgerService;

    public Expense createExpense(String tenantId, String branchId, Expense dto) {
        Tenant tenant = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Tenant not found: " + tenantId));
        Branch branch = branchRepository.findById(branchId)
                .orElseThrow(() -> new ResourceNotFoundException("Branch not found: " + branchId));

        String paidFrom = dto.getPaidFrom() != null ? dto.getPaidFrom().toUpperCase(Locale.ROOT) : "CASH";
        if (!paidFrom.equals("CASH") && !paidFrom.equals("BANK")) {
            paidFrom = "CASH";
        }

        Expense expense = Expense.builder()
                .id(UUID.randomUUID().toString())
                .tenant(tenant)
                .branch(branch)
                .category(dto.getCategory())
                .amount(dto.getAmount())
                .date(dto.getDate() != null ? dto.getDate() : LocalDate.now())
                .description(dto.getDescription())
                .paidFrom(paidFrom)
                .build();

        expense = expenseRepository.save(expense);
        postExpenseJournal(tenant, expense);
        return expense;
    }

    private void postExpenseJournal(Tenant tenant, Expense expense) {
        try {
            Map<String, BigDecimal> debits = new HashMap<>();
            Map<String, BigDecimal> credits = new HashMap<>();

            String expenseAccount = "EXPENSE_" + (expense.getCategory() != null
                    ? expense.getCategory().toUpperCase(Locale.ROOT)
                    : "GENERAL");
            debits.put(expenseAccount, expense.getAmount());

            String creditAccount = "CASH".equalsIgnoreCase(expense.getPaidFrom())
                    ? "CASH_DRAWER"
                    : "BANK_ACCOUNT";
            credits.put(creditAccount, expense.getAmount());

            ledgerService.postJournalEntry(
                    tenant,
                    "Expense: " + (expense.getDescription() != null ? expense.getDescription() : expense.getCategory()),
                    debits,
                    credits
            );
        } catch (Exception ex) {
            log.error("Failed to post expense journal {}: {}", expense.getId(), ex.getMessage());
        }
    }

    @Transactional(readOnly = true)
    public List<Expense> getAllByTenant(String tenantId) {
        return expenseRepository.findByTenantIdOrderByDateDesc(tenantId);
    }

    @Transactional(readOnly = true)
    public List<Expense> getByTenantAndDateRange(String tenantId, LocalDate from, LocalDate to) {
        return expenseRepository.findByTenantIdAndDateBetweenOrderByDateDesc(tenantId, from, to);
    }

    @Transactional(readOnly = true)
    public Expense getById(String tenantId, String id) {
        return expenseRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Expense not found: " + id));
    }

    public void deleteExpense(String tenantId, String id) {
        Expense expense = expenseRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Expense not found: " + id));
        expenseRepository.delete(expense);
    }
}
