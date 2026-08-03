package com.animasys.modules.inventory.repository;

import com.animasys.modules.inventory.domain.InventoryAdjustmentItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface InventoryAdjustmentItemRepository extends JpaRepository<InventoryAdjustmentItem, String> {
    List<InventoryAdjustmentItem> findByProductVariantId(String productVariantId);
}
