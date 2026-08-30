package com.animasys.modules.finance.repository;

import com.animasys.modules.finance.domain.Journal;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface JournalRepository extends JpaRepository<Journal, String> {
    List<Journal> findByTenantId(String tenantId);

    // NOTE: `tenant` is a @ManyToOne relation, not a flat column -- must navigate with the
    // underscore form (Journal has no `tenantId` attribute Spring Data's derivation can see).
    boolean existsByTenant_IdAndDescription(String tenantId, String description);
}
