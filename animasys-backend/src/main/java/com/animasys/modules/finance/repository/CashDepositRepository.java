package com.animasys.modules.finance.repository;

import com.animasys.modules.finance.domain.CashDeposit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface CashDepositRepository extends JpaRepository<CashDeposit, String> {

    Optional<CashDeposit> findByIdAndTenantId(String id, String tenantId);

    List<CashDeposit> findByTenantId(String tenantId);

    List<CashDeposit> findByTenantIdOrderByDateDesc(String tenantId);

    List<CashDeposit> findByTenantIdAndDateBetweenOrderByDateDesc(String tenantId, LocalDate from, LocalDate to);

    List<CashDeposit> findByBranchIdAndDateBetween(String branchId, LocalDate from, LocalDate to);

    List<CashDeposit> findByBranchId(String branchId);
}
