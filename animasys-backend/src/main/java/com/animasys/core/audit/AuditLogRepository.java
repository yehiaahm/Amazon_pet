package com.animasys.core.audit;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface AuditLogRepository extends JpaRepository<AuditLog, String> {

    @Query("SELECT a FROM AuditLog a JOIN FETCH a.employee e WHERE e.tenant.id = :tenantId ORDER BY a.timestamp DESC")
    List<AuditLog> findByTenantId(@Param("tenantId") String tenantId);
}
