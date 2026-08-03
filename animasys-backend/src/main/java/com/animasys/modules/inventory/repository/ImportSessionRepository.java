package com.animasys.modules.inventory.repository;

import com.animasys.modules.inventory.domain.ImportSession;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface ImportSessionRepository extends JpaRepository<ImportSession, String> {
    List<ImportSession> findByFileHash(String fileHash);
    boolean existsByFileHashAndStatus(String fileHash, String status);

    @Query("""
            SELECT s FROM ImportSession s
            JOIN s.uploadedBy e
            WHERE e.tenant.id = :tenantId
            ORDER BY s.uploadedAt DESC
            """)
    List<ImportSession> findByUploadedByTenantId(@Param("tenantId") String tenantId);
}
