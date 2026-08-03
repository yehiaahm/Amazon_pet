package com.animasys.modules.crm.repository;

import com.animasys.modules.crm.domain.BoardingReservation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface BoardingReservationRepository extends JpaRepository<BoardingReservation, String> {

    @Query("""
            SELECT DISTINCT r FROM BoardingReservation r
            LEFT JOIN FETCH r.pet p
            LEFT JOIN FETCH p.customer c
            WHERE c.tenant.id = :tenantId
            ORDER BY r.checkOutDate ASC
            """)
    List<BoardingReservation> findByTenantIdWithPetAndCustomer(@Param("tenantId") String tenantId);

    @Query("""
            SELECT r FROM BoardingReservation r
            LEFT JOIN FETCH r.pet p
            LEFT JOIN FETCH p.customer c
            WHERE r.id = :id AND c.tenant.id = :tenantId
            """)
    Optional<BoardingReservation> findByIdAndTenantIdWithPetAndCustomer(
            @Param("id") String id,
            @Param("tenantId") String tenantId);
}
