package com.animasys.modules.inventory.repository;

import com.animasys.modules.inventory.domain.ProductBatch;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface ProductBatchRepository extends JpaRepository<ProductBatch, String> {
    List<ProductBatch> findByProductVariantId(String productVariantId);
}
