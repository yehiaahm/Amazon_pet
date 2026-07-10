package com.animasys.modules.inventory.repository;

import com.animasys.modules.inventory.domain.StockMovement;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface StockMovementRepository extends JpaRepository<StockMovement, String> {
    List<StockMovement> findByProductVariantId(String productVariantId);
    List<StockMovement> findByWarehouseId(String warehouseId);
}
