package com.animasys.modules.loyalty.repository;

import com.animasys.modules.loyalty.domain.LoyaltyAccount;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

public interface LoyaltyAccountRepository extends JpaRepository<LoyaltyAccount, String> {

    /** Row-locked lookup used by every balance mutation to prevent concurrent-terminal overspend. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT a FROM LoyaltyAccount a WHERE a.customerId = :customerId")
    Optional<LoyaltyAccount> findByCustomerIdForUpdate(@Param("customerId") String customerId);

    /** Tenant-wide current liability — null when the tenant has no accounts yet. */
    @Query("SELECT SUM(a.balance) FROM LoyaltyAccount a WHERE a.tenantId = :tenantId")
    BigDecimal sumBalanceByTenantId(@Param("tenantId") String tenantId);

    @Query("SELECT COUNT(a) FROM LoyaltyAccount a WHERE a.tenantId = :tenantId AND a.balance > 0")
    long countWithPositiveBalance(@Param("tenantId") String tenantId);

    /** Every tenant customer with their balance (null when they have no loyalty account row yet). */
    @Query("SELECT c.id, c.name, c.phone, a.balance FROM Customer c " +
            "LEFT JOIN LoyaltyAccount a ON a.customerId = c.id " +
            "WHERE c.tenant.id = :tenantId ORDER BY c.name ASC")
    List<Object[]> findAllCustomerBalances(@Param("tenantId") String tenantId);
}
