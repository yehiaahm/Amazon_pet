package com.animasys.modules.finance.repository;

import com.animasys.modules.finance.domain.PurchaseInvoiceInstallment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface PurchaseInvoiceInstallmentRepository extends JpaRepository<PurchaseInvoiceInstallment, String> {

    List<PurchaseInvoiceInstallment> findByPurchaseInvoiceIdOrderByInstallmentNumberAsc(String purchaseInvoiceId);

    void deleteByPurchaseInvoiceId(String purchaseInvoiceId);

    @Query("""
            SELECT inst FROM PurchaseInvoiceInstallment inst
            JOIN inst.purchaseInvoice pi
            JOIN pi.uploadedBy e
            WHERE e.tenant.id = :tenantId
            AND inst.status IN ('PENDING', 'PARTIALLY_PAID')
            ORDER BY inst.dueDate ASC
            """)
    List<PurchaseInvoiceInstallment> findOpenByTenantOrderByDueDate(@Param("tenantId") String tenantId);

    @Query("""
            SELECT inst FROM PurchaseInvoiceInstallment inst
            JOIN inst.purchaseInvoice pi
            JOIN pi.uploadedBy e
            WHERE e.tenant.id = :tenantId
            ORDER BY inst.dueDate ASC
            """)
    List<PurchaseInvoiceInstallment> findAllByTenantOrderByDueDate(@Param("tenantId") String tenantId);
}
