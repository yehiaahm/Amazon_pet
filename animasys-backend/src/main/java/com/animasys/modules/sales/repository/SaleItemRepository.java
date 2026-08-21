package com.animasys.modules.sales.repository;

import com.animasys.modules.sales.domain.SaleItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface SaleItemRepository extends JpaRepository<SaleItem, String> {
    List<SaleItem> findByItemId(String itemId);

    List<SaleItem> findBySale_IdIn(List<String> saleIds);
}
