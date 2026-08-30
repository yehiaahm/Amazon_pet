package com.animasys.modules.inventory.repository;

import com.animasys.modules.inventory.domain.Brand;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface BrandRepository extends JpaRepository<Brand, String> {
    Optional<Brand> findByNameIgnoreCaseAndTenantId(String name, String tenantId);

    /** Fallback when a legacy global unique on name still exists. */
    Optional<Brand> findFirstByNameIgnoreCase(String name);
}
