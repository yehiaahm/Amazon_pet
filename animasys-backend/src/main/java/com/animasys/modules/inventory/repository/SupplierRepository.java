package com.animasys.modules.inventory.repository;

import com.animasys.modules.inventory.domain.Supplier;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface SupplierRepository extends JpaRepository<Supplier, String> {
    Optional<Supplier> findByIdAndTenantId(String id, String tenantId);

    List<Supplier> findByTenantId(String tenantId);
    Optional<Supplier> findByNameIgnoreCaseAndTenantId(String name, String tenantId);
    Optional<Supplier> findBySupplierCodeAndTenantId(String code, String tenantId);
}
