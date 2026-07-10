package com.animasys.modules.sales.repository;

import com.animasys.modules.sales.domain.SaleItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface SaleItemRepository extends JpaRepository<SaleItem, String> {
}
