package com.animasys.modules.sales.repository;

import com.animasys.modules.sales.domain.SaleItemBatchAllocation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface SaleItemBatchAllocationRepository extends JpaRepository<SaleItemBatchAllocation, String> {

    List<SaleItemBatchAllocation> findBySaleItemId(String saleItemId);

    List<SaleItemBatchAllocation> findByInventoryBatchId(String inventoryBatchId);
}
