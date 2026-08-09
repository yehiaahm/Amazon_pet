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

    /**
     * Deliberately not tenant-scoped: SKU uniqueness is only guaranteed per-tenant by the
     * schema, but generated codes must never collide with any tenant's, so the sequence
     * this backs is computed against every tenant's SKUs, not just the current one.
     */
    @Query("SELECT p.sku FROM Product p WHERE p.sku LIKE CONCAT(:prefix, '%')")
    List<String> findSkusByPrefix(@Param("prefix") String prefix);
}
