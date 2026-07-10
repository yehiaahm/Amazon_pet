package com.animasys.modules.sales.repository;

import com.animasys.modules.sales.domain.POSSession;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface POSSessionRepository extends JpaRepository<POSSession, String> {
    List<POSSession> findByBranchId(String branchId);
    Optional<POSSession> findByBranchIdAndStatus(String branchId, String status);
}
