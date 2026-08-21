package com.animasys.modules.loyalty.repository;

import com.animasys.modules.loyalty.domain.LoyaltyLedgerEntry;
import com.animasys.modules.loyalty.domain.LoyaltyLedgerType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;

public interface LoyaltyLedgerEntryRepository extends JpaRepository<LoyaltyLedgerEntry, String> {

    Page<LoyaltyLedgerEntry> findByCustomer_IdOrderByCreatedAtDesc(String customerId, Pageable pageable);

    List<LoyaltyLedgerEntry> findBySale_IdAndType(String saleId, LoyaltyLedgerType type);

    /** Oldest-first unexhausted earn lots for a customer, for both redemption FIFO consumption and expiry. */
    @Query("SELECT e FROM LoyaltyLedgerEntry e WHERE e.customer.id = :customerId AND e.type = 'EARNED' " +
            "AND e.remainingAmount > 0 ORDER BY e.createdAt ASC")
    List<LoyaltyLedgerEntry> findUnconsumedEarnedLotsFifo(@Param("customerId") String customerId);

    @Query("SELECT e FROM LoyaltyLedgerEntry e WHERE e.tenantId = :tenantId AND e.type = 'EARNED' " +
            "AND e.remainingAmount > 0 AND e.expiresAt <= :now ORDER BY e.createdAt ASC")
    List<LoyaltyLedgerEntry> findDueForExpiry(@Param("tenantId") String tenantId, @Param("now") Instant now);

    /** Tenant-wide all-time total per ledger type, for the loyalty dashboard's cost/liability breakdown. */
    @Query("SELECT e.type, SUM(e.amount) FROM LoyaltyLedgerEntry e WHERE e.tenantId = :tenantId GROUP BY e.type")
    List<Object[]> sumAmountByTypeForTenant(@Param("tenantId") String tenantId);
}
