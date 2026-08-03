package com.animasys.modules.finance.repository;

import com.animasys.modules.finance.domain.Expense;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface ExpenseRepository extends JpaRepository<Expense, String> {

    Optional<Expense> findByIdAndTenantId(String id, String tenantId);

    List<Expense> findByTenantId(String tenantId);

    List<Expense> findByTenantIdOrderByDateDesc(String tenantId);

    List<Expense> findByTenantIdAndDateBetweenOrderByDateDesc(String tenantId, LocalDate from, LocalDate to);

    List<Expense> findByBranchIdAndDateBetween(String branchId, LocalDate from, LocalDate to);
    
    List<Expense> findByBranchId(String branchId);
}
