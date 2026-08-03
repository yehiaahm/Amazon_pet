package com.animasys.modules.inventory.repository;

import com.animasys.modules.inventory.domain.BarcodeSequence;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import jakarta.persistence.LockModeType;
import java.util.Optional;

@Repository
public interface BarcodeSequenceRepository extends JpaRepository<BarcodeSequence, String> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM BarcodeSequence s WHERE s.tenantId = :tenantId")
    Optional<BarcodeSequence> findByTenantIdForUpdate(@Param("tenantId") String tenantId);
}
