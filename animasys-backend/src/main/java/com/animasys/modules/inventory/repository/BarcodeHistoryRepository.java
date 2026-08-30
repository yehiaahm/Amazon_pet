package com.animasys.modules.inventory.repository;

import com.animasys.modules.inventory.domain.BarcodeHistory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface BarcodeHistoryRepository extends JpaRepository<BarcodeHistory, String> {
    List<BarcodeHistory> findByProductVariantIdOrderByGeneratedAtDesc(String productVariantId);
}
