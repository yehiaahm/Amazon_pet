package com.animasys.modules.vaccination.repository;

import com.animasys.modules.vaccination.domain.VaccinationRecord;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface VaccinationRecordRepository extends JpaRepository<VaccinationRecord, String> {

    @Query("SELECT v FROM VaccinationRecord v JOIN FETCH v.pet p JOIN FETCH p.customer WHERE p.id = :petId")
    List<VaccinationRecord> findByPetId(@Param("petId") String petId);

    @Query("SELECT v FROM VaccinationRecord v JOIN FETCH v.pet p JOIN FETCH p.customer c WHERE c.tenant.id = :tenantId")
    List<VaccinationRecord> findByPetCustomerTenantId(@Param("tenantId") String tenantId);

    @Query("SELECT v FROM VaccinationRecord v JOIN FETCH v.pet p JOIN FETCH p.customer WHERE v.id = :id")
    Optional<VaccinationRecord> findByIdWithPetAndCustomer(@Param("id") String id);
}
