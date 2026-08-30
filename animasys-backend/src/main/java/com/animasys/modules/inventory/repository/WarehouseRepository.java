package com.animasys.modules.inventory.repository;

import com.animasys.modules.inventory.domain.Warehouse;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface WarehouseRepository extends JpaRepository<Warehouse, String> {
    List<Warehouse> findByBranchId(String branchId);

    @Query("SELECT w FROM Warehouse w JOIN FETCH w.branch b WHERE b.tenant.id = :tenantId ORDER BY w.name")
    List<Warehouse> findByTenantId(@Param("tenantId") String tenantId);
}
