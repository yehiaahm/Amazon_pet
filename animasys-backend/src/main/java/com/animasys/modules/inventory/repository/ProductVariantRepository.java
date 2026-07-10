package com.animasys.modules.inventory.repository;

import com.animasys.modules.inventory.domain.ProductVariant;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface ProductVariantRepository extends JpaRepository<ProductVariant, String> {
    List<ProductVariant> findByProductId(String productId);
}
