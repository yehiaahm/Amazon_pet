package com.animasys.modules.inventory.importer.repository;

import com.animasys.modules.inventory.importer.domain.ImportSession;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ImportSessionRepository extends JpaRepository<ImportSession, String> {

    @Query("SELECT s FROM ImportSession s WHERE s.id = :id AND s.tenant.id = :tenantId")
    Optional<ImportSession> findByIdAndTenantId(@Param("id") String id, @Param("tenantId") String tenantId);

    List<ImportSession> findByTenantIdOrderByCreatedAtDesc(String tenantId);
}
