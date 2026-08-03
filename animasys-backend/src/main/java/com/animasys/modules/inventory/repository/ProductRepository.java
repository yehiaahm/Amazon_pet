package com.animasys.modules.inventory.repository;

import com.animasys.modules.inventory.domain.Product;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface ProductRepository extends JpaRepository<Product, String> {
    List<Product> findByTenantId(String tenantId);
    Optional<Product> findBySkuAndTenantId(String sku, String tenantId);

    @Query("SELECT p FROM Product p WHERE p.tenant.id = :tenantId AND UPPER(TRIM(p.sku)) = UPPER(TRIM(:sku))")
    Optional<Product> findBySkuIgnoreCaseAndTenantId(@Param("sku") String sku, @Param("tenantId") String tenantId);

    List<Product> findByNameIgnoreCaseAndTenantId(String name, String tenantId);

    @Query("SELECT p.tenant.id FROM Product p WHERE p.id = :id")
    String findTenantIdByProductId(@Param("id") String id);
}
