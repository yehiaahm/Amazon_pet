package com.animasys.modules.inventory.repository;

import com.animasys.modules.inventory.domain.ProductVariant;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface ProductVariantRepository extends JpaRepository<ProductVariant, String>, JpaSpecificationExecutor<ProductVariant> {
    List<ProductVariant> findByProductId(String productId);

    @Query("SELECT v FROM ProductVariant v JOIN FETCH v.product WHERE v.id = :id")
    Optional<ProductVariant> findByIdWithProduct(@Param("id") String id);

    @Query("SELECT v FROM ProductVariant v JOIN FETCH v.product p WHERE p.tenant.id = :tenantId ORDER BY v.sku ASC, v.id ASC")
    List<ProductVariant> findAllByTenantIdWithProduct(@Param("tenantId") String tenantId);

    Optional<ProductVariant> findByBarcodeAndTenantId(String barcode, String tenantId);

    @Query("SELECT v FROM ProductVariant v JOIN FETCH v.product WHERE v.barcode = :barcode AND v.tenantId = :tenantId")
    Optional<ProductVariant> findByBarcodeAndTenantIdWithProduct(@Param("barcode") String barcode, @Param("tenantId") String tenantId);
}
