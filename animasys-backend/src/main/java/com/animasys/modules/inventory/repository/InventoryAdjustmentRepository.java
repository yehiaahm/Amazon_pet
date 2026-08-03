package com.animasys.modules.inventory.repository;

import com.animasys.modules.inventory.domain.InventoryAdjustment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface InventoryAdjustmentRepository extends JpaRepository<InventoryAdjustment, String> {

    List<InventoryAdjustment> findByTenantIdOrderByCreatedAtDesc(String tenantId);

    List<InventoryAdjustment> findByTenantIdAndStatus(String tenantId, InventoryAdjustment.AdjustmentStatus status);
}
