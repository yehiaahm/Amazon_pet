package com.animasys.modules.services.repository;

import com.animasys.modules.services.domain.Appointment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface AppointmentRepository extends JpaRepository<Appointment, String> {
    List<Appointment> findByEmployee_Id(String employeeId);

    @Query("""
            SELECT a FROM Appointment a
            JOIN FETCH a.pet p
            JOIN FETCH p.customer c
            WHERE c.tenant.id = :tenantId
            ORDER BY a.dateTime DESC
            """)
    List<Appointment> findByCustomerTenantId(@Param("tenantId") String tenantId);

    @Query("""
            SELECT a FROM Appointment a
            JOIN FETCH a.pet p
            JOIN FETCH p.customer c
            WHERE a.id = :id AND c.tenant.id = :tenantId
            """)
    Optional<Appointment> findByIdAndCustomerTenantId(@Param("id") String id, @Param("tenantId") String tenantId);
}
