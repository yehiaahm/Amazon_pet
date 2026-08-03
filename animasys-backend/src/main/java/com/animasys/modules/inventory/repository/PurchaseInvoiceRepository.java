package com.animasys.modules.inventory.repository;

import com.animasys.modules.inventory.domain.PurchaseInvoice;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface PurchaseInvoiceRepository extends JpaRepository<PurchaseInvoice, String> {
    Optional<PurchaseInvoice> findByFingerprint(String fingerprint);

    @Query("SELECT pi FROM PurchaseInvoice pi JOIN pi.uploadedBy e WHERE e.tenant.id = :tenantId")
    List<PurchaseInvoice> findByUploadedByTenantId(@Param("tenantId") String tenantId);

    @Query("""
            SELECT pi FROM PurchaseInvoice pi JOIN pi.uploadedBy e
            WHERE pi.id = :id AND e.tenant.id = :tenantId
            """)
    Optional<PurchaseInvoice> findByIdAndUploadedByTenantId(
            @Param("id") String id,
            @Param("tenantId") String tenantId);
}
