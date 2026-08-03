package com.animasys.modules.inventory.repository;

import com.animasys.modules.inventory.domain.WarehouseStock;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface WarehouseStockRepository extends JpaRepository<WarehouseStock, String> {

    Optional<WarehouseStock> findByWarehouseIdAndProductVariantId(String warehouseId, String productVariantId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT ws FROM WarehouseStock ws WHERE ws.warehouse.id = :warehouseId AND ws.productVariant.id = :variantId")
    Optional<WarehouseStock> findForUpdate(@Param("warehouseId") String warehouseId,
                                           @Param("variantId") String variantId);

    List<WarehouseStock> findByProductVariantId(String productVariantId);

    @Query("SELECT COALESCE(SUM(ws.quantity), 0) FROM WarehouseStock ws WHERE ws.productVariant.id = :variantId")
    int sumQuantityByVariantId(@Param("variantId") String variantId);
}
