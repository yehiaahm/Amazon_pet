package com.animasys.modules.inventory.repository;

import com.animasys.modules.inventory.domain.InventoryLedgerTransaction;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

@Repository
public interface InventoryLedgerTransactionRepository extends JpaRepository<InventoryLedgerTransaction, String> {

    List<InventoryLedgerTransaction> findByTenantIdAndProductVariantIdOrderByCreatedAtDesc(
        String tenantId, String productVariantId
    );

    List<InventoryLedgerTransaction> findByTenantIdOrderByCreatedAtDesc(String tenantId);

    List<InventoryLedgerTransaction> findByTenantIdAndCreatedAtBetweenOrderByCreatedAtDesc(
        String tenantId, Instant startDate, Instant endDate
    );

    List<InventoryLedgerTransaction> findByReferenceTypeAndReferenceId(
        String referenceType, String referenceId
    );

    List<InventoryLedgerTransaction> findByProductVariantId(String productVariantId);
}
