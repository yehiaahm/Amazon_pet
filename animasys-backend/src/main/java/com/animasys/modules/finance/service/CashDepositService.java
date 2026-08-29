package com.animasys.modules.finance.service;

import com.animasys.core.exception.ResourceNotFoundException;
import com.animasys.modules.finance.domain.CashDeposit;
import com.animasys.modules.finance.repository.CashDepositRepository;
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
public class CashDepositService {

    private final CashDepositRepository cashDepositRepository;
    private final TenantRepository tenantRepository;
    private final BranchRepository branchRepository;
    private final GeneralLedgerService ledgerService;

    public CashDeposit createDeposit(String tenantId, String branchId, CashDeposit dto) {
        Tenant tenant = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Tenant not found: " + tenantId));
        Branch branch = branchRepository.findById(branchId)
                .orElseThrow(() -> new ResourceNotFoundException("Branch not found: " + branchId));

        String depositedTo = dto.getDepositedTo() != null ? dto.getDepositedTo().toUpperCase(Locale.ROOT) : "CASH";
        if (!depositedTo.equals("CASH") && !depositedTo.equals("BANK")) {
            depositedTo = "CASH";
        }

        CashDeposit deposit = CashDeposit.builder()
                .id(UUID.randomUUID().toString())
                .tenant(tenant)
                .branch(branch)
                .source(dto.getSource())
                .amount(dto.getAmount())
                .date(dto.getDate() != null ? dto.getDate() : LocalDate.now())
                .description(dto.getDescription())
                .depositedTo(depositedTo)
                .build();

        deposit = cashDepositRepository.save(deposit);
        postDepositJournal(tenant, deposit);
        return deposit;
    }

    private void postDepositJournal(Tenant tenant, CashDeposit deposit) {
        try {
            Map<String, BigDecimal> debits = new HashMap<>();
            Map<String, BigDecimal> credits = new HashMap<>();

            String debitAccount = "CASH".equalsIgnoreCase(deposit.getDepositedTo())
                    ? "CASH_DRAWER"
                    : "BANK_ACCOUNT";
            debits.put(debitAccount, deposit.getAmount());

            String creditAccount = "CAPITAL_INJECTION_" + (deposit.getSource() != null
                    ? deposit.getSource().toUpperCase(Locale.ROOT)
                    : "GENERAL");
            credits.put(creditAccount, deposit.getAmount());

            ledgerService.postJournalEntry(
                    tenant,
                    "Cash Deposit: " + (deposit.getDescription() != null ? deposit.getDescription() : deposit.getSource()),
                    debits,
                    credits
            );
        } catch (Exception ex) {
            log.error("Failed to post cash deposit journal {}: {}", deposit.getId(), ex.getMessage());
        }
    }

    @Transactional(readOnly = true)
    public List<CashDeposit> getAllByTenant(String tenantId) {
        return cashDepositRepository.findByTenantIdOrderByDateDesc(tenantId);
    }

    @Transactional(readOnly = true)
    public List<CashDeposit> getByTenantAndDateRange(String tenantId, LocalDate from, LocalDate to) {
        return cashDepositRepository.findByTenantIdAndDateBetweenOrderByDateDesc(tenantId, from, to);
    }

    @Transactional(readOnly = true)
    public CashDeposit getById(String tenantId, String id) {
        return cashDepositRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Cash deposit not found: " + id));
    }

    public void deleteDeposit(String tenantId, String id) {
        CashDeposit deposit = cashDepositRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Cash deposit not found: " + id));
        cashDepositRepository.delete(deposit);
    }
}
