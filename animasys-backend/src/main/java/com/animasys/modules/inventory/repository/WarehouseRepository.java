package com.animasys.modules.inventory.repository;

import com.animasys.modules.inventory.domain.Warehouse;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface WarehouseRepository extends JpaRepository<Warehouse, String> {
    List<Warehouse> findByBranchId(String branchId);
}
