package com.animasys.modules.iam.repository;

import com.animasys.modules.iam.domain.Tenant;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.Optional;

@Repository
public interface TenantRepository extends JpaRepository<Tenant, String> {
    Optional<Tenant> findBySubdomain(String subdomain);
}
