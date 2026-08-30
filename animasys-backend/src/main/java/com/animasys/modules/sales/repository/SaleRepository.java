package com.animasys.modules.sales.repository;

import com.animasys.modules.sales.domain.Sale;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public interface SaleRepository extends JpaRepository<Sale, String>, JpaSpecificationExecutor<Sale> {
    List<Sale> findByPosSession_Id(String posSessionId);

    @Query("SELECT s FROM Sale s JOIN s.employee e WHERE e.tenant.id = :tenantId")
    List<Sale> findByTenantId(@Param("tenantId") String tenantId);

    /** Drives the journal-posting reconciliation job: every completed sale not yet POSTED. */
    List<Sale> findByStatusAndJournalStatusNot(String status, String journalStatus);

    @Query("""
            SELECT s FROM Sale s
            JOIN FETCH s.employee e
            LEFT JOIN FETCH s.items
            LEFT JOIN FETCH s.customer
            WHERE s.id = :id AND e.tenant.id = :tenantId
            """)
    Optional<Sale> findByIdAndTenantId(@Param("id") String id, @Param("tenantId") String tenantId);

    @Query("""
            SELECT s FROM Sale s JOIN s.employee e
            WHERE e.id = :employeeId AND e.tenant.id = :tenantId
              AND s.date >= :from AND s.date < :to
            ORDER BY s.date DESC
            """)
    List<Sale> findByEmployeeIdAndTenantIdAndDateRange(
            @Param("employeeId") String employeeId,
            @Param("tenantId") String tenantId,
            @Param("from") Instant from,
            @Param("to") Instant to);

    @Query("""
            SELECT s FROM Sale s
            JOIN FETCH s.employee e
            LEFT JOIN FETCH s.items
            WHERE s.customer.id = :customerId AND e.tenant.id = :tenantId
            ORDER BY s.date DESC
            """)
    List<Sale> findByCustomerIdAndTenantId(
            @Param("customerId") String customerId,
            @Param("tenantId") String tenantId);

    /** Legacy sales (created before the sale_payments table existed) that still have no tender row. */
    @Query("SELECT s FROM Sale s WHERE NOT EXISTS (SELECT 1 FROM SalePayment sp WHERE sp.sale = s)")
    List<Sale> findSalesMissingPayments();
}
