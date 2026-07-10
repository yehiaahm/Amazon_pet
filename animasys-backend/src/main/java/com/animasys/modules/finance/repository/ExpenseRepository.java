package com.animasys.modules.finance.repository;

import com.animasys.modules.finance.domain.Expense;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface ExpenseRepository extends JpaRepository<Expense, String> {
    List<Expense> findByTenantId(String tenantId);
    List<Expense> findByBranchId(String branchId);
}
