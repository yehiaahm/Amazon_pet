package com.animasys.modules.finance.repository;

import com.animasys.modules.finance.domain.DailyClosing;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface DailyClosingRepository extends JpaRepository<DailyClosing, String> {
    List<DailyClosing> findByBranchId(String branchId);
}
