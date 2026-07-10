package com.animasys.modules.services.repository;

import com.animasys.modules.services.domain.GroomingService;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface GroomingServiceRepository extends JpaRepository<GroomingService, String> {
    List<GroomingService> findByTenantId(String tenantId);
}
